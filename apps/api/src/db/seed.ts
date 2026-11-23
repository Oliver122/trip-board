import sharp from 'sharp'
import type { Pool } from 'pg'
import type { ObjectStorage } from '../images/storage.js'

export const seedIds = {
  users: {
    sven: '00000000-0000-0000-0000-000000000001',
    aiko: '00000000-0000-0000-0000-000000000002',
    tom: '00000000-0000-0000-0000-000000000003',
  },
  trip: '10000000-0000-0000-0000-000000000001',
  spots: {
    shibuya: '20000000-0000-0000-0000-000000000001',
    teamLab: '20000000-0000-0000-0000-000000000002',
    fushimi: '20000000-0000-0000-0000-000000000003',
    nara: '20000000-0000-0000-0000-000000000004',
    hotel: '20000000-0000-0000-0000-000000000005',
    ryokan: '20000000-0000-0000-0000-000000000006',
  },
  kinds: {
    mustGo: '40000000-0000-0000-0000-000000000001',
    maybe: '40000000-0000-0000-0000-000000000002',
  },
  // R-47-12: photobook photos of Japan 2026
  photos: {
    crossing: '50000000-0000-0000-0000-000000000001',
    alley: '50000000-0000-0000-0000-000000000002',
    kamo: '50000000-0000-0000-0000-000000000003',
    unplaced: '50000000-0000-0000-0000-000000000004',
  },
  entries: {
    tokyo: '30000000-0000-0000-0000-000000000001',
    kyoto: '30000000-0000-0000-0000-000000000002',
    arrival: '30000000-0000-0000-0000-000000000003',
  },
} as const

export const seedCounts = {
  users: 3,
  trips: 1,
  tripMembers: 3,
  spots: 6,
  homeSpots: 2,
  buckets: 2,
  singles: 1,
  planEntrySpots: 6,
  activityEvents: 90,
  metricsDaily: 90,
  opsCounters: 30,
  jobRuns: 3,
  photos: 4,
} as const

type SeedPhoto = {
  id: string
  uploader: string
  spot: string | null
  lat: number | null
  lng: number | null
  takenAt: string | null
  caption: string | null
  width: number
  height: number
  color: { r: number; g: number; b: number }
}

// Two on 13 Apr (the first within 150 m of Shibuya Sky), one on 18 Apr with no
// spot nearby, and one with neither a point nor a date.
const seedPhotos: SeedPhoto[] = [
  {
    id: seedIds.photos.crossing,
    uploader: seedIds.users.aiko,
    spot: seedIds.spots.shibuya,
    lat: 35.6582,
    lng: 139.7022,
    takenAt: '2026-04-13T10:15:00',
    caption: 'Crossing from above',
    width: 640,
    height: 480,
    color: { r: 229, g: 72, b: 77 },
  },
  {
    id: seedIds.photos.alley,
    uploader: seedIds.users.sven,
    spot: null,
    lat: 35.6655,
    lng: 139.712,
    takenAt: '2026-04-13T18:40:00',
    caption: null,
    width: 480,
    height: 640,
    color: { r: 48, g: 164, b: 108 },
  },
  {
    id: seedIds.photos.kamo,
    uploader: seedIds.users.sven,
    spot: null,
    lat: 35.0116,
    lng: 135.7681,
    takenAt: '2026-04-18T08:05:00',
    caption: null,
    width: 640,
    height: 427,
    color: { r: 62, g: 99, b: 224 },
  },
  {
    id: seedIds.photos.unplaced,
    uploader: seedIds.users.aiko,
    spot: null,
    lat: null,
    lng: null,
    takenAt: null,
    caption: null,
    width: 600,
    height: 600,
    color: { r: 245, g: 166, b: 35 },
  },
]

const photoKey = (id: string) => `trips/${seedIds.trip}/photos/${id}.webp`

/** A few KB of WebP: a vertical gradient of the photo's colour. */
async function seedPhotoBlob(photo: SeedPhoto): Promise<Buffer> {
  const { r, g, b } = photo.color
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(${r},${g},${b})"/><stop offset="1" stop-color="rgb(${r >> 1},${g >> 1},${b >> 1})"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
  return sharp(Buffer.from(svg)).webp({ quality: 70 }).toBuffer()
}

