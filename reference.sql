CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE TYPE public.app_locale AS ENUM (
    'en',
    'de'
);
CREATE TYPE public.app_role AS ENUM (
    'user',
    'admin'
);
CREATE TYPE public.display_category AS ENUM (
    'must_go',
    'maybe',
    'planned',
    'home'
);
CREATE TYPE public.plan_entry_type AS ENUM (
    'bucket',
    'single'
);
CREATE TYPE public.request_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);
CREATE TYPE public.spot_category AS ENUM (
    'must_go',
    'maybe',
    'home'
);
CREATE TYPE public.trip_role AS ENUM (
    'owner',
    'planner',
    'visitor'
);
CREATE FUNCTION public.check_primary_home_category() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.primary_home_spot_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM spots WHERE id = NEW.primary_home_spot_id AND base_category = 'home') THEN
    RAISE EXCEPTION 'primary home spot must have category home' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION public.check_trip_has_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
CREATE FUNCTION public.check_visit_date_in_entry() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
CREATE FUNCTION public.clear_out_of_range_visits() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE plan_entry_spots
   WHERE plan_entry_id = NEW.id
     AND visit_date IS NOT NULL
     AND (visit_date < NEW.start_date OR visit_date > COALESCE(NEW.end_date, NEW.start_date));
  RETURN NEW;
END $$;
CREATE FUNCTION public.clear_primary_home_on_recategorize() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.base_category = 'home' AND NEW.base_category <> 'home' THEN
    UPDATE trips SET primary_home_spot_id = NULL WHERE primary_home_spot_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION public.drop_sessions_on_suspend() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.suspended_at IS NOT NULL AND OLD.suspended_at IS NULL THEN
    DELETE FROM sessions WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION public.enqueue_blob_deletion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO blob_deletions (storage_key) VALUES (OLD.storage_key);
  RETURN OLD;
END $$;
CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE FUNCTION public.snapshot_daily_metrics(d date) RETURNS void
    LANGUAGE sql
    AS $$
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
CREATE TABLE public.activity_events (
    id bigint NOT NULL,
    actor_id uuid,
    trip_id uuid,
    action text NOT NULL,
    entity_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_events_action_check CHECK ((action ~ '^[a-z_]+\.[a-z_]+$'::text))
);
ALTER TABLE public.activity_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.activity_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.admin_audit_log (
    id bigint NOT NULL,
    admin_id uuid,
    action text NOT NULL,
    target_user_id uuid,
    target_trip_id uuid,
    before jsonb,
    after jsonb,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_audit_log_action_check CHECK ((action ~ '^[a-z_]+\.[a-z_]+$'::text)),
    CONSTRAINT admin_audit_log_reason_check CHECK ((char_length(reason) <= 500))
);
ALTER TABLE public.admin_audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.admin_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.app_settings (
    id boolean DEFAULT true NOT NULL,
    default_max_images integer DEFAULT 100 NOT NULL,
    default_max_bytes bigint DEFAULT 209715200 NOT NULL,
    db_capacity_bytes bigint DEFAULT 1073741824 NOT NULL,
    blob_capacity_bytes bigint DEFAULT '10737418240'::bigint NOT NULL,
    capacity_warn_pct integer DEFAULT 80 NOT NULL,
    uploads_enabled boolean DEFAULT true NOT NULL,
    signups_enabled boolean DEFAULT true NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_settings_blob_capacity_bytes_check CHECK ((blob_capacity_bytes > 0)),
    CONSTRAINT app_settings_capacity_warn_pct_check CHECK (((capacity_warn_pct >= 1) AND (capacity_warn_pct <= 100))),
    CONSTRAINT app_settings_db_capacity_bytes_check CHECK ((db_capacity_bytes > 0)),
    CONSTRAINT app_settings_default_max_bytes_check CHECK ((default_max_bytes >= 0)),
    CONSTRAINT app_settings_default_max_images_check CHECK ((default_max_images >= 0)),
    CONSTRAINT app_settings_id_check CHECK (id)
);
CREATE TABLE public.images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    spot_id uuid NOT NULL,
    uploaded_by uuid,
    storage_key text NOT NULL,
    mime text DEFAULT 'image/webp'::text NOT NULL,
    bytes integer NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT images_bytes_check CHECK ((bytes > 0)),
    CONSTRAINT images_height_check CHECK (((height >= 1) AND (height <= 2048))),
    CONSTRAINT images_mime_check CHECK ((mime = 'image/webp'::text)),
    CONSTRAINT images_width_check CHECK (((width >= 1) AND (width <= 2048)))
);
CREATE VIEW public.admin_storage_summary AS
 SELECT pg_database_size(current_database()) AS db_bytes,
    db_capacity_bytes,
    ( SELECT COALESCE(sum(images.bytes), (0)::bigint) AS "coalesce"
           FROM public.images) AS blob_bytes,
    blob_capacity_bytes,
    capacity_warn_pct,
    round(((100.0 * (pg_database_size(current_database()))::numeric) / (db_capacity_bytes)::numeric), 1) AS db_used_pct,
    round(((100.0 * (( SELECT COALESCE(sum(images.bytes), (0)::bigint) AS "coalesce"
           FROM public.images))::numeric) / (blob_capacity_bytes)::numeric), 1) AS blob_used_pct
   FROM public.app_settings s;
