-- Trip Board migration 0001_rules. Split from docs/database/schema.sql.

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;


CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION drop_sessions_on_suspend() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.suspended_at IS NOT NULL AND OLD.suspended_at IS NULL THEN
    DELETE FROM sessions WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER users_drop_sessions_on_suspend
  AFTER UPDATE OF suspended_at ON users
  FOR EACH ROW EXECUTE FUNCTION drop_sessions_on_suspend();

CREATE TRIGGER trips_updated_at BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION check_trip_has_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  t uuid;
BEGIN
  IF TG_TABLE_NAME = 'trips' THEN
    t := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    t := OLD.trip_id;
  ELSE
    t := NEW.trip_id;
  END IF;
  IF EXISTS (SELECT 1 FROM trips WHERE id = t)
     AND NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = t AND role = 'owner') THEN
    RAISE EXCEPTION 'trip % must have exactly one owner', t USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER trip_members_owner_required
  AFTER INSERT OR UPDATE OR DELETE ON trip_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_trip_has_owner();

CREATE CONSTRAINT TRIGGER trips_owner_required
  AFTER INSERT ON trips
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_trip_has_owner();

CREATE INDEX spots_search_trgm_idx   ON spots USING gin (
  (lower(title || ' ' || coalesce(address, '') || ' ' || coalesce(info, ''))) gin_trgm_ops
);

CREATE TRIGGER spots_updated_at BEFORE UPDATE ON spots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION check_primary_home_category() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.primary_home_spot_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM spots WHERE id = NEW.primary_home_spot_id AND base_category = 'home') THEN
    RAISE EXCEPTION 'primary home spot must have category home' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trips_primary_home_category
  BEFORE INSERT OR UPDATE OF primary_home_spot_id ON trips
  FOR EACH ROW EXECUTE FUNCTION check_primary_home_category();

-- A spot that stops being 'home' is no longer the primary home base.
CREATE FUNCTION clear_primary_home_on_recategorize() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.base_category = 'home' AND NEW.base_category <> 'home' THEN
    UPDATE trips SET primary_home_spot_id = NULL WHERE primary_home_spot_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER spots_clear_primary_home
  AFTER UPDATE OF base_category ON spots
  FOR EACH ROW EXECUTE FUNCTION clear_primary_home_on_recategorize();

CREATE TRIGGER plan_entries_updated_at BEFORE UPDATE ON plan_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- visit_date must fall inside its entry's date range.
CREATE FUNCTION check_visit_date_in_entry() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  e plan_entries%ROWTYPE;
BEGIN
  IF NEW.visit_date IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO e FROM plan_entries WHERE id = NEW.plan_entry_id;
  IF NEW.visit_date < e.start_date OR NEW.visit_date > COALESCE(e.end_date, e.start_date) THEN
    RAISE EXCEPTION 'visit_date % outside plan entry range', NEW.visit_date USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER plan_entry_spots_visit_date
  BEFORE INSERT OR UPDATE OF visit_date, plan_entry_id ON plan_entry_spots
  FOR EACH ROW EXECUTE FUNCTION check_visit_date_in_entry();

-- Shrinking an entry's range clears visit dates that fall outside it.
CREATE FUNCTION clear_out_of_range_visits() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE plan_entry_spots
     SET visit_date = NULL, visit_time = NULL
   WHERE plan_entry_id = NEW.id
     AND visit_date IS NOT NULL
     AND (visit_date < NEW.start_date OR visit_date > COALESCE(NEW.end_date, NEW.start_date));
  RETURN NEW;
END $$;

CREATE TRIGGER plan_entries_clear_visits
  AFTER UPDATE OF start_date, end_date ON plan_entries
  FOR EACH ROW EXECUTE FUNCTION clear_out_of_range_visits();

CREATE FUNCTION enqueue_blob_deletion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO blob_deletions (storage_key) VALUES (OLD.storage_key);
  RETURN OLD;
END $$;

CREATE TRIGGER images_enqueue_blob_deletion
  AFTER DELETE ON images
  FOR EACH ROW EXECUTE FUNCTION enqueue_blob_deletion();

CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION snapshot_daily_metrics(d date) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO metrics_daily (day, users_total, users_new, users_active, trips_total, spots_total,
                             plan_entries_total, images_total, image_bytes_total, db_bytes, events_total)
  SELECT d,
    (SELECT count(*) FROM users WHERE created_at < d + 1),
    (SELECT count(*) FROM users WHERE created_at >= d AND created_at < d + 1),
    (SELECT count(DISTINCT actor_id) FROM activity_events WHERE created_at >= d AND created_at < d + 1),
    (SELECT count(*) FROM trips),
    (SELECT count(*) FROM spots),
    (SELECT count(*) FROM plan_entries),
    (SELECT count(*) FROM images),
    (SELECT COALESCE(sum(bytes), 0) FROM images),
    pg_database_size(current_database()),
    (SELECT count(*) FROM activity_events WHERE created_at >= d AND created_at < d + 1)
  ON CONFLICT (day) DO UPDATE SET
    users_total = EXCLUDED.users_total, users_new = EXCLUDED.users_new,
    users_active = EXCLUDED.users_active, trips_total = EXCLUDED.trips_total,
    spots_total = EXCLUDED.spots_total, plan_entries_total = EXCLUDED.plan_entries_total,
    images_total = EXCLUDED.images_total, image_bytes_total = EXCLUDED.image_bytes_total,
    db_bytes = EXCLUDED.db_bytes, events_total = EXCLUDED.events_total, created_at = now();
$$;

