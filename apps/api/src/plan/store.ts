import {
  planEntryErrors,
  planEntrySchema,
  planEntryUpdateSchema,
  planLinkSchema,
  planListSchema,
  normalizePlanDraft,
  outsideVisitMessage,
  spotPlanSchema,
  type AddPlanSpot,
  type CreatePlanEntry,
  type PatchPlanEntry,
  type PatchPlanSpot,
  type PlanDraft,
  type PlanEntry,
  type PlanEntryUpdate,
  type PlanLink,
  type SpotPlan,
} from '@tripboard/shared'
import type { Pool, PoolClient } from 'pg'
import { activity } from '../activity/record.js'
import { withTransaction } from '../db/transaction.js'
import { isCheckViolation } from '../http/validate.js'
import { requireTripRole } from '../trips/roles.js'

type Queryable = Pool | PoolClient

type EntryRow = {
  id: string
  trip_id: string
  type: 'bucket' | 'single'
  title: string
  start_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  info: string | null
  sort_order: number
  trip_start: string | null
  trip_end: string | null
  spots: unknown
}

type CurrentEntry = {
  type: 'bucket' | 'single'
  title: string
  start_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  info: string | null
  sort_order: number
}

export type PlanFailure =
  | {
      ok: false
      status: 400
      fields: Record<string, string>
      message?: string
    }
  | { ok: false; status: 403 | 404 }

const entrySelect = `
SELECT
  pe.id,
  pe.trip_id,
  pe.type,
  pe.title,
  pe.start_date::text AS start_date,
  pe.end_date::text AS end_date,
  to_char(pe.start_time, 'HH24:MI') AS start_time,
  to_char(pe.end_time, 'HH24:MI') AS end_time,
  pe.info,
  pe.sort_order,
  t.start_date::text AS trip_start,
  t.end_date::text AS trip_end,
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', pes.id,
        'spotId', pes.spot_id,
        'title', s.title,
        'visitDate', pes.visit_date::text,
        'visitTime', to_char(pes.visit_time, 'HH24:MI'),
        'info', pes.info,
        'sortOrder', pes.sort_order
      )
      ORDER BY pes.sort_order, pes.id
    )
    FROM plan_entry_spots pes
    JOIN spots s ON s.id = pes.spot_id
    WHERE pes.plan_entry_id = pe.id
  ), '[]'::json) AS spots
FROM plan_entries pe
JOIN trips t ON t.id = pe.trip_id
`

export async function listPlan(
  db: Queryable,
  tripId: string,
  userId: string,
): Promise<
  { ok: true; entries: PlanEntry[] } | { ok: false; status: 403 | 404 }
> {
  const access = await requireTripRole(db, tripId, userId, 'visitor')
  if (!access.ok) return access
  const result = await db.query<EntryRow>(
    `${entrySelect}
     WHERE pe.trip_id = $1
     ORDER BY pe.start_date, pe.start_time NULLS LAST, pe.sort_order, pe.id`,
    [tripId],
  )
  return {
    ok: true,
    entries: planListSchema.parse({ entries: result.rows.map(rowToEntry) })
      .entries,
  }
}

export async function createPlanEntry(
  pool: Pool,
  userId: string,
  tripId: string,
  input: CreatePlanEntry,
): Promise<{ ok: true; entry: PlanEntry } | PlanFailure> {
  return write(() =>
    withTransaction(pool, async (tx) => {
      const access = await requireTripRole(tx, tripId, userId, 'planner')
      if (!access.ok) return access
      const fields = planEntryErrors(input)
      if (Object.keys(fields).length > 0) {
        return { ok: false as const, status: 400 as const, fields }
      }
      const inserted = await tx.query<{ id: string }>(
        `
        INSERT INTO plan_entries (
          trip_id, type, title, start_date, end_date, start_time, end_time, info, created_by
        )
        VALUES ($1, $2::plan_entry_type, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
        `,
        [
          tripId,
          input.type,
          input.title,
          input.startDate,
          input.endDate,
          input.startTime,
          input.endTime,
          input.info,
          userId,
        ],
      )
      const id = inserted.rows[0]?.id
      if (!id) throw new Error('plan insert failed')
      await activity.record(tx, {
        actor: userId,
        trip: tripId,
        action: 'plan.create',
        entityId: id,
        metadata: { plan: input.title },
      })
      return { ok: true as const, entry: await fetchEntry(tx, id) }
    }),
  )
}