CREATE VIEW public.admin_table_sizes AS
 SELECT c.relname AS table_name,
    pg_total_relation_size((c.oid)::regclass) AS total_bytes,
    pg_relation_size((c.oid)::regclass) AS table_bytes,
    pg_indexes_size((c.oid)::regclass) AS index_bytes,
    (GREATEST(c.reltuples, (0)::real))::bigint AS estimated_rows
   FROM (pg_class c
     JOIN pg_namespace n ON ((n.oid = c.relnamespace)))
  WHERE ((n.nspname = "current_schema"()) AND (c.relkind = 'r'::"char"));
CREATE TABLE public.plan_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    type public.plan_entry_type NOT NULL,
    title text NOT NULL,
    start_date date NOT NULL,
    end_date date,
    start_time time without time zone,
    end_time time without time zone,
    info text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_entries_check CHECK ((((type = 'single'::public.plan_entry_type) AND ((end_date IS NULL) OR (end_date = start_date))) OR ((type = 'bucket'::public.plan_entry_type) AND (end_date IS NOT NULL) AND (end_date >= start_date)))),
    CONSTRAINT plan_entries_check1 CHECK (((end_time IS NULL) OR (start_time IS NOT NULL))),
    CONSTRAINT plan_entries_check2 CHECK (((type = 'bucket'::public.plan_entry_type) OR (end_time IS NULL) OR (end_time > start_time))),
    CONSTRAINT plan_entries_info_check CHECK ((char_length(info) <= 2000)),
    CONSTRAINT plan_entries_title_check CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 120)))
);
CREATE TABLE public.spots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    title text NOT NULL,
    address text,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    base_category public.spot_category NOT NULL,
    info text,
    link text,
    stay_from date,
    stay_to date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT spots_address_check CHECK ((char_length(address) <= 300)),
    CONSTRAINT spots_check CHECK (((base_category = 'home'::public.spot_category) OR ((stay_from IS NULL) AND (stay_to IS NULL)))),
    CONSTRAINT spots_check1 CHECK (((stay_to IS NULL) OR (stay_from IS NULL) OR (stay_to >= stay_from))),
    CONSTRAINT spots_info_check CHECK ((char_length(info) <= 2000)),
    CONSTRAINT spots_lat_check CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision))),
    CONSTRAINT spots_link_check CHECK (((link ~* '^https?://'::text) AND (char_length(link) <= 500))),
    CONSTRAINT spots_lng_check CHECK (((lng >= ('-180'::integer)::double precision) AND (lng <= (180)::double precision))),
    CONSTRAINT spots_title_check CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 120)))
);
CREATE TABLE public.trip_members (
    trip_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.trip_role NOT NULL,
    invited_via uuid,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_by uuid,
    start_date date,
    end_date date,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    bbox_min_lng double precision NOT NULL,
    bbox_min_lat double precision NOT NULL,
    bbox_max_lng double precision NOT NULL,
    bbox_max_lat double precision NOT NULL,
    primary_home_spot_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trips_bbox_max_lat_check CHECK (((bbox_max_lat >= ('-90'::integer)::double precision) AND (bbox_max_lat <= (90)::double precision))),
    CONSTRAINT trips_bbox_max_lng_check CHECK (((bbox_max_lng >= ('-180'::integer)::double precision) AND (bbox_max_lng <= (180)::double precision))),
    CONSTRAINT trips_bbox_min_lat_check CHECK (((bbox_min_lat >= ('-90'::integer)::double precision) AND (bbox_min_lat <= (90)::double precision))),
    CONSTRAINT trips_bbox_min_lng_check CHECK (((bbox_min_lng >= ('-180'::integer)::double precision) AND (bbox_min_lng <= (180)::double precision))),
    CONSTRAINT trips_check CHECK (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT trips_check1 CHECK (((bbox_min_lng <= bbox_max_lng) AND (bbox_min_lat <= bbox_max_lat))),
    CONSTRAINT trips_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 100))),
    CONSTRAINT trips_timezone_check CHECK (((char_length(timezone) >= 1) AND (char_length(timezone) <= 64)))
);
CREATE VIEW public.admin_trip_overview AS
 SELECT id,
    name,
    created_at,
    created_by,
    ( SELECT m.user_id
           FROM public.trip_members m
          WHERE ((m.trip_id = t.id) AND (m.role = 'owner'::public.trip_role))) AS owner_id,
    (( SELECT count(*) AS count
           FROM public.trip_members m
          WHERE (m.trip_id = t.id)))::integer AS members,
    (( SELECT count(*) AS count
           FROM public.spots s
          WHERE (s.trip_id = t.id)))::integer AS spots,
    (( SELECT count(*) AS count
           FROM public.plan_entries p
          WHERE (p.trip_id = t.id)))::integer AS plan_entries,
    (( SELECT count(*) AS count
           FROM public.images i
          WHERE (i.trip_id = t.id)))::integer AS images,
    ( SELECT COALESCE(sum(i.bytes), (0)::bigint) AS "coalesce"
           FROM public.images i
          WHERE (i.trip_id = t.id)) AS image_bytes,
    ( SELECT max(e.created_at) AS max
           FROM public.activity_events e
          WHERE (e.trip_id = t.id)) AS last_activity_at
   FROM public.trips t;
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discord_id text NOT NULL,
    username text NOT NULL,
    display_name text,
    avatar_url text,
    locale public.app_locale DEFAULT 'en'::public.app_locale NOT NULL,
    app_role public.app_role DEFAULT 'user'::public.app_role NOT NULL,
    max_images integer,
    max_bytes bigint,
    suspended_at timestamp with time zone,
    suspended_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    CONSTRAINT users_discord_id_check CHECK ((discord_id ~ '^[0-9]{5,25}$'::text)),
    CONSTRAINT users_display_name_check CHECK ((char_length(display_name) <= 64)),
    CONSTRAINT users_max_bytes_check CHECK ((max_bytes >= 0)),
    CONSTRAINT users_max_images_check CHECK ((max_images >= 0)),
    CONSTRAINT users_suspended_reason_check CHECK ((char_length(suspended_reason) <= 500)),
    CONSTRAINT users_username_check CHECK (((char_length(username) >= 1) AND (char_length(username) <= 64)))
);
CREATE VIEW public.user_quota_usage AS
 SELECT u.id AS user_id,
    COALESCE(u.max_images, s.default_max_images) AS max_images,
    COALESCE(u.max_bytes, s.default_max_bytes) AS max_bytes,
    ((u.max_images IS NOT NULL) OR (u.max_bytes IS NOT NULL)) AS has_override,
    COALESCE(i.used_images, 0) AS used_images,
    COALESCE(i.used_bytes, (0)::bigint) AS used_bytes
   FROM ((public.users u
     CROSS JOIN public.app_settings s)
     LEFT JOIN ( SELECT images.uploaded_by,
            (count(*))::integer AS used_images,
            sum(images.bytes) AS used_bytes
           FROM public.images
          GROUP BY images.uploaded_by) i ON ((i.uploaded_by = u.id)));