export async function seedDatabase(
  pool: Pool,
  options: { storage?: ObjectStorage } = {},
): Promise<void> {
  const blobs = new Map<string, Buffer>()
  for (const photo of seedPhotos) {
    blobs.set(photo.id, await seedPhotoBlob(photo))
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
      INSERT INTO users (id, discord_id, username, display_name, app_role, created_at)
      VALUES
        ($1, '100000000000000001', 'sven', 'Sven', 'admin', current_date - 100),
        ($2, '100000000000000002', 'aiko', 'Aiko', 'user', current_date - 100),
        ($3, '100000000000000003', 'tom', 'Tom', 'user', current_date - 100)
      ON CONFLICT (id) DO NOTHING
      `,
      [seedIds.users.sven, seedIds.users.aiko, seedIds.users.tom],
    )
    await client.query(
      `
      INSERT INTO trips (
        id, name, created_by, start_date, end_date, timezone,
        bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat
      ) VALUES (
        $1, 'Japan 2026', $2, '2026-04-12', '2026-04-24', 'Asia/Tokyo',
        122.9, 24.0, 153.9, 45.6
      )
      ON CONFLICT (id) DO NOTHING
      `,
      [seedIds.trip, seedIds.users.sven],
    )
    await client.query(
      `
      INSERT INTO trip_members (trip_id, user_id, role) VALUES
        ($1, $2, 'owner'),
        ($1, $3, 'planner'),
        ($1, $4, 'visitor')
      ON CONFLICT (trip_id, user_id) DO NOTHING
      `,
      [seedIds.trip, seedIds.users.sven, seedIds.users.aiko, seedIds.users.tom],
    )
    await client.query(
      `
      INSERT INTO spot_kinds (id, trip_id, preset, color, symbol, sort_order) VALUES
        ($2, $1, 'must_go', '#E5484D', 'exclamation', 0),
        ($3, $1, 'maybe', '#30A46C', 'question', 1)
      ON CONFLICT DO NOTHING
      `,
      [seedIds.trip, seedIds.kinds.mustGo, seedIds.kinds.maybe],
    )
    await client.query(
      `
      INSERT INTO trip_invites (
        trip_id, code, role, created_by, created_at, expires_at
      ) VALUES (
        $1, 'JPN-EXP1', 'visitor', $2,
        now() - interval '8 days',
        now() - interval '1 day'
      )
      ON CONFLICT (code) DO UPDATE SET
        trip_id = EXCLUDED.trip_id,
        role = EXCLUDED.role,
        created_by = EXCLUDED.created_by,
        created_at = EXCLUDED.created_at,
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL
      `,
      [seedIds.trip, seedIds.users.sven],
    )
    await client.query(
      `
      INSERT INTO spots (id, trip_id, title, address, lat, lng, base_category, created_by) VALUES
        ($2, $1, 'Shibuya Sky', '2-24-12 Shibuya, Tokyo', 35.658, 139.702, 'kind', $3),
        ($4, $1, 'teamLab Borderless', '1-3-8 Azumabashi, Tokyo', 35.626, 139.783, 'kind', $3),
        ($5, $1, 'Fushimi Inari', '68 Fukakusa Yabunouchicho, Kyoto', 34.967, 135.772, 'kind', $3),
        ($6, $1, 'Nara Park', 'Nara Park, Nara', 34.685, 135.843, 'kind', $7)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        seedIds.trip,
        seedIds.spots.shibuya,
        seedIds.users.sven,
        seedIds.spots.teamLab,
        seedIds.spots.fushimi,
        seedIds.spots.nara,
        seedIds.users.aiko,
      ],
    )
    await client.query(
      `
      INSERT INTO spot_kind_links (trip_id, spot_id, kind_id)
      SELECT $1, v.spot_id, k.id
      FROM (VALUES
        ($2::uuid, 'must_go'),
        ($3::uuid, 'must_go'),
        ($4::uuid, 'must_go'),
        ($5::uuid, 'maybe')
      ) AS v (spot_id, preset)
      JOIN spot_kinds k ON k.trip_id = $1 AND k.preset = v.preset
      WHERE NOT EXISTS (SELECT 1 FROM spot_kind_links l WHERE l.spot_id = v.spot_id)
      `,
      [
        seedIds.trip,
        seedIds.spots.shibuya,
        seedIds.spots.teamLab,
        seedIds.spots.fushimi,
        seedIds.spots.nara,
      ],
    )
    await client.query(
      `
      INSERT INTO spots (
        id, trip_id, title, lat, lng, base_category, stay_from, stay_to, created_by
      ) VALUES
        ($2, $1, 'Hotel Gracery', 35.694, 139.701, 'home', '2026-04-12', '2026-04-16', $4),
        ($3, $1, 'Kyoto Ryokan', 35.003, 135.778, 'home', '2026-04-17', '2026-04-19', $4)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        seedIds.trip,
        seedIds.spots.hotel,
        seedIds.spots.ryokan,
        seedIds.users.sven,
      ],
    )
    await client.query(
      `UPDATE trips SET primary_home_spot_id = $2 WHERE id = $1`,
      [seedIds.trip, seedIds.spots.hotel],
    )
    await client.query(
      `
      INSERT INTO plan_entries (id, trip_id, type, title, start_date, end_date, created_by) VALUES
        ($2, $1, 'bucket', 'Tokyo', '2026-04-12', '2026-04-16', $4),
        ($3, $1, 'bucket', 'Kyoto', '2026-04-17', '2026-04-20', $4)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        seedIds.trip,
        seedIds.entries.tokyo,
        seedIds.entries.kyoto,
        seedIds.users.sven,
      ],
    )
    await client.query(
      `
      INSERT INTO plan_entries (id, trip_id, type, title, start_date, start_time, created_by)
      VALUES ($2, $1, 'single', 'Arrival', '2026-04-12', '15:00', $3)
      ON CONFLICT (id) DO NOTHING
      `,
      [seedIds.trip, seedIds.entries.arrival, seedIds.users.sven],
    )
    await client.query(
      `
      INSERT INTO plan_entry_spots (
        id, trip_id, plan_entry_id, spot_id, visit_date, visit_time, sort_order
      ) VALUES
        ('40000000-0000-0000-0000-000000000001', $1, $2, $4, '2026-04-13', '18:00', 0),
        ('40000000-0000-0000-0000-000000000002', $1, $2, $5, '2026-04-14', NULL, 1),
        ('40000000-0000-0000-0000-000000000003', $1, $3, $6, '2026-04-18', '09:00', 0),
        ('40000000-0000-0000-0000-000000000004', $1, $2, $5, '2026-04-13', '10:00', 2),
        ('40000000-0000-0000-0000-000000000005', $1, $2, $7, '2026-04-13', NULL, 3),
        ('40000000-0000-0000-0000-000000000006', $1, $2, $4, NULL, NULL, 4)
      -- R-46-10: e2e tests move these links, so a re-run restores them
      ON CONFLICT (id) DO UPDATE SET
        trip_id = EXCLUDED.trip_id,
        plan_entry_id = EXCLUDED.plan_entry_id,
        spot_id = EXCLUDED.spot_id,
        visit_date = EXCLUDED.visit_date,
        visit_time = EXCLUDED.visit_time,
        info = NULL,
        sort_order = EXCLUDED.sort_order
      `,
      [
        seedIds.trip,
        seedIds.entries.tokyo,
        seedIds.entries.kyoto,
        seedIds.spots.shibuya,
        seedIds.spots.teamLab,
        seedIds.spots.fushimi,
        seedIds.spots.hotel,
      ],
    )
    for (const photo of seedPhotos) {
      const data = blobs.get(photo.id)!
      await client.query(
        `
        INSERT INTO images (
          id, trip_id, spot_id, uploaded_by, storage_key, bytes, width, height,
          lat, lng, taken_at, place_source, caption
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::float8, $10::float8, $11::timestamp,
          CASE WHEN $9::float8 IS NULL THEN NULL ELSE 'exif' END, $12
        )
        ON CONFLICT (id) DO NOTHING
        `,
        [
          photo.id,
          seedIds.trip,
          photo.spot,
          photo.uploader,
          photoKey(photo.id),
          data.length,
          photo.width,
          photo.height,
          photo.lat,
          photo.lng,
          photo.takenAt,
          photo.caption,
        ],
      )
    }
    await client.query(
      `DELETE FROM activity_events WHERE metadata->>'seed' = 'japan-2026'`,
    )
    await client.query(
      `
      INSERT INTO activity_events (actor_id, trip_id, action, entity_id, metadata, created_at)
      SELECT
        $1,
        $2,
        'spot.create',
        $3,
        '{"seed":"japan-2026","title":"Shibuya Sky","trip":"Japan 2026"}'::jsonb,
        (current_date - offs)::timestamp + time '12:00'
      FROM generate_series(0, 89) AS offs
      `,
      [seedIds.users.sven, seedIds.trip, seedIds.spots.shibuya],
    )
    await client.query('DELETE FROM metrics_daily')
    await client.query(`
      SELECT snapshot_daily_metrics((current_date - offs)::date)
      FROM generate_series(0, 89) AS offs
    `)
    // R-45-10: service health demo data. invites is overdue, commons failed,
    // sessions is fresh and geocode has no row ("Not yet run").
    await client.query('DELETE FROM ops_counters')
    await client.query(`
      INSERT INTO ops_counters (day, http_5xx, http_429, api_starts)
      SELECT
        ((now() AT TIME ZONE 'UTC')::date - offs),
        CASE offs WHEN 3 THEN 3 WHEN 11 THEN 1 ELSE 0 END,
        CASE offs WHEN 5 THEN 4 WHEN 12 THEN 2 WHEN 20 THEN 1 ELSE 0 END,
        CASE WHEN offs % 7 = 0 THEN 2 WHEN offs % 4 = 1 THEN 1 ELSE 0 END
      FROM generate_series(0, 29) AS offs
    `)
    await client.query('DELETE FROM job_runs')
    await client.query(`
      INSERT INTO job_runs (job, last_started_at, last_finished_at, last_result, last_error)
      VALUES
        ('invites', now() - interval '3 days', now() - interval '3 days' + interval '1 second', 'ok', NULL),
        ('commons', now() - interval '2 hours', now() - interval '2 hours' + interval '1 second', 'error', 'seeded failure'),
        ('sessions', now() - interval '30 minutes', now() - interval '30 minutes' + interval '1 second', 'ok', NULL)
    `)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  // The blobs go in after the rows; putting them again is harmless.
  if (options.storage) {
    for (const photo of seedPhotos) {
      await options.storage.put(photoKey(photo.id), blobs.get(photo.id)!)
    }
  }
}
