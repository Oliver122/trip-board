import type {
  PlanEntry,
  Spot,
  SpotKindRef,
  SpotListFilters,
} from '@tripboard/shared'
import type { Member } from '@tripboard/shared'
import type { Pool, PoolClient } from 'pg'
import { activity } from '../activity/record.js'
import { withTransaction } from '../db/transaction.js'
import { listMembers } from '../members/store.js'
import { listPlan } from '../plan/store.js'
import { listSpots } from '../spots/store.js'
import { renderCsv } from './csv.js'
import { renderIcs } from './ics.js'
import type { ExportLocale } from './labels.js'
import { exportFilename } from './names.js'
import { renderPdf } from './pdf.js'

type Queryable = Pool | PoolClient

export type ExportFormat = 'csv' | 'pdf' | 'ics'

export type ExportVisit = {
  id: string
  spotId: string
  entryId: string
  entryTitle: string
  entryType: 'bucket' | 'single'
  visitDate: string | null
  visitTime: string | null
}

export type ExportKind = Pick<SpotKindRef, 'id' | 'name' | 'preset'>

export type HomePlace = {
  address: string | null
  lat: number
  lng: number
}

export type ExportData = {
  locale: ExportLocale
  exportedAt: Date
  trip: {
    id: string
    name: string
    startDate: string | null
    endDate: string | null
    timezone: string
  }
  members: Member[]
  /** The trip's kinds in order, for grouping spots by primary kind. */
  kinds: ExportKind[]
  spots: Spot[]
  visits: ExportVisit[]
  entries: PlanEntry[]
  homes: Map<string, HomePlace>
  filters: SpotListFilters
}

type VisitRow = {
  id: string
  spot_id: string
  plan_entry_id: string
  entry_title: string
  entry_type: 'bucket' | 'single'
  visit_date: string | null
  visit_time: string | null
}

type HomeRow = {
  id: string
  address: string | null
  lat: number
  lng: number
}

const contentTypes: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
  ics: 'text/calendar; charset=utf-8',
}

export async function buildExport(
  pool: Pool,
  userId: string,
  tripId: string,
  locale: ExportLocale,
  filters: SpotListFilters,
  format: ExportFormat,
  now: Date,
): Promise<
  | {
      ok: true
      body: string | Buffer
      contentType: string
      filename: string
    }
  | { ok: false; status: 403 | 404 }
> {
  return withTransaction(pool, async (tx) => {
    const loaded = await loadExport(tx, tripId, userId, locale, filters, now)
    if (!loaded.ok) return loaded
    const body = await render(loaded.data, format)
    await activity.record(tx, {
      actor: userId,
      trip: tripId,
      action: 'export.download',
      entityId: tripId,
      metadata: { trip: loaded.data.trip.name, format },
    })
    return {
      ok: true as const,
      body,
      contentType: contentTypes[format],
      filename: exportFilename(
        loaded.data.trip.name,
        now,
        loaded.data.trip.timezone,
        format,
      ),
    }
  })
}

async function loadExport(
  db: Queryable,
  tripId: string,
  userId: string,
  locale: ExportLocale,
  filters: SpotListFilters,
  now: Date,
): Promise<{ ok: true; data: ExportData } | { ok: false; status: 403 | 404 }> {
  const spots = await listSpots(db, tripId, userId, filters)
  if (!spots.ok) return spots
  const plan = await listPlan(db, tripId, userId)
  if (!plan.ok) return plan
  const members = await listMembers(db, tripId, userId)
  if (!members.ok) {
    return {
      ok: false,
      status: members.status === 403 ? 403 : 404,
    }
  }
  const trip = await db.query<{
    name: string
    start_date: string | null
    end_date: string | null
    timezone: string
  }>(
    `
    SELECT name, start_date::text AS start_date, end_date::text AS end_date, timezone
    FROM trips
    WHERE id = $1
    `,
    [tripId],
  )
  const row = trip.rows[0]
  if (!row) return { ok: false, status: 404 }
  const spotIds = spots.spots.map((spot) => spot.id)
  const visits =
    spotIds.length === 0 ? [] : await readVisits(db, spotIds, filters.entry)
  const kinds = await db.query<ExportKind>(
    `SELECT id, name, preset FROM spot_kinds WHERE trip_id = $1 ORDER BY sort_order, created_at, id`,
    [tripId],
  )
  const homes = await readHomes(
    db,
    plan.entries.flatMap((entry) => (entry.home ? [entry.home.spotId] : [])),
  )
  return {
    ok: true,
    data: {
      locale,
      exportedAt: now,
      trip: {
        id: tripId,
        name: row.name,
        startDate: row.start_date,
        endDate: row.end_date,
        timezone: row.timezone,
      },
      members: members.members,
      kinds: kinds.rows,
      spots: spots.spots,
      visits,
      entries: plan.entries,
      homes,
      filters,
    },
  }
}

async function readVisits(
  db: Queryable,
  spotIds: string[],
  entryId: string | null,
): Promise<ExportVisit[]> {
  const result = await db.query<VisitRow>(
    `
    SELECT
      pes.id,
      pes.spot_id,
      pes.plan_entry_id,
      pe.title AS entry_title,
      pe.type AS entry_type,
      pes.visit_date::text AS visit_date,
      to_char(pes.visit_time, 'HH24:MI') AS visit_time
    FROM plan_entry_spots pes
    JOIN plan_entries pe ON pe.id = pes.plan_entry_id
    WHERE pes.spot_id = ANY($1::uuid[])
      AND ($2::uuid IS NULL OR pes.plan_entry_id = $2)
    ORDER BY pes.visit_date NULLS LAST, pes.visit_time NULLS LAST, pes.sort_order, pes.id
    `,
    [spotIds, entryId],
  )
  return result.rows.map((row) => ({
    id: row.id,
    spotId: row.spot_id,
    entryId: row.plan_entry_id,
    entryTitle: row.entry_title,
    entryType: row.entry_type,
    visitDate: row.visit_date,
    visitTime: row.visit_time,
  }))
}

async function readHomes(
  db: Queryable,
  spotIds: string[],
): Promise<Map<string, HomePlace>> {
  const unique = [...new Set(spotIds)]
  const homes = new Map<string, HomePlace>()
  if (unique.length === 0) return homes
  const result = await db.query<HomeRow>(
    `SELECT id, address, lat, lng FROM spots WHERE id = ANY($1::uuid[])`,
    [unique],
  )
  for (const row of result.rows) {
    homes.set(row.id, {
      address: row.address,
      lat: row.lat,
      lng: row.lng,
    })
  }
  return homes
}

function render(
  data: ExportData,
  format: ExportFormat,
): Promise<string | Buffer> {
  if (format === 'csv') return Promise.resolve(renderCsv(data))
  if (format === 'ics') return Promise.resolve(renderIcs(data))
  return renderPdf(data)
}