CREATE VIEW public.admin_user_overview AS
 SELECT u.id,
    u.discord_id,
    u.username,
    u.display_name,
    u.avatar_url,
    u.app_role,
    u.created_at,
    u.last_login_at,
    u.last_seen_at,
    u.suspended_at,
    q.used_images,
    q.max_images,
    q.used_bytes,
    q.max_bytes,
    q.has_override,
    (( SELECT count(*) AS count
           FROM public.trip_members m
          WHERE (m.user_id = u.id)))::integer AS trips_member,
    (( SELECT count(*) AS count
           FROM public.trip_members m
          WHERE ((m.user_id = u.id) AND (m.role = 'owner'::public.trip_role))))::integer AS trips_owned,
    (( SELECT count(*) AS count
           FROM public.spots sp
          WHERE (sp.created_by = u.id)))::integer AS spots_created,
    (( SELECT count(*) AS count
           FROM public.activity_events e
          WHERE ((e.actor_id = u.id) AND (e.created_at > (now() - '30 days'::interval)))))::integer AS events_30d,
    ( SELECT max(e.created_at) AS max
           FROM public.activity_events e
          WHERE (e.actor_id = u.id)) AS last_activity_at
   FROM (public.users u
     JOIN public.user_quota_usage q ON ((q.user_id = u.id)));