export async function updatePlanEntry(
  pool: Pool,
  userId: string,
  entryId: string,
  patch: PatchPlanEntry,
): Promise<{ ok: true; entry: PlanEntryUpdate } | PlanFailure> {
  return write(() =>
    withTransaction(pool, async (tx) => {
      const locked = await lockEntry(tx, entryId, userId, 'planner')
      if (!locked.ok) return locked
      const current = await loadCurrent(tx, entryId)
      if (!current) return { ok: false as const, status: 404 as const }
      const merged = mergeEntry(current, patch)
      if (!merged.ok) return merged
      let cleared = 0
      const datesChanged =
        merged.draft.startDate !== current.start_date ||
        merged.draft.endDate !== current.end_date
      if (datesChanged) {
        const counted = await tx.query<{ n: number }>(
          `
          SELECT count(*)::int AS n
          FROM plan_entry_spots
          WHERE plan_entry_id = $1
            AND visit_date IS NOT NULL
            AND (
              visit_date < $2::date
              OR visit_date > COALESCE($3::date, $2::date)
            )
          `,
          [entryId, merged.draft.startDate, merged.draft.endDate],
        )
        cleared = counted.rows[0]?.n ?? 0
      }
      await tx.query(
        `
        UPDATE plan_entries
        SET type = $2::plan_entry_type,
            title = $3,
            start_date = $4,
            end_date = $5,
            start_time = $6,
            end_time = $7,
            info = $8,
            sort_order = $9
        WHERE id = $1
        `,
        [
          entryId,
          merged.draft.type,
          merged.draft.title,
          merged.draft.startDate,
          merged.draft.endDate,
          merged.draft.startTime,
          merged.draft.endTime,
          merged.draft.info,
          merged.sortOrder,
        ],
      )
      await activity.record(tx, {
        actor: userId,
        trip: locked.tripId,
        action: 'plan.update',
        entityId: entryId,
        metadata: { plan: merged.draft.title },
      })
      const entry = await fetchEntry(tx, entryId)
      return {
        ok: true as const,
        entry: planEntryUpdateSchema.parse({
          ...entry,
          clearedVisitDates: cleared,
        }),
      }
    }),
  )
}

export async function deletePlanEntry(
  pool: Pool,
  userId: string,
  entryId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
  return withTransaction(pool, async (tx) => {
    const locked = await lockEntry(tx, entryId, userId, 'planner')
    if (!locked.ok) return locked
    const current = await tx.query<{ title: string }>(
      'SELECT title FROM plan_entries WHERE id = $1',
      [entryId],
    )
    const title = current.rows[0]?.title
    if (!title) return { ok: false, status: 404 }
    await activity.record(tx, {
      actor: userId,
      trip: locked.tripId,
      action: 'plan.delete',
      entityId: entryId,
      metadata: { plan: title },
    })
    await tx.query('DELETE FROM plan_entries WHERE id = $1', [entryId])
    return { ok: true }
  })
}

export async function addPlanSpot(
  pool: Pool,
  userId: string,
  entryId: string,
  input: AddPlanSpot,
): Promise<{ ok: true; link: PlanLink } | PlanFailure> {
  return write(() =>
    withTransaction(pool, async (tx) => {
      const locked = await lockEntry(tx, entryId, userId, 'planner')
      if (!locked.ok) return locked
      const entry = await loadCurrent(tx, entryId)
      if (!entry) return { ok: false as const, status: 404 as const }
      const spot = await tx.query<{ trip_id: string; title: string }>(
        'SELECT trip_id, title FROM spots WHERE id = $1',
        [input.spotId],
      )
      const spotRow = spot.rows[0]
      if (!spotRow || spotRow.trip_id !== locked.tripId) {
        return { ok: false as const, status: 404 as const }
      }
      const visit = visitError(input.visitDate, entry)
      if (visit) return visit
      const next = await tx.query<{ n: number }>(
        `
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS n
        FROM plan_entry_spots
        WHERE plan_entry_id = $1
        `,
        [entryId],
      )
      const inserted = await tx.query<{ id: string }>(
        `
        INSERT INTO plan_entry_spots (
          trip_id, plan_entry_id, spot_id, visit_date, visit_time, info, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        `,
        [
          locked.tripId,
          entryId,
          input.spotId,
          input.visitDate,
          input.visitTime,
          input.info,
          next.rows[0]?.n ?? 0,
        ],
      )
      const id = inserted.rows[0]?.id
      if (!id) throw new Error('plan link insert failed')
      await activity.record(tx, {
        actor: userId,
        trip: locked.tripId,
        action: 'plan.spot_add',
        entityId: id,
        metadata: { plan: entry.title, spot: spotRow.title },
      })
      return { ok: true as const, link: await fetchLink(tx, id) }
    }),
  )
}

