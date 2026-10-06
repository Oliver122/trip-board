import { createHash, randomBytes } from 'node:crypto'
import { inviteCodeFromPath, type MeResponse } from '@tripboard/shared'
import type { Pool, PoolClient } from 'pg'
import type { AppConfig } from '../config.js'
import {
  SEEN_INTERVAL,
  SESSION_TTL_MS,
  SLIDE_IF_REMAINING_UNDER_MS,
} from './cookies.js'
import { avatarUrl, type DiscordProfile } from './discord.js'

type Queryable = Pool | PoolClient

type UserRow = {
  id: string
  discord_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  locale: 'en' | 'de'
  app_role: 'user' | 'admin'
  suspended_at: Date | null
  suspended_reason: string | null
}

export type AuthSession = {
  user: MeResponse
  slid: boolean
}

export type LoginResult =
  | { kind: 'ok'; token: string; next: string }
  | { kind: 'suspended'; reason: string | null }
  | { kind: 'signups_disabled' }

const userColumns = `id, discord_id, username, display_name, avatar_url, locale, app_role, suspended_at, suspended_reason`

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function toMe(row: UserRow): MeResponse {
  return {
    id: row.id,
    discordId: row.discord_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    locale: row.locale,
    appRole: row.app_role,
  }
}

export async function loginWithDiscord(
  pool: Pool,
  config: AppConfig,
  profile: DiscordProfile,
  next: string,
  now: Date,
  userAgent: string | null,
): Promise<LoginResult> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query<UserRow>(
      `SELECT ${userColumns} FROM users WHERE discord_id = $1 FOR UPDATE`,
      [profile.id],
    )
    const current = existing.rows[0]
    const promote = config.adminDiscordIds.includes(profile.id)

    if (current?.suspended_at) {
      await client.query(
        `
        UPDATE users
        SET username = $2,
            display_name = $3,
            avatar_url = $4,
            app_role = CASE
              WHEN $5::bool OR app_role = 'admin' THEN 'admin'::app_role
              ELSE app_role
            END
        WHERE id = $1
        `,
        [
          current.id,
          profile.username,
          profile.globalName,
          avatarUrl(profile),
          promote,
        ],
      )
      await client.query('COMMIT')
      return { kind: 'suspended', reason: current.suspended_reason }
    }

    if (!current) {
      const allowed = await signupAllowed(client, config, profile.id, next, now)
      if (!allowed) {
        await client.query('ROLLBACK')
        return { kind: 'signups_disabled' }
      }
    }

    const saved = current
      ? await updateUser(client, current.id, profile, now, promote)
      : await insertUser(client, profile, now, promote)
    const token = await insertSession(client, saved.id, now, userAgent)
    await client.query(
      `
      INSERT INTO activity_events (actor_id, action, entity_id, metadata)
      VALUES ($1, 'user.login', $1, $2::jsonb)
      `,
      [saved.id, JSON.stringify({ username: saved.username })],
    )
    await client.query('COMMIT')
    return { kind: 'ok', token, next }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function signupAllowed(
  client: PoolClient,
  config: AppConfig,
  discordId: string,
  next: string,
  now: Date,
): Promise<boolean> {
  if (config.adminDiscordIds.includes(discordId)) return true
  const settings = await client.query<{ signups_enabled: boolean }>(
    'SELECT signups_enabled FROM app_settings WHERE id = true',
  )
  if (settings.rows[0]?.signups_enabled !== false) return true
  const code = inviteCodeFromPath(next)
  if (!code) return false
  const invite = await client.query(
    `
    SELECT 1
    FROM trip_invites
    WHERE code = $1 AND revoked_at IS NULL AND expires_at > $2
    LIMIT 1
    `,
    [code, now],
  )
  return (invite.rowCount ?? 0) > 0
}

async function insertUser(
  client: PoolClient,
  profile: DiscordProfile,
  now: Date,
  promote: boolean,
): Promise<UserRow> {
  const result = await client.query<UserRow>(
    `
    INSERT INTO users (discord_id, username, display_name, avatar_url, last_login_at, app_role)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING ${userColumns}
    `,
    [
      profile.id,
      profile.username,
      profile.globalName,
      avatarUrl(profile),
      now,
      promote ? 'admin' : 'user',
    ],
  )
  const row = result.rows[0]
  if (!row) throw new Error('user insert failed')
  return row
}