CREATE TABLE public.blob_deletions (
    id bigint NOT NULL,
    storage_key text NOT NULL,
    enqueued_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text
);
ALTER TABLE public.blob_deletions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.blob_deletions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.geocode_cache (
    query_key text NOT NULL,
    response jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.metrics_daily (
    day date NOT NULL,
    users_total integer NOT NULL,
    users_new integer NOT NULL,
    users_active integer NOT NULL,
    trips_total integer NOT NULL,
    spots_total integer NOT NULL,
    plan_entries_total integer NOT NULL,
    images_total integer NOT NULL,
    image_bytes_total bigint NOT NULL,
    db_bytes bigint NOT NULL,
    events_total integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE VIEW public.plan_entry_home AS
 SELECT pe.id AS plan_entry_id,
    COALESCE(( SELECT s.id
           FROM public.spots s
          WHERE ((s.trip_id = pe.trip_id) AND (s.base_category = 'home'::public.spot_category) AND (s.stay_from IS NOT NULL) AND (s.stay_from <= COALESCE(pe.end_date, pe.start_date)) AND (COALESCE(s.stay_to, s.stay_from) >= pe.start_date))
          ORDER BY s.stay_from
         LIMIT 1), t.primary_home_spot_id) AS home_spot_id
   FROM (public.plan_entries pe
     JOIN public.trips t ON ((t.id = pe.trip_id)));
CREATE TABLE public.plan_entry_spots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    plan_entry_id uuid NOT NULL,
    spot_id uuid NOT NULL,
    visit_date date,
    visit_time time without time zone,
    info text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_entry_spots_check CHECK (((visit_time IS NULL) OR (visit_date IS NOT NULL))),
    CONSTRAINT plan_entry_spots_info_check CHECK ((char_length(info) <= 2000))
);
CREATE TABLE public.quota_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    requested_images integer,
    requested_bytes bigint,
    message text,
    status public.request_status DEFAULT 'pending'::public.request_status NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    decision_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT quota_requests_check CHECK (((requested_images IS NOT NULL) OR (requested_bytes IS NOT NULL))),
    CONSTRAINT quota_requests_check1 CHECK (((status = 'pending'::public.request_status) = (decided_at IS NULL))),
    CONSTRAINT quota_requests_decision_note_check CHECK ((char_length(decision_note) <= 500)),
    CONSTRAINT quota_requests_message_check CHECK ((char_length(message) <= 500)),
    CONSTRAINT quota_requests_requested_bytes_check CHECK ((requested_bytes > 0)),
    CONSTRAINT quota_requests_requested_images_check CHECK ((requested_images > 0))
);
CREATE TABLE public.sessions (
    id text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    user_agent text,
    CONSTRAINT sessions_check CHECK ((expires_at > created_at)),
    CONSTRAINT sessions_id_check CHECK ((id ~ '^[0-9a-f]{64}$'::text))
);
CREATE VIEW public.spots_view AS
 SELECT s.id,
    s.trip_id,
    s.title,
    s.address,
    s.lat,
    s.lng,
    s.base_category,
    s.info,
    s.link,
    s.stay_from,
    s.stay_to,
    s.created_by,
    s.created_at,
    s.updated_at,
        CASE
            WHEN (s.base_category = 'home'::public.spot_category) THEN 'home'::public.display_category
            WHEN (p.plan_count > 0) THEN 'planned'::public.display_category
            ELSE ((s.base_category)::text)::public.display_category
        END AS display_category,
    COALESCE(p.plan_count, 0) AS plan_count,
    p.first_scheduled_at
   FROM (public.spots s
     LEFT JOIN LATERAL ( SELECT (count(*))::integer AS plan_count,
            min((COALESCE(pes.visit_date, pe.start_date) + COALESCE(pes.visit_time, pe.start_time, '00:00:00'::time without time zone))) AS first_scheduled_at
           FROM (public.plan_entry_spots pes
             JOIN public.plan_entries pe ON ((pe.id = pes.plan_entry_id)))
          WHERE (pes.spot_id = s.id)) p ON (true));
