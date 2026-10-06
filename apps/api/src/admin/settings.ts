import type { Pool } from 'pg'
import { withTransaction } from '../db/transaction.js'
import { writeAudit } from './audit.js'
import { finishWrite, type AdminHooks } from './hooks.js'
import { num } from './page.js'

type SettingsRow = {
  default_max_images: number
  default_max_bytes: string | number
  db_capacity_bytes: string | number
  blob_capacity_bytes: string | number
  capacity_warn_pct: number
  uploads_enabled: boolean
  signups_enabled: boolean
}

export type SettingsInput = {
  defaultMaxImages?: number
  defaultMaxBytes?: number
  dbCapacityBytes?: number
  blobCapacityBytes?: number
  capacityWarnPct?: number
  uploadsEnabled?: boolean
  signupsEnabled?: boolean
}

function toSettings(row: SettingsRow) {
  return {
    defaultMaxImages: num(row.default_max_images),
    defaultMaxBytes: num(row.default_max_bytes),
    dbCapacityBytes: num(row.db_capacity_bytes),
    blobCapacityBytes: num(row.blob_capacity_bytes),
    capacityWarnPct: num(row.capacity_warn_pct),
    uploadsEnabled: row.uploads_enabled,
    signupsEnabled: row.signups_enabled,
  }
}

const settingsSql = `
  SELECT default_max_images, default_max_bytes, db_capacity_bytes, blob_capacity_bytes,
         capacity_warn_pct, uploads_enabled, signups_enabled
  FROM app_settings
  WHERE id = true
`

export async function readSettings(pool: Pool) {
  const result = await pool.query<SettingsRow>(settingsSql)
  const row = result.rows[0]
  if (!row) return null
  return toSettings(row)
}

export async function updateSettings(
  pool: Pool,
  adminId: string,
  input: SettingsInput,
  hooks: AdminHooks,
) {
  return withTransaction(pool, async (tx) => {
    const current = await tx.query<SettingsRow>(`${settingsSql} FOR UPDATE`)
    const beforeRow = current.rows[0]
    if (!beforeRow) return { ok: false as const, status: 404 }
    const before = toSettings(beforeRow)
    const after = { ...before, ...input }
    await tx.query(
      `
      UPDATE app_settings
      SET default_max_images = $1,
          default_max_bytes = $2,
          db_capacity_bytes = $3,
          blob_capacity_bytes = $4,
          capacity_warn_pct = $5,
          uploads_enabled = $6,
          signups_enabled = $7,
          updated_by = $8
      WHERE id = true
      `,
      [
        after.defaultMaxImages,
        after.defaultMaxBytes,
        after.dbCapacityBytes,
        after.blobCapacityBytes,
        after.capacityWarnPct,
        after.uploadsEnabled,
        after.signupsEnabled,
        adminId,
      ],
    )
    await writeAudit(tx, {
      adminId,
      action: 'settings.update',
      before,
      after,
    })
    await finishWrite(hooks)
    return { ok: true as const, settings: after }
  })
}