async function updateUser(
  client: PoolClient,
  id: string,
  profile: DiscordProfile,
  now: Date,
  promote: boolean,
): Promise<UserRow> {
  const result = await client.query<UserRow>(
    `
    UPDATE users
    SET username = $2,
        display_name = $3,
        avatar_url = $4,
        last_login_at = $5,
        app_role = CASE
          WHEN $6::bool OR app_role = 'admin' THEN 'admin'::app_role
          ELSE app_role
        END
    WHERE id = $1
    RETURNING ${userColumns}
    `,
    [
      id,
      profile.username,
      profile.globalName,
      avatarUrl(profile),
      now,
      promote,
    ],
  )
  const row = result.rows[0]
  if (!row) throw new Error('user update failed')
  return row
}

async function insertSession(
  client: Queryable,
  userId: string,
  now: Date,
  userAgent: string | null,
): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  await client.query(
    `
    INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [hashSessionToken(token), userId, now, expiresAt, userAgent],
  )
  return token
}

export async function authenticate(
  pool: Pool,
  token: string,
  now: Date,
): Promise<AuthSession | null> {
  if (token.length < 32 || token.length > 128) return null
  const id = hashSessionToken(token)
  const found = await pool.query<UserRow & { expires_at: Date }>(
    `
    SELECT s.expires_at, u.id, u.discord_id, u.username, u.display_name,
           u.avatar_url, u.locale, u.app_role, u.suspended_at, u.suspended_reason
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = $1
    `,
    [id],
  )
  const row = found.rows[0]
  if (!row) return null
  if (row.suspended_at || row.expires_at.getTime() <= now.getTime()) {
    await pool.query('DELETE FROM sessions WHERE id = $1', [id])
    return null
  }

  let slid = false
  const remaining = row.expires_at.getTime() - now.getTime()
  if (remaining < SLIDE_IF_REMAINING_UNDER_MS) {
    await pool.query('UPDATE sessions SET expires_at = $2 WHERE id = $1', [
      id,
      new Date(now.getTime() + SESSION_TTL_MS),
    ])
    slid = true
  }

  await pool.query(
    `
    UPDATE users
    SET last_seen_at = $2
    WHERE id = $1
      AND (last_seen_at IS NULL OR last_seen_at <= $2::timestamptz - $3::interval)
    `,
    [row.id, now, SEEN_INTERVAL],
  )

  return { user: toMe(row), slid }
}

export async function updateLocale(
  pool: Pool,
  userId: string,
  locale: 'en' | 'de',
  now: Date,
): Promise<MeResponse | null> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<UserRow>(
      `
      UPDATE users
      SET locale = $2
      WHERE id = $1
      RETURNING ${userColumns}
      `,
      [userId, locale],
    )
    const row = result.rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      return null
    }
    await client.query(
      `
      INSERT INTO activity_events (actor_id, action, entity_id, metadata, created_at)
      VALUES ($1, 'user.locale_update', $1, $2::jsonb, $3)
      `,
      [userId, JSON.stringify({ locale }), now],
    )
    await client.query('COMMIT')
    return toMe(row)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function deleteSession(
  pool: Pool,
  token: string,
): Promise<boolean> {
  if (token.length < 32 || token.length > 128) return false
  const result = await pool.query('DELETE FROM sessions WHERE id = $1', [
    hashSessionToken(token),
  ])
  return (result.rowCount ?? 0) > 0
}

export async function loginForTest(
  pool: Pool,
  discordId: string,
  now: Date,
  userAgent: string | null,
): Promise<
  | { kind: 'ok'; token: string; user: MeResponse }
  | { kind: 'suspended'; reason: string | null }
> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
      INSERT INTO users (discord_id, username)
      VALUES ($1, $2)
      ON CONFLICT (discord_id) DO NOTHING
      `,
      [discordId, `u${discordId}`],
    )
    const found = await client.query<UserRow>(
      `SELECT ${userColumns} FROM users WHERE discord_id = $1 FOR UPDATE`,
      [discordId],
    )
    const user = found.rows[0]
    if (!user) throw new Error('test user missing')
    if (user.suspended_at) {
      await client.query('COMMIT')
      return { kind: 'suspended', reason: user.suspended_reason }
    }
    const token = await insertSession(client, user.id, now, userAgent)
    await client.query('COMMIT')
    return { kind: 'ok', token, user: toMe(user) }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