CREATE TABLE public.trip_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    code text NOT NULL,
    role public.trip_role DEFAULT 'visitor'::public.trip_role NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    revoked_at timestamp with time zone,
    uses integer DEFAULT 0 NOT NULL,
    CONSTRAINT trip_invites_check CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '7 days'::interval)))),
    CONSTRAINT trip_invites_code_check CHECK ((code ~ '^[A-Z0-9]{3}-[A-Z0-9]{4}$'::text)),
    CONSTRAINT trip_invites_role_check CHECK ((role = ANY (ARRAY['planner'::public.trip_role, 'visitor'::public.trip_role]))),
    CONSTRAINT trip_invites_uses_check CHECK ((uses >= 0))
);
ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.blob_deletions
    ADD CONSTRAINT blob_deletions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.geocode_cache
    ADD CONSTRAINT geocode_cache_pkey PRIMARY KEY (query_key);
ALTER TABLE ONLY public.images
    ADD CONSTRAINT images_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.images
    ADD CONSTRAINT images_storage_key_key UNIQUE (storage_key);
ALTER TABLE ONLY public.metrics_daily
    ADD CONSTRAINT metrics_daily_pkey PRIMARY KEY (day);
ALTER TABLE ONLY public.plan_entries
    ADD CONSTRAINT plan_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.plan_entries
    ADD CONSTRAINT plan_entries_trip_id_id_key UNIQUE (trip_id, id);
ALTER TABLE ONLY public.plan_entry_spots
    ADD CONSTRAINT plan_entry_spots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.quota_requests
    ADD CONSTRAINT quota_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.spots
    ADD CONSTRAINT spots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.spots
    ADD CONSTRAINT spots_trip_id_id_key UNIQUE (trip_id, id);
ALTER TABLE ONLY public.trip_invites
    ADD CONSTRAINT trip_invites_code_key UNIQUE (code);
