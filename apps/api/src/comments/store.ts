import {
  commentExcerpt,
  commentPageSize,
  newsLimit,
  type Comment,
  type CommentList,
  type News,
  type NewsEntry,
} from '@tripboard/shared'
import type { Pool, PoolClient } from 'pg'
import { activity } from '../activity/record.js'
import { withTransaction } from '../db/transaction.js'
import { requireTripRole } from '../trips/roles.js'

type Queryable = Pool | PoolClient

export type CommentFailure = { ok: false; status: 403 | 404 }

type CommentRow = {
  id: string
  body: string
  created_at: Date
  edited_at: Date | null
  author_id: string | null
  author_name: string | null
  author_avatar: string | null
}

const commentSelect = `
SELECT
  c.id,
  c.body,
  c.created_at,
  c.edited_at,
  c.author_id,
  COALESCE(u.display_name, u.username) AS author_name,
  u.avatar_url AS author_avatar
FROM spot_comments c
LEFT JOIN users u ON u.id = c.author_id
`

// Timestamps are stored at millisecond precision so that the createdAt a
// client receives compares exactly with last_read_at (R-24-22).
const nowMs = `date_trunc('milliseconds', clock_timestamp())`

/** Cursor = the createdAt and id of the last comment on the page. */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url')
}

export function decodeCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  const text = Buffer.from(cursor, 'base64url').toString('utf8')
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(
      text,
    )
  if (!match) return null
  return { createdAt: match[1]!, id: match[2]! }
}

function rowToComment(
  row: CommentRow,
  viewerId: string,
  role: string,
): Comment {
  const own = row.author_id === viewerId
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    editedAt: row.edited_at ? row.edited_at.toISOString() : null,
    author: row.author_id
      ? {
          id: row.author_id,
          displayName: row.author_name ?? '',
          avatarUrl: row.author_avatar,
        }
      : null,
    canEdit: own,
    canDelete: own || role === 'owner',
  }
}

export async function listComments(
  db: Queryable,
  spotId: string,
  userId: string,
  cursor: { createdAt: string; id: string } | null,
): Promise<{ ok: true; list: CommentList } | CommentFailure> {
  const spot = await spotTrip(db, spotId)
  if (!spot) return { ok: false, status: 404 }
  const access = await requireTripRole(db, spot.tripId, userId, 'visitor')
  if (!access.ok) return access
  const values: unknown[] = [spotId]
  let where = 'c.spot_id = $1'
  if (cursor) {
    values.push(cursor.createdAt, cursor.id)
    where += ` AND (c.created_at, c.id) > ($2::timestamptz, $3::uuid)`
  }
  values.push(commentPageSize + 1)
  const result = await db.query<CommentRow>(
    `${commentSelect} WHERE ${where} ORDER BY c.created_at, c.id LIMIT $${values.length}`,
    values,
  )
  const rows = result.rows
  const hasMore = rows.length > commentPageSize
  const page = hasMore ? rows.slice(0, commentPageSize) : rows
  const last = page.at(-1)
  return {
    ok: true,
    list: {
      comments: page.map((row) => rowToComment(row, userId, access.role)),
      nextCursor:
        hasMore && last ? encodeCursor(last.created_at, last.id) : null,
    },
  }
}

export async function createComment(
  pool: Pool,
  userId: string,
  spotId: string,
  body: string,
): Promise<{ ok: true; comment: Comment } | CommentFailure> {
  return withTransaction(pool, async (tx) => {
    const spot = await spotTrip(tx, spotId)
    if (!spot) return { ok: false as const, status: 404 as const }
    const access = await requireTripRole(tx, spot.tripId, userId, 'visitor')
    if (!access.ok) return access
    const inserted = await tx.query<CommentRow>(
      `
      INSERT INTO spot_comments (trip_id, spot_id, author_id, body, created_at)
      VALUES ($1, $2, $3, $4, ${nowMs})
      RETURNING id, body, created_at, edited_at, author_id
      `,
      [spot.tripId, spotId, userId, body],
    )
    const row = inserted.rows[0]
    if (!row) throw new Error('comment insert failed')
    await activity.record(tx, {
      actor: userId,
      trip: spot.tripId,
      action: 'comment.create',
      entityId: spotId,
      resource: 'comment',
      metadata: { trip: spot.tripName, spot: spot.title },
    })
    const author = await authorName(tx, userId)
    return {
      ok: true,
      comment: rowToComment(
        { ...row, author_name: author.name, author_avatar: author.avatar },
        userId,
        access.role,
      ),
    }
  })
}

