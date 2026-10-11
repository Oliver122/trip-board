-- Constraint checks for schema.sql. Run against a fresh database:
--   psql -v ON_ERROR_STOP=1 -f schema.sql -f checks.sql
-- Every block raises if a rule is not enforced. All changes are rolled back.
-- Results print as NOTICE lines ("ok   …"); query output is discarded.

\o /dev/null
BEGIN;

CREATE FUNCTION pg_temp.expect_error(stmt text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'ok   %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL % (statement succeeded)', label;
END $$;

CREATE FUNCTION pg_temp.expect(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', label; END IF;
  RAISE NOTICE 'ok   %', label;
END $$;

INSERT INTO users (id, discord_id, username) VALUES
  ('00000000-0000-0000-0000-000000000001', '100000000000000001', 'sven'),
  ('00000000-0000-0000-0000-000000000002', '100000000000000002', 'aiko'),
  ('00000000-0000-0000-0000-000000000003', '100000000000000003', 'tom');

INSERT INTO trips (id, name, created_by, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat)
VALUES ('10000000-0000-0000-0000-000000000001', 'Japan 2026',
        '00000000-0000-0000-0000-000000000001', 122.9, 24.0, 153.9, 45.6);
INSERT INTO trip_members (trip_id, user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'planner');

INSERT INTO spot_kinds (id, trip_id, preset, color, symbol, sort_order) VALUES
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'must_go', '#E5484D', 'exclamation', 0),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'maybe',   '#30A46C', 'question',    1);

SET CONSTRAINTS ALL IMMEDIATE;

-- Ownership ---------------------------------------------------------------
SELECT pg_temp.expect_error($$
  INSERT INTO trip_members VALUES ('10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003', 'owner')$$, 'second owner rejected');

SELECT pg_temp.expect_error($$
  UPDATE trip_members SET role = 'planner'
   WHERE user_id = '00000000-0000-0000-0000-000000000001'$$, 'trip without owner rejected');

SELECT pg_temp.expect_error($$
  INSERT INTO trips (name, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat)
  VALUES ('No owner', 0, 0, 1, 1)$$, 'trip created without owner rejected');

SET CONSTRAINTS ALL DEFERRED;
UPDATE trip_members SET role = 'planner' WHERE user_id = '00000000-0000-0000-0000-000000000001';
UPDATE trip_members SET role = 'owner'   WHERE user_id = '00000000-0000-0000-0000-000000000002';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.expect(
  (SELECT user_id FROM trip_members WHERE role = 'owner') = '00000000-0000-0000-0000-000000000002',
  'ownership transfer works inside one transaction');
SET CONSTRAINTS ALL DEFERRED;
UPDATE trip_members SET role = 'planner' WHERE user_id = '00000000-0000-0000-0000-000000000002';
UPDATE trip_members SET role = 'owner'   WHERE user_id = '00000000-0000-0000-0000-000000000001';
SET CONSTRAINTS ALL IMMEDIATE;

-- Invites -----------------------------------------------------------------
INSERT INTO trip_invites (trip_id, code, created_by)
VALUES ('10000000-0000-0000-0000-000000000001', 'JPN-7K3Q', '00000000-0000-0000-0000-000000000001');
SELECT pg_temp.expect(
  (SELECT role = 'visitor' AND expires_at = created_at + interval '7 days'
     FROM trip_invites WHERE code = 'JPN-7K3Q'),
  'invite defaults: visitor, 7 days');
SELECT pg_temp.expect_error($$
  INSERT INTO trip_invites (trip_id, code, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'JPN-AAAA', 'owner')$$, 'owner invite rejected');
SELECT pg_temp.expect_error($$
  INSERT INTO trip_invites (trip_id, code, expires_at) VALUES
  ('10000000-0000-0000-0000-000000000001', 'JPN-BBBB', now() + interval '8 days')$$, 'invite > 7 days rejected');
SELECT pg_temp.expect_error($$
  INSERT INTO trip_invites (trip_id, code) VALUES
  ('10000000-0000-0000-0000-000000000001', 'jpn-7k3q')$$, 'bad invite code format rejected');

