-- Trip Board — PostgreSQL 16 schema
-- Reference DDL. The Drizzle schema in apps/api must produce an equivalent database.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy text search on spots

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE trip_role       AS ENUM ('owner', 'planner', 'visitor');
CREATE TYPE spot_category   AS ENUM ('must_go', 'maybe', 'home');
CREATE TYPE display_category AS ENUM ('must_go', 'maybe', 'planned', 'home');
CREATE TYPE plan_entry_type AS ENUM ('bucket', 'single');
CREATE TYPE app_locale      AS ENUM ('en', 'de');
CREATE TYPE app_role        AS ENUM ('user', 'admin');
CREATE TYPE request_status  AS ENUM ('pending', 'approved', 'rejected');

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared trigger: updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Users & sessions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id     text        NOT NULL UNIQUE CHECK (discord_id ~ '^[0-9]{5,25}$'),
  username       text        NOT NULL CHECK (char_length(username) BETWEEN 1 AND 64),
  display_name   text        CHECK (char_length(display_name) <= 64),
  avatar_url     text,
  locale         app_locale  NOT NULL DEFAULT 'en',
  app_role       app_role    NOT NULL DEFAULT 'user',
  -- Per-user quota overrides; NULL means "use app_settings defaults".
  max_images     integer     CHECK (max_images >= 0),
  max_bytes      bigint      CHECK (max_bytes >= 0),
  suspended_at     timestamptz,
  suspended_reason text        CHECK (char_length(suspended_reason) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz,
  last_seen_at   timestamptz  -- updated at most every 5 min by the API
);

CREATE INDEX users_created_at_idx   ON users (created_at);
CREATE INDEX users_last_seen_at_idx ON users (last_seen_at);

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The cookie holds a random token; only its SHA-256 hash is stored.
CREATE TABLE sessions (
  id          text        PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  user_agent  text,
  CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_id_idx    ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- Suspending a user logs them out everywhere.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Trips & membership
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE trips (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  created_by            uuid        REFERENCES users(id) ON DELETE SET NULL,
  start_date            date,
  end_date              date,
  timezone              text        NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) BETWEEN 1 AND 64), -- IANA name, validated by the API
  bbox_min_lng          double precision NOT NULL CHECK (bbox_min_lng BETWEEN -180 AND 180),
  bbox_min_lat          double precision NOT NULL CHECK (bbox_min_lat BETWEEN  -90 AND  90),
  bbox_max_lng          double precision NOT NULL CHECK (bbox_max_lng BETWEEN -180 AND 180),
  bbox_max_lat          double precision NOT NULL CHECK (bbox_max_lat BETWEEN  -90 AND  90),
  primary_home_spot_id  uuid,       -- FK added after spots exists
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CHECK (bbox_min_lng <= bbox_max_lng AND bbox_min_lat <= bbox_max_lat)
);

CREATE INDEX trips_created_by_idx ON trips (created_by);

CREATE TRIGGER trips_updated_at BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The owner is the member with role 'owner' (exactly one, transferable).
-- trips.created_by keeps the original creator for display even after a transfer.
CREATE TABLE trip_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  code        text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{3}-[A-Z0-9]{4}$'),
  role        trip_role   NOT NULL DEFAULT 'visitor' CHECK (role IN ('planner', 'visitor')),
  created_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  revoked_at  timestamptz,
  uses        integer     NOT NULL DEFAULT 0 CHECK (uses >= 0),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days')
);

CREATE INDEX trip_invites_trip_id_idx ON trip_invites (trip_id);

CREATE TABLE trip_members (
  trip_id         uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            trip_role   NOT NULL,
  invited_via     uuid        REFERENCES trip_invites(id) ON DELETE SET NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);

CREATE INDEX trip_members_user_id_idx ON trip_members (user_id);
-- At most one owner per trip. "At least one" is guaranteed by the API
-- (trip creation and ownership transfer run in one transaction) and by the
-- deferred check below.
CREATE UNIQUE INDEX trip_members_one_owner_idx ON trip_members (trip_id) WHERE role = 'owner';

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Spots
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE spots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id        uuid          NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title          text          NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  address        text          CHECK (char_length(address) <= 300),
  lat            double precision NOT NULL CHECK (lat BETWEEN  -90 AND  90),
  lng            double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  base_category  spot_category NOT NULL,
  info           text          CHECK (char_length(info) <= 2000),
  link           text          CHECK (link ~* '^https?://' AND char_length(link) <= 500),
  stay_from      date,
  stay_to        date,
  created_by     uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (trip_id, id),
  CHECK (base_category = 'home' OR (stay_from IS NULL AND stay_to IS NULL)),
  CHECK (stay_to IS NULL OR stay_from IS NULL OR stay_to >= stay_from)
);

CREATE INDEX spots_trip_category_idx ON spots (trip_id, base_category);
CREATE INDEX spots_trip_location_idx ON spots (trip_id, lat, lng);
CREATE INDEX spots_created_by_idx    ON spots (created_by);
CREATE INDEX spots_search_trgm_idx   ON spots USING gin (
  (lower(title || ' ' || coalesce(address, '') || ' ' || coalesce(info, ''))) gin_trgm_ops
);