ALTER TABLE ONLY public.trip_invites
    ADD CONSTRAINT trip_invites_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.trip_members
    ADD CONSTRAINT trip_members_pkey PRIMARY KEY (trip_id, user_id);
ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_discord_id_key UNIQUE (discord_id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
CREATE INDEX activity_events_action_idx ON public.activity_events USING btree (action, created_at DESC);
CREATE INDEX activity_events_actor_idx ON public.activity_events USING btree (actor_id, created_at DESC);
CREATE INDEX activity_events_created_at_idx ON public.activity_events USING btree (created_at DESC);
CREATE INDEX activity_events_trip_idx ON public.activity_events USING btree (trip_id, created_at DESC);
CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log USING btree (created_at DESC);
CREATE INDEX admin_audit_log_target_idx ON public.admin_audit_log USING btree (target_user_id, created_at DESC);
CREATE INDEX geocode_cache_created_at_idx ON public.geocode_cache USING btree (created_at);
CREATE INDEX images_spot_idx ON public.images USING btree (spot_id, sort_order);
CREATE INDEX images_uploaded_by_idx ON public.images USING btree (uploaded_by);
CREATE INDEX plan_entries_trip_start_idx ON public.plan_entries USING btree (trip_id, start_date, start_time);
CREATE INDEX plan_entry_spots_entry_idx ON public.plan_entry_spots USING btree (plan_entry_id, sort_order);
CREATE INDEX plan_entry_spots_spot_idx ON public.plan_entry_spots USING btree (spot_id);
CREATE UNIQUE INDEX quota_requests_one_pending_idx ON public.quota_requests USING btree (user_id) WHERE (status = 'pending'::public.request_status);
CREATE INDEX quota_requests_status_idx ON public.quota_requests USING btree (status, created_at);
CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);
CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);
CREATE INDEX spots_created_by_idx ON public.spots USING btree (created_by);
CREATE INDEX spots_search_trgm_idx ON public.spots USING gin (lower(((((title || ' '::text) || COALESCE(address, ''::text)) || ' '::text) || COALESCE(info, ''::text))) public.gin_trgm_ops);
CREATE INDEX spots_trip_category_idx ON public.spots USING btree (trip_id, base_category);
CREATE INDEX spots_trip_location_idx ON public.spots USING btree (trip_id, lat, lng);
CREATE INDEX trip_invites_trip_id_idx ON public.trip_invites USING btree (trip_id);
CREATE UNIQUE INDEX trip_members_one_owner_idx ON public.trip_members USING btree (trip_id) WHERE (role = 'owner'::public.trip_role);
CREATE INDEX trip_members_user_id_idx ON public.trip_members USING btree (user_id);
CREATE INDEX trips_created_by_idx ON public.trips USING btree (created_by);
CREATE INDEX users_created_at_idx ON public.users USING btree (created_at);
CREATE INDEX users_last_seen_at_idx ON public.users USING btree (last_seen_at);
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER images_enqueue_blob_deletion AFTER DELETE ON public.images FOR EACH ROW EXECUTE FUNCTION public.enqueue_blob_deletion();
CREATE TRIGGER plan_entries_clear_visits AFTER UPDATE OF start_date, end_date ON public.plan_entries FOR EACH ROW EXECUTE FUNCTION public.clear_out_of_range_visits();
CREATE TRIGGER plan_entries_updated_at BEFORE UPDATE ON public.plan_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER plan_entry_spots_visit_date BEFORE INSERT OR UPDATE OF visit_date, plan_entry_id ON public.plan_entry_spots FOR EACH ROW EXECUTE FUNCTION public.check_visit_date_in_entry();
CREATE TRIGGER spots_clear_primary_home AFTER UPDATE OF base_category ON public.spots FOR EACH ROW EXECUTE FUNCTION public.clear_primary_home_on_recategorize();
CREATE TRIGGER spots_updated_at BEFORE UPDATE ON public.spots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE CONSTRAINT TRIGGER trip_members_owner_required AFTER INSERT OR DELETE OR UPDATE ON public.trip_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_trip_has_owner();
CREATE CONSTRAINT TRIGGER trips_owner_required AFTER INSERT ON public.trips DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_trip_has_owner();
CREATE TRIGGER trips_primary_home_category BEFORE INSERT OR UPDATE OF primary_home_spot_id ON public.trips FOR EACH ROW EXECUTE FUNCTION public.check_primary_home_category();
CREATE TRIGGER trips_updated_at BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER users_drop_sessions_on_suspend AFTER UPDATE OF suspended_at ON public.users FOR EACH ROW EXECUTE FUNCTION public.drop_sessions_on_suspend();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_target_trip_id_fkey FOREIGN KEY (target_trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.images
    ADD CONSTRAINT images_trip_id_spot_id_fkey FOREIGN KEY (trip_id, spot_id) REFERENCES public.spots(trip_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.images
    ADD CONSTRAINT images_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.plan_entries
    ADD CONSTRAINT plan_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.plan_entries
    ADD CONSTRAINT plan_entries_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.plan_entry_spots
    ADD CONSTRAINT plan_entry_spots_trip_id_plan_entry_id_fkey FOREIGN KEY (trip_id, plan_entry_id) REFERENCES public.plan_entries(trip_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.plan_entry_spots
    ADD CONSTRAINT plan_entry_spots_trip_id_spot_id_fkey FOREIGN KEY (trip_id, spot_id) REFERENCES public.spots(trip_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.quota_requests
    ADD CONSTRAINT quota_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.quota_requests
    ADD CONSTRAINT quota_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.spots
    ADD CONSTRAINT spots_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.spots
    ADD CONSTRAINT spots_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.trip_invites
    ADD CONSTRAINT trip_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.trip_invites
    ADD CONSTRAINT trip_invites_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.trip_members
    ADD CONSTRAINT trip_members_invited_via_fkey FOREIGN KEY (invited_via) REFERENCES public.trip_invites(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.trip_members
    ADD CONSTRAINT trip_members_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.trip_members
    ADD CONSTRAINT trip_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_primary_home_fk FOREIGN KEY (id, primary_home_spot_id) REFERENCES public.spots(trip_id, id) ON DELETE SET NULL (primary_home_spot_id) DEFERRABLE INITIALLY DEFERRED;