export async function updatePlanSpot(
  pool: Pool,
  userId: string,
  entryId: string,
  linkId: string,
  patch: PatchPlanSpot,
): Promise<{ ok: true; link: PlanLink } | PlanFailure> {
  return write(() =>
    withTransaction(pool, async (tx) => {
      const locked = await lockEntry(tx, entryId, userId, 'planner')
      if (!locked.ok) return locked
      const entry = await loadCurrent(tx, entryId)
      if (!entry) return { ok: false as const, status: 404 as const }
      const current = await tx.query<{
        visit_date: string | null
        visit_time: string | null
        info: string | null
      }>(
        `
        SELECT
          visit_date::text AS visit_date,
          to_char(visit_time, 'HH24:MI') AS visit_time,
          info
        FROM plan_entry_spots
        WHERE id = $1 AND plan_entry_id = $2
        `,
        [linkId, entryId],
      )
      const link = current.rows[0]
      if (!link) return { ok: false as const, status: 404 as const }
      const visitDate =
        patch.visitDate !== undefined ? patch.visitDate : link.visit_date
      let visitTime =
        patch.visitTime !== undefined ? patch.visitTime : link.visit_time
      if (!visitDate) visitTime = null
      if (visitTime && !visitDate) {
        return {
          ok: false as const,
          status: 400 as const,
          fields: { visitTime: 'visit_time_needs_date' },
        }
      }
      const visit = visitError(visitDate, entry)
      if (visit) return visit
      const info = patch.info !== undefined ? patch.info : link.info
      await tx.query(
        `
        UPDATE plan_entry_spots
        SET visit_date = $3, visit_time = $4, info = $5
        WHERE id = $1 AND plan_entry_id = $2
        `,
        [linkId, entryId, visitDate, visitTime, info],
      )
      await activity.record(tx, {
        actor: userId,
        trip: locked.tripId,
        action: 'plan.update',
        entityId: entryId,
        metadata: { plan: entry.title },
      })
      return { ok: true as const, link: await fetchLink(tx, linkId) }
    }),
  )
}

export async function removePlanSpot(
  pool: Pool,
  userId: string,
  entryId: string,
  linkId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
  return withTransaction(pool, async (tx) => {
    const locked = await lockEntry(tx, entryId, userId, 'planner')
    if (!locked.ok) return locked
    const current = await tx.query<{ plan_title: string; spot_title: string }>(
      `
      SELECT pe.title AS plan_title, s.title AS spot_title
      FROM plan_entry_spots pes
      JOIN plan_entries pe ON pe.id = pes.plan_entry_id
      JOIN spots s ON s.id = pes.spot_id
      WHERE pes.id = $1 AND pes.plan_entry_id = $2
      `,
      [linkId, entryId],
    )
    const row = current.rows[0]
    if (!row) return { ok: false, status: 404 }
    await activity.record(tx, {
      actor: userId,
      trip: locked.tripId,
      action: 'plan.spot_remove',
      entityId: linkId,
      metadata: { plan: row.plan_title, spot: row.spot_title },
    })
    await tx.query(
      'DELETE FROM plan_entry_spots WHERE id = $1 AND plan_entry_id = $2',
      [linkId, entryId],
    )
    return { ok: true }
  })
}