CREATE TRIGGER spots_updated_at BEFORE UPDATE ON spots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Primary home base must be a home spot of the same trip.
ALTER TABLE trips
  ADD CONSTRAINT trips_primary_home_fk
  FOREIGN KEY (id, primary_home_spot_id) REFERENCES spots (trip_id, id)
  ON DELETE SET NULL (primary_home_spot_id)
  DEFERRABLE INITIALLY DEFERRED;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Planning
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE plan_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid            NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type        plan_entry_type NOT NULL,
  title       text            NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  start_date  date            NOT NULL,
  end_date    date,
  start_time  time,
  end_time    time,
  info        text            CHECK (char_length(info) <= 2000),
  sort_order  integer         NOT NULL DEFAULT 0,
  created_by  uuid            REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz     NOT NULL DEFAULT now(),
  updated_at  timestamptz     NOT NULL DEFAULT now(),
  UNIQUE (trip_id, id),
  CHECK (
    (type = 'single' AND (end_date IS NULL OR end_date = start_date)) OR
    (type = 'bucket' AND end_date IS NOT NULL AND end_date >= start_date)
  ),
  CHECK (end_time IS NULL OR start_time IS NOT NULL),
  CHECK (type = 'bucket' OR end_time IS NULL OR end_time > start_time)
);

CREATE INDEX plan_entries_trip_start_idx ON plan_entries (trip_id, start_date, start_time);

CREATE TRIGGER plan_entries_updated_at BEFORE UPDATE ON plan_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Many-to-many: a spot may appear in several entries, and more than once in
-- the same bucket (e.g. a restaurant on two different days).
-- trip_id is denormalised so the composite FKs guarantee entry and spot
-- belong to the same trip.
CREATE TABLE plan_entry_spots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id        uuid        NOT NULL,
  plan_entry_id  uuid        NOT NULL,
  spot_id        uuid        NOT NULL,
  visit_date     date,
  visit_time     time,
  info           text        CHECK (char_length(info) <= 2000),
  sort_order     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (trip_id, plan_entry_id) REFERENCES plan_entries (trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, spot_id)       REFERENCES spots (trip_id, id)        ON DELETE CASCADE,
  CHECK (visit_time IS NULL OR visit_date IS NOT NULL)
);

CREATE INDEX plan_entry_spots_entry_idx ON plan_entry_spots (plan_entry_id, sort_order);
CREATE INDEX plan_entry_spots_spot_idx  ON plan_entry_spots (spot_id);

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Images & blob cleanup
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid        NOT NULL,
  spot_id      uuid        NOT NULL,
  uploaded_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
  storage_key  text        NOT NULL UNIQUE,
  mime         text        NOT NULL DEFAULT 'image/webp' CHECK (mime = 'image/webp'),
  bytes        integer     NOT NULL CHECK (bytes > 0),
  width        integer     NOT NULL CHECK (width  BETWEEN 1 AND 2048),
  height       integer     NOT NULL CHECK (height BETWEEN 1 AND 2048),
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (trip_id, spot_id) REFERENCES spots (trip_id, id) ON DELETE CASCADE
);

CREATE INDEX images_spot_idx        ON images (spot_id, sort_order);
CREATE INDEX images_uploaded_by_idx ON images (uploaded_by);

-- Deleted image rows (directly or via spot/trip cascade) queue their blob
-- for removal; a worker drains this table.
CREATE TABLE blob_deletions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  storage_key  text        NOT NULL,
  enqueued_at  timestamptz NOT NULL DEFAULT now(),
  attempts     integer     NOT NULL DEFAULT 0,
  last_error   text
);

CREATE FUNCTION enqueue_blob_deletion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO blob_deletions (storage_key) VALUES (OLD.storage_key);
  RETURN OLD;
END $$;

CREATE TRIGGER images_enqueue_blob_deletion
  AFTER DELETE ON images
  FOR EACH ROW EXECUTE FUNCTION enqueue_blob_deletion();