INSERT INTO users (id, discord_id, username) VALUES
  ('00000000-0000-0000-0000-000000000006', '100000000000000006', 'rin');
SELECT pg_temp.expect_error($$
  UPDATE trip_invites SET used_by = '00000000-0000-0000-0000-000000000006' WHERE code = 'JPN-7K3Q'$$,
  'invite cannot name a user without a use time');
UPDATE trip_invites SET used_at = now(), used_by = '00000000-0000-0000-0000-000000000006'
 WHERE code = 'JPN-7K3Q';
DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000006';
SELECT pg_temp.expect(
  (SELECT used_at IS NOT NULL AND used_by IS NULL FROM trip_invites WHERE code = 'JPN-7K3Q'),
  'deleting the joining user keeps the invite used');

-- Spots -------------------------------------------------------------------
-- A spot and its kind links are written together; the link rule is checked
-- when the constraint triggers fire (deferred here, as at commit).
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO spots (id, trip_id, title, lat, lng, base_category) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Shibuya Sky', 35.658, 139.702, 'kind'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Nara Park',   34.685, 135.843, 'kind');
INSERT INTO spot_kind_links (trip_id, spot_id, kind_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002');
INSERT INTO spots (id, trip_id, title, lat, lng, base_category, stay_from, stay_to) VALUES
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Hotel Gracery', 35.694, 139.701, 'home', '2026-04-12', '2026-04-16'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Kyoto Ryokan',  35.003, 135.778, 'home', '2026-04-17', '2026-04-19');
SET CONSTRAINTS ALL IMMEDIATE;

SELECT pg_temp.expect_error($$
  INSERT INTO spots (trip_id, title, lat, lng, base_category, stay_from)
  VALUES ('10000000-0000-0000-0000-000000000001', 'x', 0, 0, 'kind', '2026-01-01')$$,
  'stay dates only on home spots');
SELECT pg_temp.expect_error($$
  INSERT INTO spots (trip_id, title, lat, lng, base_category)
  VALUES ('10000000-0000-0000-0000-000000000001', 'x', 91, 0, 'kind')$$, 'latitude range enforced');
SELECT pg_temp.expect_error($$
  INSERT INTO spots (trip_id, title, lat, lng, base_category, link)
  VALUES ('10000000-0000-0000-0000-000000000001', 'x', 0, 0, 'kind', 'javascript:alert(1)')$$,
  'non-http link rejected');

-- Primary home base -------------------------------------------------------
SELECT pg_temp.expect_error($$
  UPDATE trips SET primary_home_spot_id = '20000000-0000-0000-0000-000000000001'$$,
  'non-home spot cannot be primary home');
UPDATE trips SET primary_home_spot_id = '20000000-0000-0000-0000-000000000003';
SET CONSTRAINTS ALL DEFERRED;
UPDATE spots SET base_category = 'kind', stay_from = NULL, stay_to = NULL
 WHERE id = '20000000-0000-0000-0000-000000000003';
INSERT INTO spot_kind_links (trip_id, spot_id, kind_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.expect((SELECT primary_home_spot_id IS NULL FROM trips),
  'recategorising home spot clears primary home');
SET CONSTRAINTS ALL DEFERRED;
DELETE FROM spot_kind_links WHERE spot_id = '20000000-0000-0000-0000-000000000003';
UPDATE spots SET base_category = 'home', stay_from = '2026-04-12', stay_to = '2026-04-16'
 WHERE id = '20000000-0000-0000-0000-000000000003';
SET CONSTRAINTS ALL IMMEDIATE;

-- Planning ----------------------------------------------------------------
INSERT INTO plan_entries (id, trip_id, type, title, start_date, end_date) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'bucket', 'Tokyo', '2026-04-12', '2026-04-16');
INSERT INTO plan_entries (id, trip_id, type, title, start_date, start_time) VALUES
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'single', 'Nara day trip', '2026-04-20', '08:00');

SELECT pg_temp.expect_error($$
  INSERT INTO plan_entries (trip_id, type, title, start_date)
  VALUES ('10000000-0000-0000-0000-000000000001', 'bucket', 'x', '2026-04-01')$$, 'bucket needs end date');