export async function updateComment(
  pool: Pool,
  userId: string,
  commentId: string,
  body: string,
): Promise<{ ok: true; comment: Comment } | CommentFailure> {
  return withTransaction(pool, async (tx) => {
    const target = await commentTarget(tx, commentId)
    if (!target) return { ok: false as const, status: 404 as const }
    const access = await requireTripRole(tx, target.tripId, userId, 'visitor')
    if (!access.ok) return access
    if (target.authorId !== userId) {
      return { ok: false as const, status: 403 as const }
    }
    const updated = await tx.query<CommentRow>(
      `
      UPDATE spot_comments
      SET body = $2, edited_at = ${nowMs}
      WHERE id = $1
      RETURNING id, body, created_at, edited_at, author_id
      `,
      [commentId, body],
    )
    const row = updated.rows[0]
    if (!row) throw new Error('comment vanished during update')
    await activity.record(tx, {
      actor: userId,
      trip: target.tripId,
      action: 'comment.update',
      entityId: target.spotId,
      resource: 'comment',
      metadata: { trip: target.tripName, spot: target.spotTitle },
    })
    const author = await authorName(tx, userId)
    return {
      ok: true,
      comment: rowToComment(
        { ...row, author_name: author.name, author_avatar: author.avatar },
        userId,
        access.role,
      ),
    }
  })
}

export async function deleteComment(
  pool: Pool,
  userId: string,
  commentId: string,
): Promise<{ ok: true } | CommentFailure> {
  return withTransaction(pool, async (tx) => {
    const target = await commentTarget(tx, commentId)
    if (!target) return { ok: false as const, status: 404 as const }
    const access = await requireTripRole(tx, target.tripId, userId, 'visitor')
    if (!access.ok) return access
    const own = target.authorId === userId
    if (!own && access.role !== 'owner') {
      return { ok: false as const, status: 403 as const }
    }
    const metadata: Record<string, unknown> = {
      trip: target.tripName,
      spot: target.spotTitle,
    }
    if (!own) {
      metadata.author = target.authorId
        ? (await authorName(tx, target.authorId)).name
        : null
    }
    await activity.record(tx, {
      actor: userId,
      trip: target.tripId,
      action: 'comment.delete',
      entityId: target.spotId,
      resource: 'comment',
      metadata,
    })
    await tx.query('DELETE FROM spot_comments WHERE id = $1', [commentId])
    return { ok: true }
  })
}

export async function listNews(
  db: Queryable,
  tripId: string,
  userId: string,
): Promise<{ ok: true; news: News } | CommentFailure> {
  const access = await requireTripRole(db, tripId, userId, 'visitor')
  if (!access.ok) return access
  const unread = `
    WITH unread AS (
      SELECT c.id, c.spot_id, c.author_id, c.body, c.created_at
      FROM spot_comments c
      JOIN trip_members tm ON tm.trip_id = c.trip_id AND tm.user_id = $2
      LEFT JOIN spot_comment_reads r ON r.user_id = $2 AND r.spot_id = c.spot_id
      WHERE c.trip_id = $1
        AND c.author_id IS DISTINCT FROM $2
        AND c.created_at > tm.joined_at
        AND (r.last_read_at IS NULL OR c.created_at > r.last_read_at)
    )
  `
  const totals = await db.query<{ total: number }>(
    `${unread} SELECT count(*)::int AS total FROM unread`,
    [tripId, userId],
  )
  const result = await db.query<{
    id: string
    title: string
    display_category: NewsEntry['displayCategory']
    unread_count: number
    body: string
    created_at: Date
    author_id: string | null
    author_name: string | null
    author_avatar: string | null
  }>(
    `
    ${unread},
    per_spot AS (
      SELECT spot_id, count(*)::int AS unread_count, max(created_at) AS newest_at
      FROM unread
      GROUP BY spot_id
    )
    SELECT
      s.id,
      s.title,
      s.display_category::text AS display_category,
      p.unread_count,
      n.body,
      n.created_at,
      n.author_id,
      COALESCE(a.display_name, a.username) AS author_name,
      a.avatar_url AS author_avatar
    FROM per_spot p
    JOIN spots_view s ON s.id = p.spot_id
    JOIN LATERAL (
      SELECT body, created_at, author_id
      FROM unread u
      WHERE u.spot_id = p.spot_id
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT 1
    ) n ON true
    LEFT JOIN users a ON a.id = n.author_id
    ORDER BY p.newest_at DESC, s.id
    LIMIT $3
    `,
    [tripId, userId, newsLimit],
  )
  return {
    ok: true,
    news: {
      total: Number(totals.rows[0]?.total ?? 0),
      entries: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        displayCategory: row.display_category,
        unreadComments: Number(row.unread_count),
        author: row.author_id
          ? {
              id: row.author_id,
              displayName: row.author_name ?? '',
              avatarUrl: row.author_avatar,
            }
          : null,
        createdAt: row.created_at.toISOString(),
        excerpt: commentExcerpt(row.body),
      })),
    },
  }
}

