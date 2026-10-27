import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'
const MiB = 1024 * 1024

describe('T-43-04 admin file size limit', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let counter = 0

  beforeAll(async () => {
    db = await createTestDatabase()
    app = await buildApp(db.pool, {
      config: loadConfig({
        DATABASE_URL: db.url,
        NODE_ENV: 'test',
        WEB_ORIGIN,
        S3_BUCKET: 'tripboard-test',
      }),
      now: () => new Date('2026-06-01T00:00:00.000Z'),
    })
  }, 60_000)

  afterAll(async () => {
    await app?.close()
    await db?.pool.end()
    await db?.drop()
  })

  beforeEach(async () => {
    await db.pool.query(`
      DELETE FROM admin_audit_log;
      DELETE FROM sessions;
      DELETE FROM users;
      UPDATE app_settings SET default_max_file_bytes = 10485760, updated_by = NULL;
    `)
  })

  it('rejects out-of-range values naming the field and changes nothing', async () => {
    const { admin, aiko } = await scene()
    for (const value of [0, 500_000, 60 * MiB, 1.5]) {
      const quota = await patch(admin, `/admin/users/${aiko.id}/quota`, {
        maxFileBytes: value,
      })
      expect(quota.statusCode, String(value)).toBe(400)
      expect(quota.json()).toMatchObject({
        error: 'invalid_request',
        fields: { maxFileBytes: 'invalid' },
      })
      const settings = await patch(admin, '/admin/settings', {
        defaultMaxFileBytes: value,
      })
      expect(settings.statusCode, String(value)).toBe(400)
      expect(settings.json()).toMatchObject({
        fields: { defaultMaxFileBytes: 'invalid' },
      })
    }
    const user = await db.pool.query(
      'SELECT max_file_bytes FROM users WHERE id = $1',
      [aiko.id],
    )
    expect(user.rows[0].max_file_bytes).toBeNull()
    const setting = await db.pool.query(
      'SELECT default_max_file_bytes FROM app_settings',
    )
    expect(Number(setting.rows[0].default_max_file_bytes)).toBe(10 * MiB)
    const audit = await db.pool.query(
      'SELECT count(*)::int AS n FROM admin_audit_log',
    )
    expect(audit.rows[0].n).toBe(0)
  })

  it('sets, shows and resets the override with audit before / after', async () => {
    const { admin, aiko } = await scene()

    const before = await detail(admin, aiko.id)
    expect(before).toMatchObject({
      maxFileBytes: 10 * MiB,
      maxFileBytesOverride: false,
      defaults: { maxFileBytes: 10 * MiB },
    })

    await db.pool.query(
      'UPDATE users SET max_images = 5, max_bytes = 5242880 WHERE id = $1',
      [aiko.id],
    )
    const set = await patch(admin, `/admin/users/${aiko.id}/quota`, {
      maxFileBytes: 20 * MiB,
      reason: 'Panorama shots',
    })
    expect(set.statusCode).toBe(200)
    expect(await detail(admin, aiko.id)).toMatchObject({
      maxFileBytes: 20 * MiB,
      maxFileBytesOverride: true,
      defaults: { maxFileBytes: 10 * MiB },
    })

    const reset = await patch(admin, `/admin/users/${aiko.id}/quota`, {
      reset: true,
    })
    expect(reset.statusCode).toBe(200)
    const row = await db.pool.query(
      'SELECT max_images, max_bytes, max_file_bytes FROM users WHERE id = $1',
      [aiko.id],
    )
    expect(row.rows[0]).toEqual({
      max_images: null,
      max_bytes: null,
      max_file_bytes: null,
    })
    expect(await detail(admin, aiko.id)).toMatchObject({
      maxFileBytes: 10 * MiB,
      maxFileBytesOverride: false,
    })

    const audit = await db.pool.query(
      `SELECT before, after, reason FROM admin_audit_log
       WHERE action = 'user.quota_update' ORDER BY created_at, id`,
    )
    expect(audit.rows).toHaveLength(2)
    expect(audit.rows[0].before).toMatchObject({ maxFileBytes: null })
    expect(audit.rows[0].after).toMatchObject({ maxFileBytes: 20 * MiB })
    expect(audit.rows[0].reason).toBe('Panorama shots')
    expect(audit.rows[1].before).toMatchObject({
      maxImages: 5,
      maxBytes: 5242880,
      maxFileBytes: 20 * MiB,
    })
    expect(audit.rows[1].after).toEqual({
      maxImages: null,
      maxBytes: null,
      maxFileBytes: null,
    })
  })

  it('reads and changes defaultMaxFileBytes with one audit row per change', async () => {
    const { admin } = await scene()
    const read = await app.inject({
      method: 'GET',
      url: '/admin/settings',
      headers: { cookie: admin.cookie },
    })
    expect(read.json()).toMatchObject({ defaultMaxFileBytes: 10 * MiB })

    const changed = await patch(admin, '/admin/settings', {
      defaultMaxFileBytes: 12 * MiB,
    })
    expect(changed.statusCode).toBe(200)
    expect(changed.json()).toMatchObject({ defaultMaxFileBytes: 12 * MiB })
    const audit = await db.pool.query(
      `SELECT before, after FROM admin_audit_log WHERE action = 'settings.update'`,
    )
    expect(audit.rows).toHaveLength(1)
    expect(audit.rows[0].before).toMatchObject({
      defaultMaxFileBytes: 10 * MiB,
    })
    expect(audit.rows[0].after).toMatchObject({ defaultMaxFileBytes: 12 * MiB })
  })

  async function scene() {
    const admin = await login()
    await db.pool.query(`UPDATE users SET app_role = 'admin' WHERE id = $1`, [
      admin.id,
    ])
    const aiko = await login()
    return { admin, aiko }
  }

  async function login() {
    counter += 1
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: {
        discordId: `1000000000005${String(counter).padStart(5, '0')}`,
      },
    })
    expect(response.statusCode).toBe(200)
    return {
      cookie: sessionCookie(response),
      id: (response.json() as { id: string }).id,
    }
  }

  function patch(
    admin: { cookie: string },
    url: string,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: 'PATCH',
      url,
      headers: {
        cookie: admin.cookie,
        origin: WEB_ORIGIN,
        'content-type': 'application/json',
      },
      payload,
    })
  }

  async function detail(admin: { cookie: string }, id: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/admin/users/${id}`,
      headers: { cookie: admin.cookie },
    })
    expect(response.statusCode).toBe(200)
    return response.json()
  }
})

function sessionCookie(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie']
  const cookies = Array.isArray(raw) ? raw : [String(raw)]
  const session = cookies.find((value) => value.startsWith('tb_session='))
  return (session ?? '').split(';')[0] ?? ''
}