SELECT pg_temp.expect_error($$
  INSERT INTO plan_entries (trip_id, type, title, start_date, end_date)
  VALUES ('10000000-0000-0000-0000-000000000001', 'single', 'x', '2026-04-01', '2026-04-03')$$,
  'single entry cannot span days');

SELECT pg_temp.expect(
  (SELECT display_category = 'kind' AND kinds -> 0 ->> 'preset' = 'must_go' AND primary_kind_order = 0
     FROM spots_view WHERE id = '20000000-0000-0000-0000-000000000001'),
  'unplanned spot shows its kind');

INSERT INTO plan_entry_spots (trip_id, plan_entry_id, spot_id, visit_date, visit_time) VALUES
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2026-04-13', '18:00'),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2026-04-15', NULL),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', NULL, NULL);

SELECT pg_temp.expect(
  (SELECT display_category = 'planned' AND plan_count = 2
          AND first_scheduled_at = timestamp '2026-04-13 18:00'
     FROM spots_view WHERE id = '20000000-0000-0000-0000-000000000001'),
  'spot in plans shows planned, counts entries, earliest time');
SELECT pg_temp.expect(
  (SELECT first_scheduled_at = timestamp '2026-04-20 08:00'
     FROM spots_view WHERE id = '20000000-0000-0000-0000-000000000002'),
  'spot without visit date inherits entry date/time');

SELECT pg_temp.expect_error($$
  INSERT INTO plan_entry_spots (trip_id, plan_entry_id, spot_id, visit_date) VALUES
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', '2026-04-30')$$, 'visit date outside bucket rejected');

UPDATE plan_entries SET end_date = '2026-04-14' WHERE id = '30000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM plan_entry_spots
    WHERE plan_entry_id = '30000000-0000-0000-0000-000000000001' AND visit_date IS NULL),
  'shrinking bucket clears out-of-range visit dates');

DELETE FROM plan_entry_spots WHERE spot_id = '20000000-0000-0000-0000-000000000002';
SELECT pg_temp.expect(
  (SELECT display_category = 'kind' FROM spots_view WHERE id = '20000000-0000-0000-0000-000000000002'),
  'removing last plan restores the kind display');

-- Home spot per bucket ----------------------------------------------------
SELECT pg_temp.expect(
  (SELECT home_spot_id = '20000000-0000-0000-0000-000000000003'
     FROM plan_entry_home WHERE plan_entry_id = '30000000-0000-0000-0000-000000000001'),
  'bucket resolves overlapping home spot');
UPDATE trips SET primary_home_spot_id = '20000000-0000-0000-0000-000000000004';
SELECT pg_temp.expect(
  (SELECT home_spot_id = '20000000-0000-0000-0000-000000000004'
     FROM plan_entry_home WHERE plan_entry_id = '30000000-0000-0000-0000-000000000002'),
  'entry without overlapping stay falls back to primary home');

