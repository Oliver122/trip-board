import type { Pool } from 'pg'

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
  planEntrySpots: 3,
  activityEvents: 90,
  metricsDaily: 90,
} as const

export async function seedDatabase(pool: Pool): Promise<void> {
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
        ($2, $1, 'Shibuya Sky', '2-24-12 Shibuya, Tokyo', 35.658, 139.702, 'must_go', $3),
        ($4, $1, 'teamLab Borderless', '1-3-8 Azumabashi, Tokyo', 35.626, 139.783, 'must_go', $3),
        ($5, $1, 'Fushimi Inari', '68 Fukakusa Yabunouchicho, Kyoto', 34.967, 135.772, 'must_go', $3),
        ($6, $1, 'Nara Park', 'Nara Park, Nara', 34.685, 135.843, 'maybe', $7)
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
        ('40000000-0000-0000-0000-000000000003', $1, $3, $6, '2026-04-18', '09:00', 0)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        seedIds.trip,
        seedIds.entries.tokyo,
        seedIds.entries.kyoto,
        seedIds.spots.shibuya,
        seedIds.spots.teamLab,
        seedIds.spots.fushimi,
      ],
    )
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
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