-- ─────────────────────────────────────────────────────────────────────────────
-- Geocoding cache (Nominatim proxy)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE geocode_cache (
  query_key   text        PRIMARY KEY,  -- e.g. 'search:en:fushimi inari' / 'reverse:34.9671,135.7727'
  response    jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX geocode_cache_created_at_idx ON geocode_cache (created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Administration
-- ─────────────────────────────────────────────────────────────────────────────

-- Single-row table with platform-wide settings editable in the admin UI.
CREATE TABLE app_settings (
  id                    boolean     PRIMARY KEY DEFAULT true CHECK (id),
  default_max_images    integer     NOT NULL DEFAULT 100       CHECK (default_max_images >= 0),
  default_max_bytes     bigint      NOT NULL DEFAULT 209715200 CHECK (default_max_bytes >= 0),  -- 200 MiB
  db_capacity_bytes     bigint      NOT NULL DEFAULT 1073741824 CHECK (db_capacity_bytes > 0),  -- 1 GiB, set to the real plan size
  blob_capacity_bytes   bigint      NOT NULL DEFAULT 10737418240 CHECK (blob_capacity_bytes > 0), -- 10 GiB
  capacity_warn_pct     integer     NOT NULL DEFAULT 80 CHECK (capacity_warn_pct BETWEEN 1 AND 100),
  uploads_enabled       boolean     NOT NULL DEFAULT true,
  signups_enabled       boolean     NOT NULL DEFAULT true,
  updated_by            uuid        REFERENCES users(id) ON DELETE SET NULL,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_settings DEFAULT VALUES;

CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- What users do. Written by the API in the same transaction as the change.
-- trip_id/actor_id survive deletions as NULL; metadata keeps names for display.
CREATE TABLE activity_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  trip_id      uuid        REFERENCES trips(id) ON DELETE SET NULL,
  action       text        NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),  -- e.g. 'spot.create'
  entity_id    uuid,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- One row per warning kind, so a Discord capacity alert posts at most once per day.
CREATE TABLE webhook_notices (
  kind text PRIMARY KEY,
  sent_on date NOT NULL
);

CREATE INDEX activity_events_created_at_idx ON activity_events (created_at DESC);
CREATE INDEX activity_events_actor_idx      ON activity_events (actor_id, created_at DESC);
CREATE INDEX activity_events_trip_idx       ON activity_events (trip_id, created_at DESC);
CREATE INDEX activity_events_action_idx     ON activity_events (action, created_at DESC);

-- Every admin write, kept permanently.
CREATE TABLE admin_audit_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id        uuid        REFERENCES users(id) ON DELETE SET NULL,
  action          text        NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),  -- e.g. 'user.quota_update'
  target_user_id  uuid        REFERENCES users(id) ON DELETE SET NULL,
  target_trip_id  uuid        REFERENCES trips(id) ON DELETE SET NULL,
  before          jsonb,
  after           jsonb,
  reason          text        CHECK (char_length(reason) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_created_at_idx ON admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_target_idx     ON admin_audit_log (target_user_id, created_at DESC);

-- Users can ask for more storage; admins approve (raising the user's override) or reject.
CREATE TABLE quota_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_images  integer        CHECK (requested_images > 0),
  requested_bytes   bigint         CHECK (requested_bytes > 0),
  message           text           CHECK (char_length(message) <= 500),
  status            request_status NOT NULL DEFAULT 'pending',
  decided_by        uuid           REFERENCES users(id) ON DELETE SET NULL,
  decided_at        timestamptz,
  decision_note     text           CHECK (char_length(decision_note) <= 500),
  created_at        timestamptz    NOT NULL DEFAULT now(),
  CHECK (requested_images IS NOT NULL OR requested_bytes IS NOT NULL),
  CHECK ((status = 'pending') = (decided_at IS NULL))
);

CREATE UNIQUE INDEX quota_requests_one_pending_idx ON quota_requests (user_id) WHERE status = 'pending';
CREATE INDEX quota_requests_status_idx ON quota_requests (status, created_at);

-- One row per day for the admin graphs; filled by snapshot_daily_metrics().
CREATE TABLE metrics_daily (
  day                date        PRIMARY KEY,
  users_total        integer     NOT NULL,
  users_new          integer     NOT NULL,
  users_active       integer     NOT NULL,  -- distinct actors in activity_events that day
  trips_total        integer     NOT NULL,
  spots_total        integer     NOT NULL,
  plan_entries_total integer     NOT NULL,
  images_total       integer     NOT NULL,
  image_bytes_total  bigint      NOT NULL,
  db_bytes           bigint      NOT NULL,
  events_total       integer     NOT NULL,  -- activity events that day
  created_at         timestamptz NOT NULL DEFAULT now()
);

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Read views
-- ─────────────────────────────────────────────────────────────────────────────

-- Spot as shown in the UI: automatic 'planned' status and the earliest
-- scheduled moment, used by the "scheduled first" sort.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Spot discussions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE spot_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid        NOT NULL,
  spot_id     uuid        NOT NULL,
  author_id   uuid        REFERENCES users(id) ON DELETE SET NULL,
  body        text        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  edited_at   timestamptz,
  FOREIGN KEY (trip_id, spot_id) REFERENCES spots (trip_id, id) ON DELETE CASCADE
);

CREATE INDEX spot_comments_spot_idx      ON spot_comments (spot_id, created_at, id);
CREATE INDEX spot_comments_trip_time_idx ON spot_comments (trip_id, created_at);

-- Last comment a member has seen per spot. Unread = someone else's comment
-- newer than last_read_at (see the unread rule in step 24).
CREATE TABLE spot_comment_reads (
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id       uuid        NOT NULL,
  spot_id       uuid        NOT NULL,
  last_read_at  timestamptz NOT NULL,
  PRIMARY KEY (user_id, spot_id),
  FOREIGN KEY (trip_id, spot_id) REFERENCES spots (trip_id, id) ON DELETE CASCADE
);

COMMIT;