export async function reorderPlanSpots(
  pool: Pool,
  userId: string,
  entryId: string,
  linkIds: string[],
): Promise<{ ok: true; entry: PlanEntry } | PlanFailure> {
  return write(() =>
    withTransaction(pool, async (tx) => {
      const locked = await lockEntry(tx, entryId, userId, 'planner')
      if (!locked.ok) return locked
      const existing = await tx.query<{ id: string }>(
        'SELECT id FROM plan_entry_spots WHERE plan_entry_id = $1',
        [entryId],
      )
      const owned = new Set(existing.rows.map((row) => row.id))
      if (new Set(linkIds).size !== linkIds.length) {
        return {
          ok: false as const,
          status: 400 as const,
          fields: { linkIds: 'invalid' },
        }
      }
      const missing = linkIds.filter((id) => !owned.has(id))
      if (missing.length > 0) {
        const found = await tx.query<{ plan_entry_id: string }>(
          'SELECT plan_entry_id FROM plan_entry_spots WHERE id = ANY($1::uuid[])',
          [missing],
        )
        const other = found.rows.some((row) => row.plan_entry_id !== entryId)
        return {
          ok: false as const,
          status: 400 as const,
          fields: { linkIds: other ? 'other_entry' : 'invalid' },
        }
      }
      if (owned.size !== linkIds.length) {
        return {
          ok: false as const,
          status: 400 as const,
          fields: { linkIds: 'incomplete' },
        }
      }
      if (linkIds.length > 0) {
        await tx.query(
          `
          UPDATE plan_entry_spots AS pes
          SET sort_order = ordered.ord - 1
          FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered(id, ord)
          WHERE pes.plan_entry_id = $1 AND pes.id = ordered.id
          `,
          [entryId, linkIds],
        )
      }
      const entry = await fetchEntry(tx, entryId)
      await activity.record(tx, {
        actor: userId,
        trip: locked.tripId,
        action: 'plan.update',
        entityId: entryId,
        metadata: { plan: entry.title },
      })
      return { ok: true as const, entry }
    }),
  )
}

export async function listSpotPlans(
  db: Queryable,
  spotId: string,
): Promise<SpotPlan[]> {
  const result = await db.query<{
    link_id: string
    entry_id: string
    title: string
    type: 'bucket' | 'single'
    visit_date: string | null
    visit_time: string | null
  }>(
    `
    SELECT
      pes.id AS link_id,
      pe.id AS entry_id,
      pe.title,
      pe.type,
      pes.visit_date::text AS visit_date,
      to_char(pes.visit_time, 'HH24:MI') AS visit_time
    FROM plan_entry_spots pes
    JOIN plan_entries pe ON pe.id = pes.plan_entry_id
    WHERE pes.spot_id = $1
    ORDER BY pe.start_date, pe.start_time NULLS LAST,
             pes.visit_date NULLS LAST, pes.sort_order, pes.id
    `,
    [spotId],
  )
  return result.rows.map((row) =>
    spotPlanSchema.parse({
      linkId: row.link_id,
      entryId: row.entry_id,
      title: row.title,
      type: row.type,
      visitDate: row.visit_date,
      visitTime: row.visit_time,
    }),
  )
}

async function fetchEntry(db: Queryable, entryId: string): Promise<PlanEntry> {
  const result = await db.query<EntryRow>(`${entrySelect} WHERE pe.id = $1`, [
    entryId,
  ])
  const row = result.rows[0]
  if (!row) throw new Error('plan entry missing')
  return rowToEntry(row)
}

async function fetchLink(db: Queryable, linkId: string): Promise<PlanLink> {
  const result = await db.query<{
    id: string
    spot_id: string
    title: string
    visit_date: string | null
    visit_time: string | null
    info: string | null
    sort_order: number
  }>(
    `
    SELECT
      pes.id,
      pes.spot_id,
      s.title,
      pes.visit_date::text AS visit_date,
      to_char(pes.visit_time, 'HH24:MI') AS visit_time,
      pes.info,
      pes.sort_order
    FROM plan_entry_spots pes
    JOIN spots s ON s.id = pes.spot_id
    WHERE pes.id = $1
    `,
    [linkId],
  )
  const row = result.rows[0]
  if (!row) throw new Error('plan link missing')
  return planLinkSchema.parse({
    id: row.id,
    spotId: row.spot_id,
    title: row.title,
    visitDate: row.visit_date,
    visitTime: row.visit_time,
    info: row.info,
    sortOrder: row.sort_order,
  })
}

async function loadCurrent(
  db: Queryable,
  entryId: string,
): Promise<CurrentEntry | null> {
  const result = await db.query<CurrentEntry>(
    `
    SELECT
      type,
      title,
      start_date::text AS start_date,
      end_date::text AS end_date,
      to_char(start_time, 'HH24:MI') AS start_time,
      to_char(end_time, 'HH24:MI') AS end_time,
      info,
      sort_order
    FROM plan_entries
    WHERE id = $1
    `,
    [entryId],
  )
  return result.rows[0] ?? null
}

