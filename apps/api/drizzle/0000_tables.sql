-- Trip Board migration 0000_tables. Split from docs/database/schema.sql.

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

ALTER TABLE trips
  ADD CONSTRAINT trips_primary_home_fk
  FOREIGN KEY (id, primary_home_spot_id) REFERENCES spots (trip_id, id)
  ON DELETE SET NULL (primary_home_spot_id)
  DEFERRABLE INITIALLY DEFERRED;

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

CREATE TABLE blob_deletions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  storage_key  text        NOT NULL,
  enqueued_at  timestamptz NOT NULL DEFAULT now(),
  attempts     integer     NOT NULL DEFAULT 0,
  last_error   text
);

CREATE TABLE geocode_cache (
  query_key   text        PRIMARY KEY,  -- e.g. 'search:en:fushimi inari' / 'reverse:34.9671,135.7727'
  response    jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX geocode_cache_created_at_idx ON geocode_cache (created_at);

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

CREATE TABLE activity_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  trip_id      uuid        REFERENCES trips(id) ON DELETE SET NULL,
  action       text        NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),  -- e.g. 'spot.create'
  entity_id    uuid,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
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