/**
 * Moves last_read_at forward to `upTo`, never past now and never backwards.
 * Records no activity event and sends no live event (R-24-23).
 */
export async function markSpotRead(
  pool: Pool,
  userId: string,
  spotId: string,
  upTo: string,
): Promise<{ ok: true } | CommentFailure> {
  const spot = await spotTrip(pool, spotId)
  if (!spot) return { ok: false, status: 404 }
  const access = await requireTripRole(pool, spot.tripId, userId, 'visitor')
  if (!access.ok) return access
  await pool.query(
    `
    INSERT INTO spot_comment_reads (user_id, trip_id, spot_id, last_read_at)
    VALUES ($1, $2, $3, LEAST($4::timestamptz, clock_timestamp()))
    ON CONFLICT (user_id, spot_id) DO UPDATE
      SET last_read_at = GREATEST(spot_comment_reads.last_read_at, EXCLUDED.last_read_at)
    `,
    [userId, spot.tripId, spotId, upTo],
  )
  return { ok: true }
}

/** Marks every spot of the trip that has comments as read up to now. */
export async function markTripRead(
  pool: Pool,
  userId: string,
  tripId: string,
): Promise<{ ok: true } | CommentFailure> {
  const access = await requireTripRole(pool, tripId, userId, 'visitor')
  if (!access.ok) return access
  await pool.query(
    `
    INSERT INTO spot_comment_reads (user_id, trip_id, spot_id, last_read_at)
    SELECT $1, s.trip_id, s.id, ${nowMs}
    FROM spots s
    WHERE s.trip_id = $2
      AND EXISTS (SELECT 1 FROM spot_comments c WHERE c.spot_id = s.id)
    ON CONFLICT (user_id, spot_id) DO UPDATE
      SET last_read_at = GREATEST(spot_comment_reads.last_read_at, EXCLUDED.last_read_at)
    `,
    [userId, tripId],
  )
  return { ok: true }
}

async function spotTrip(
  db: Queryable,
  spotId: string,
): Promise<{ tripId: string; tripName: string; title: string } | null> {
  const result = await db.query<{
    trip_id: string
    trip_name: string
    title: string
  }>(
    `
    SELECT s.trip_id, t.name AS trip_name, s.title
    FROM spots s
    JOIN trips t ON t.id = s.trip_id
    WHERE s.id = $1
    `,
    [spotId],
  )
  const row = result.rows[0]
  if (!row) return null
  return { tripId: row.trip_id, tripName: row.trip_name, title: row.title }
}

async function commentTarget(db: Queryable, commentId: string) {
  const result = await db.query<{
    spot_id: string
    trip_id: string
    author_id: string | null
    spot_title: string
    trip_name: string
  }>(
    `
    SELECT c.spot_id, c.trip_id, c.author_id, s.title AS spot_title, t.name AS trip_name
    FROM spot_comments c
    JOIN spots s ON s.id = c.spot_id
    JOIN trips t ON t.id = c.trip_id
    WHERE c.id = $1
    `,
    [commentId],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    spotId: row.spot_id,
    tripId: row.trip_id,
    authorId: row.author_id,
    spotTitle: row.spot_title,
    tripName: row.trip_name,
  }
}

async function authorName(
  db: Queryable,
  userId: string,
): Promise<{ name: string; avatar: string | null }> {
  const result = await db.query<{ name: string; avatar: string | null }>(
    `SELECT COALESCE(display_name, username) AS name, avatar_url AS avatar FROM users WHERE id = $1`,
    [userId],
  )
  return result.rows[0] ?? { name: '', avatar: null }
}