-- Cross-trip integrity ----------------------------------------------------
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO trips (id, name, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat)
VALUES ('10000000-0000-0000-0000-000000000002', 'Korea 2027', 124, 33, 131, 39);
INSERT INTO trip_members VALUES ('10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003', 'owner');
INSERT INTO spot_kinds (id, trip_id, preset, color, symbol, sort_order) VALUES
  ('50000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000002', 'must_go', '#E5484D', 'exclamation', 0);
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.expect_error($$
  INSERT INTO plan_entry_spots (trip_id, plan_entry_id, spot_id) VALUES
  ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001')$$, 'plan entry and spot must share a trip');
SELECT pg_temp.expect_error($$
  UPDATE trips SET primary_home_spot_id = '20000000-0000-0000-0000-000000000003'
   WHERE id = '10000000-0000-0000-0000-000000000002'$$, 'primary home must belong to trip');

-- Spot kinds --------------------------------------------------------------
SELECT pg_temp.expect_error($$
  INSERT INTO spot_kind_links (trip_id, spot_id, kind_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
   '50000000-0000-0000-0000-000000000012')$$, 'kind link cannot cross trips');
SELECT pg_temp.expect_error($$
  INSERT INTO spot_kind_links (trip_id, spot_id, kind_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003',
   '50000000-0000-0000-0000-000000000001')$$, 'home spot with a kind rejected');
SELECT pg_temp.expect_error($$
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO spots (trip_id, title, lat, lng, base_category)
  VALUES ('10000000-0000-0000-0000-000000000001', 'No kind', 0, 0, 'kind');
  SET CONSTRAINTS ALL IMMEDIATE$$, 'non-home spot without a kind rejected at commit');
SELECT pg_temp.expect_error($$
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO spots (id, trip_id, title, lat, lng, base_category)
  VALUES ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Three', 0, 0, 'kind');
  INSERT INTO spot_kinds (id, trip_id, name, color, symbol, sort_order) VALUES
    ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Food', '#D9480F', 'food', 2);
  INSERT INTO spot_kind_links (trip_id, spot_id, kind_id) VALUES
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000003');
  SET CONSTRAINTS ALL IMMEDIATE$$, 'spot with three kinds rejected at commit');
INSERT INTO spot_kinds (id, trip_id, name, color, symbol, sort_order) VALUES
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Food', '#D9480F', 'food', 2);
SELECT pg_temp.expect_error($$
  INSERT INTO spot_kinds (trip_id, name, color, symbol, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000001', ' food ', '#0F766E', 'dot', 3)$$, 'kind names are unique per trip, ignoring case');
SELECT pg_temp.expect_error($$
  INSERT INTO spot_kinds (trip_id, name, color, symbol, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000001', '   ', '#0F766E', 'dot', 3)$$, 'blank kind name rejected');
SELECT pg_temp.expect_error($$
  INSERT INTO spot_kinds (trip_id, preset, color, symbol, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000001', 'maybe', '#0F766E', 'dot', 3)$$, 'a preset kind exists once per trip');
SELECT pg_temp.expect_error($$
  INSERT INTO spot_kinds (trip_id, name, color, symbol, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Pizza', '#0F766E', 'pizza', 3)$$, 'unknown kind symbol rejected');
SELECT pg_temp.expect_error($$
  INSERT INTO spot_kinds (trip_id, name, color, symbol, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Pizza', 'red', 'dot', 3)$$, 'kind color must be upper-case hex');
SELECT pg_temp.expect_error($$
  INSERT INTO spot_kinds (trip_id, color, symbol, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000001', '#0F766E', 'dot', 3)$$, 'kind needs a name unless it is a preset');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO spot_kind_links (trip_id, spot_id, kind_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.expect(
  (SELECT jsonb_array_length(kinds) = 2
          AND kinds -> 0 ->> 'preset' = 'must_go' AND kinds -> 1 ->> 'name' = 'Food'
          AND primary_kind_order = 0
     FROM spots_view WHERE id = '20000000-0000-0000-0000-000000000001')
  AND (SELECT kinds = '[]'::jsonb AND primary_kind_order IS NULL
     FROM spots_view WHERE id = '20000000-0000-0000-0000-000000000003'),
  'spots_view lists kinds in trip order; home spots have none');
DELETE FROM spot_kind_links
 WHERE spot_id = '20000000-0000-0000-0000-000000000001' AND kind_id = '50000000-0000-0000-0000-000000000003';

-- Images & quota ----------------------------------------------------------
INSERT INTO images (trip_id, spot_id, uploaded_by, storage_key, bytes, width, height) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000002', 'trips/1/a.webp', 500000, 2048, 1365),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000002', 'trips/1/b.webp', 300000, 1600, 1200);
SELECT pg_temp.expect(
  (SELECT used_images = 2 AND used_bytes = 800000 FROM user_quota_usage
    WHERE user_id = '00000000-0000-0000-0000-000000000002'),
  'quota usage view sums images and bytes');
SELECT pg_temp.expect_error($$
  INSERT INTO images (trip_id, spot_id, storage_key, bytes, width, height, mime) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'trips/1/c.png', 1, 1, 1, 'image/png')$$, 'only webp stored');

-- Admin: quotas & settings ------------------------------------------------
SELECT pg_temp.expect(
  (SELECT max_images = 100 AND max_bytes = 209715200 AND NOT has_override FROM user_quota_usage
    WHERE user_id = '00000000-0000-0000-0000-000000000002'),
  'quota falls back to platform defaults');
UPDATE users SET max_images = 500 WHERE id = '00000000-0000-0000-0000-000000000002';
UPDATE app_settings SET default_max_images = 50;
SELECT pg_temp.expect(
  (SELECT max_images = 500 AND has_override FROM user_quota_usage
    WHERE user_id = '00000000-0000-0000-0000-000000000002')
  AND (SELECT max_images = 50 FROM user_quota_usage
    WHERE user_id = '00000000-0000-0000-0000-000000000003'),
  'per-user override beats default; others follow new default');
SELECT pg_temp.expect_error($$INSERT INTO app_settings (id) VALUES (false)$$, 'app_settings is single-row');

-- Admin: suspension -------------------------------------------------------
INSERT INTO sessions (id, user_id, expires_at)
VALUES (repeat('a', 64), '00000000-0000-0000-0000-000000000003', now() + interval '30 days');
UPDATE users SET suspended_at = now(), suspended_reason = 'spam'
 WHERE id = '00000000-0000-0000-0000-000000000003';
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM sessions WHERE user_id = '00000000-0000-0000-0000-000000000003'),
  'suspending a user deletes their sessions');

-- Admin: quota requests ---------------------------------------------------
INSERT INTO quota_requests (user_id, requested_bytes, message)
VALUES ('00000000-0000-0000-0000-000000000002', 524288000, 'Lots of temple photos');
SELECT pg_temp.expect_error($$
  INSERT INTO quota_requests (user_id, requested_images)
  VALUES ('00000000-0000-0000-0000-000000000002', 50)$$, 'only one pending request per user');
SELECT pg_temp.expect_error($$
  UPDATE quota_requests SET status = 'approved'$$, 'decision requires decided_at');
UPDATE quota_requests SET status = 'approved', decided_at = now(),
       decided_by = '00000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_error($$
  INSERT INTO quota_requests (user_id) VALUES ('00000000-0000-0000-0000-000000000002')$$,
  'request must ask for images or bytes');

-- Admin: activity, audit, metrics -----------------------------------------
INSERT INTO activity_events (actor_id, trip_id, action, entity_id, metadata) VALUES
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'spot.create',
   '20000000-0000-0000-0000-000000000002', '{"title":"Nara Park","trip":"Japan 2026"}');
SELECT pg_temp.expect_error($$
  INSERT INTO activity_events (action) VALUES ('Spot Created')$$, 'activity action format enforced');
INSERT INTO admin_audit_log (admin_id, action, target_user_id, before, after, reason) VALUES
  ('00000000-0000-0000-0000-000000000001', 'user.quota_update', '00000000-0000-0000-0000-000000000002',
   '{"max_images":null}', '{"max_images":500}', 'approved request');

SELECT snapshot_daily_metrics(current_date);
SELECT snapshot_daily_metrics(current_date);
SELECT pg_temp.expect(
  (SELECT count(*) = 1 AND bool_and(users_total = 3 AND users_active = 1 AND images_total = 2
                                    AND image_bytes_total = 800000 AND db_bytes > 0)
     FROM metrics_daily),
  'daily snapshot is idempotent and counts correctly');

SELECT pg_temp.expect(
  (SELECT trips_owned = 0 AND trips_member = 1 AND events_30d = 1 AND used_images = 2
     FROM admin_user_overview WHERE id = '00000000-0000-0000-0000-000000000002'),
  'admin user overview aggregates usage and activity');
SELECT pg_temp.expect(
  (SELECT members = 2 AND spots = 4 AND images = 2 FROM admin_trip_overview
    WHERE id = '10000000-0000-0000-0000-000000000001'),
  'admin trip overview aggregates counts');
SELECT pg_temp.expect(
  EXISTS (SELECT 1 FROM admin_table_sizes WHERE table_name = 'spots' AND total_bytes > 0)
  AND (SELECT db_bytes > 0 AND db_used_pct >= 0 FROM admin_storage_summary),
  'storage views report sizes');

-- Spot discussions --------------------------------------------------------
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO trips (id, name, created_by, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat)
VALUES ('10000000-0000-0000-0000-000000000009', 'Other trip',
        '00000000-0000-0000-0000-000000000001', 0, 0, 1, 1);
INSERT INTO trip_members (trip_id, user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'owner');
INSERT INTO spots (id, trip_id, title, lat, lng, base_category) VALUES
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000009', 'Elsewhere', 0, 0, 'kind');
INSERT INTO spot_kinds (id, trip_id, preset, color, symbol, sort_order) VALUES
  ('50000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000009', 'must_go', '#E5484D', 'exclamation', 0);
INSERT INTO spot_kind_links (trip_id, spot_id, kind_id) VALUES
  ('10000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000019');
SET CONSTRAINTS ALL IMMEDIATE;

SELECT pg_temp.expect_error($$
  INSERT INTO spot_comments (trip_id, spot_id, author_id, body)
  VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000009',
          '00000000-0000-0000-0000-000000000002', 'wrong trip')$$, 'comment on a spot of another trip rejected');
SELECT pg_temp.expect_error($$
  INSERT INTO spot_comments (trip_id, spot_id, author_id, body)
  VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000002', '   ')$$, 'blank comment rejected');
SELECT pg_temp.expect_error($$
  INSERT INTO spot_comments (trip_id, spot_id, author_id, body)
  VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000002', repeat('x', 2001))$$, 'comment over 2000 characters rejected');

INSERT INTO users (id, discord_id, username) VALUES
  ('00000000-0000-0000-0000-000000000005', '100000000000000005', 'quinn');
INSERT INTO spot_comments (id, trip_id, spot_id, author_id, body) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'Early morning only?');
INSERT INTO spot_comment_reads (user_id, trip_id, spot_id, last_read_at) VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', now());

SELECT pg_temp.expect_error($$
  INSERT INTO spot_comment_reads (user_id, trip_id, spot_id, last_read_at)
  VALUES ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000009', now())$$, 'read row for a spot of another trip rejected');

DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000005';
SELECT pg_temp.expect(
  (SELECT author_id IS NULL AND body = 'Early morning only?' FROM spot_comments WHERE id = '30000000-0000-0000-0000-000000000001'),
  'deleting the author keeps the comment with author null');

DELETE FROM spots WHERE id = '20000000-0000-0000-0000-000000000002';
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM spot_comments WHERE spot_id = '20000000-0000-0000-0000-000000000002')
  AND NOT EXISTS (SELECT 1 FROM spot_comment_reads WHERE spot_id = '20000000-0000-0000-0000-000000000002'),
  'deleting the spot deletes its comments and read rows');

INSERT INTO users (id, discord_id, username) VALUES
  ('00000000-0000-0000-0000-000000000004', '100000000000000004', 'pat');
INSERT INTO spot_comment_reads (user_id, trip_id, spot_id, last_read_at) VALUES
  ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', now());
DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000004';
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM spot_comment_reads WHERE user_id = '00000000-0000-0000-0000-000000000004'),
  'deleting a user deletes their read rows');

-- Cascades ----------------------------------------------------------------
DELETE FROM spots WHERE id = '20000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM blob_deletions WHERE storage_key = 'trips/1/a.webp')
  AND NOT EXISTS (SELECT 1 FROM plan_entry_spots WHERE spot_id = '20000000-0000-0000-0000-000000000001'),
  'deleting spot removes plan links and queues blob deletion');

DELETE FROM trips WHERE id = '10000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM spots WHERE trip_id = '10000000-0000-0000-0000-000000000001')
  AND NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = '10000000-0000-0000-0000-000000000001')
  AND (SELECT count(*) = 2 FROM blob_deletions),
  'deleting trip cascades and queues all blobs');
SELECT pg_temp.expect(
  (SELECT trip_id IS NULL AND metadata->>'trip' = 'Japan 2026' FROM activity_events WHERE action = 'spot.create'),
  'activity history survives trip deletion');

ROLLBACK;