CREATE VIEW spots_view AS
SELECT
  s.*,
  CASE
    WHEN s.base_category = 'home' THEN 'home'::display_category
    WHEN p.plan_count > 0         THEN 'planned'::display_category
    ELSE s.base_category::text::display_category
  END                                  AS display_category,
  COALESCE(p.plan_count, 0)            AS plan_count,
  p.first_scheduled_at
FROM spots s
LEFT JOIN LATERAL (
  SELECT
    count(*)::int AS plan_count,
    min(COALESCE(pes.visit_date, pe.start_date)
        + COALESCE(pes.visit_time, pe.start_time, time '00:00')) AS first_scheduled_at
  FROM plan_entry_spots pes
  JOIN plan_entries pe ON pe.id = pes.plan_entry_id
  WHERE pes.spot_id = s.id
) p ON true;

-- Effective limits: per-user override, else the platform default.
CREATE VIEW user_quota_usage AS
SELECT
  u.id                                              AS user_id,
  COALESCE(u.max_images, s.default_max_images)      AS max_images,
  COALESCE(u.max_bytes,  s.default_max_bytes)       AS max_bytes,
  (u.max_images IS NOT NULL OR u.max_bytes IS NOT NULL) AS has_override,
  COALESCE(i.used_images, 0)                        AS used_images,
  COALESCE(i.used_bytes, 0)::bigint                 AS used_bytes
FROM users u
CROSS JOIN app_settings s
LEFT JOIN (
  SELECT uploaded_by, count(*)::int AS used_images, sum(bytes) AS used_bytes
  FROM images GROUP BY uploaded_by
) i ON i.uploaded_by = u.id;

-- Home spot whose stay overlaps a bucket; falls back to the primary home base.
CREATE VIEW plan_entry_home AS
SELECT
  pe.id AS plan_entry_id,
  COALESCE(
    (SELECT s.id FROM spots s
      WHERE s.trip_id = pe.trip_id
        AND s.base_category = 'home'
        AND s.stay_from IS NOT NULL
        AND s.stay_from <= COALESCE(pe.end_date, pe.start_date)
        AND COALESCE(s.stay_to, s.stay_from) >= pe.start_date
      ORDER BY s.stay_from
      LIMIT 1),
    t.primary_home_spot_id
  ) AS home_spot_id
FROM plan_entries pe
JOIN trips t ON t.id = pe.trip_id;

-- Admin users table: one row per user with usage and activity.
CREATE VIEW admin_user_overview AS
SELECT
  u.id, u.discord_id, u.username, u.display_name, u.avatar_url, u.app_role,
  u.created_at, u.last_login_at, u.last_seen_at, u.suspended_at,
  q.used_images, q.max_images, q.used_bytes, q.max_bytes, q.has_override,
  (SELECT count(*) FROM trip_members m WHERE m.user_id = u.id)::int                     AS trips_member,
  (SELECT count(*) FROM trip_members m WHERE m.user_id = u.id AND m.role = 'owner')::int AS trips_owned,
  (SELECT count(*) FROM spots sp WHERE sp.created_by = u.id)::int                        AS spots_created,
  (SELECT count(*) FROM activity_events e
    WHERE e.actor_id = u.id AND e.created_at > now() - interval '30 days')::int          AS events_30d,
  (SELECT max(e.created_at) FROM activity_events e WHERE e.actor_id = u.id)              AS last_activity_at
FROM users u
JOIN user_quota_usage q ON q.user_id = u.id;

-- Admin trips table.
CREATE VIEW admin_trip_overview AS
SELECT
  t.id, t.name, t.created_at, t.created_by,
  (SELECT m.user_id FROM trip_members m WHERE m.trip_id = t.id AND m.role = 'owner')   AS owner_id,
  (SELECT count(*) FROM trip_members m WHERE m.trip_id = t.id)::int                    AS members,
  (SELECT count(*) FROM spots s WHERE s.trip_id = t.id)::int                           AS spots,
  (SELECT count(*) FROM plan_entries p WHERE p.trip_id = t.id)::int                    AS plan_entries,
  (SELECT count(*) FROM images i WHERE i.trip_id = t.id)::int                          AS images,
  (SELECT COALESCE(sum(i.bytes), 0) FROM images i WHERE i.trip_id = t.id)::bigint      AS image_bytes,
  (SELECT max(e.created_at) FROM activity_events e WHERE e.trip_id = t.id)             AS last_activity_at
FROM trips t;

-- Database size per table (data + indexes + TOAST) for the storage page.
CREATE VIEW admin_table_sizes AS
SELECT
  c.relname                                  AS table_name,
  pg_total_relation_size(c.oid)              AS total_bytes,
  pg_relation_size(c.oid)                    AS table_bytes,
  pg_indexes_size(c.oid)                     AS index_bytes,
  GREATEST(c.reltuples, 0)::bigint           AS estimated_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = current_schema() AND c.relkind = 'r';

-- Totals vs. capacity for the storage page.
CREATE VIEW admin_storage_summary AS
SELECT
  pg_database_size(current_database())                         AS db_bytes,
  s.db_capacity_bytes,
  (SELECT COALESCE(sum(bytes), 0) FROM images)::bigint         AS blob_bytes,
  s.blob_capacity_bytes,
  s.capacity_warn_pct,
  round(100.0 * pg_database_size(current_database()) / s.db_capacity_bytes, 1) AS db_used_pct,
  round(100.0 * (SELECT COALESCE(sum(bytes), 0) FROM images) / s.blob_capacity_bytes, 1) AS blob_used_pct
FROM app_settings s;