async function lockEntry(
  tx: PoolClient,
  entryId: string,
  userId: string,
  min: 'visitor' | 'planner' | 'owner',
): Promise<{ ok: true; tripId: string } | { ok: false; status: 403 | 404 }> {
  const found = await tx.query<{ trip_id: string }>(
    'SELECT trip_id FROM plan_entries WHERE id = $1',
    [entryId],
  )
  const tripId = found.rows[0]?.trip_id
  if (!tripId) return { ok: false, status: 404 }
  const access = await requireTripRole(tx, tripId, userId, min)
  if (!access.ok) return access
  await tx.query('SELECT id FROM plan_entries WHERE id = $1 FOR UPDATE', [
    entryId,
  ])
  return { ok: true, tripId }
}

function mergeEntry(
  current: CurrentEntry,
  patch: PatchPlanEntry,
):
  | { ok: true; draft: PlanDraft; sortOrder: number }
  | { ok: false; status: 400; fields: Record<string, string> } {
  if (
    patch.date !== undefined &&
    patch.startDate != null &&
    patch.date !== patch.startDate
  ) {
    return { ok: false, status: 400, fields: { startDate: 'invalid' } }
  }
  let startDate = current.start_date
  if (patch.date !== undefined) startDate = patch.date
  if (patch.startDate != null) startDate = patch.startDate
  let endDate = current.end_date
  if (
    current.type === 'single' &&
    (patch.date !== undefined || patch.startDate !== undefined) &&
    patch.endDate === undefined
  ) {
    endDate = null
  }
  if (patch.endDate !== undefined) endDate = patch.endDate
  const draft = normalizePlanDraft({
    type: current.type,
    title: patch.title !== undefined ? patch.title : current.title,
    startDate,
    endDate,
    startTime:
      patch.startTime !== undefined ? patch.startTime : current.start_time,
    endTime: patch.endTime !== undefined ? patch.endTime : current.end_time,
    info: patch.info !== undefined ? patch.info : current.info,
  })
  const fields = planEntryErrors(draft)
  if (
    fields.startDate &&
    patch.date !== undefined &&
    patch.startDate === undefined
  ) {
    fields.date = fields.startDate
    delete fields.startDate
  }
  if (Object.keys(fields).length > 0) return { ok: false, status: 400, fields }
  return {
    ok: true,
    draft,
    sortOrder: patch.sortOrder ?? current.sort_order,
  }
}

function visitError(
  visitDate: string | null,
  entry: CurrentEntry,
): PlanFailure | null {
  if (!visitDate) return null
  const end = entry.end_date ?? entry.start_date
  if (visitDate < entry.start_date || visitDate > end) {
    return {
      ok: false,
      status: 400,
      fields: { visitDate: 'outside_range' },
      message: outsideVisitMessage,
    }
  }
  return null
}

function rowToEntry(row: EntryRow): PlanEntry {
  return planEntrySchema.parse({
    id: row.id,
    tripId: row.trip_id,
    type: row.type,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    startTime: row.start_time,
    endTime: row.end_time,
    info: row.info,
    sortOrder: row.sort_order,
    outsideTripDates: isOutsideTripDates(
      row.start_date,
      row.end_date,
      row.trip_start,
      row.trip_end,
    ),
    spots: asLinks(row.spots),
  })
}

function isOutsideTripDates(
  startDate: string,
  endDate: string | null,
  tripStart: string | null,
  tripEnd: string | null,
): boolean {
  const entryEnd = endDate ?? startDate
  if (tripStart && startDate < tripStart) return true
  if (tripEnd && entryEnd > tripEnd) return true
  return false
}

function asLinks(value: unknown): unknown[] {
  if (typeof value === 'string') return JSON.parse(value) as unknown[]
  return Array.isArray(value) ? value : []
}

async function write<T>(run: () => Promise<T>): Promise<T | PlanFailure> {
  try {
    return await run()
  } catch (error) {
    if (isCheckViolation(error) && /visit_date/i.test(errorText(error))) {
      return {
        ok: false,
        status: 400,
        fields: { visitDate: 'outside_range' },
        message: outsideVisitMessage,
      }
    }
    if (errorCode(error) === '23503') return { ok: false, status: 404 }
    if (isCheckViolation(error)) {
      return { ok: false, status: 400, fields: { body: 'invalid' } }
    }
    throw error
  }
}

function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : null
  }
  return null
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : ''
}
