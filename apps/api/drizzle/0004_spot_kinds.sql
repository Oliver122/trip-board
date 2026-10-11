-- Trip Board migration 0004_spot_kinds. Board admins, per-trip spot kinds and
-- single-use invites (step 28).

-- R-28-01: board admin between planner and owner. Rank lives in the API.
ALTER TYPE trip_role ADD VALUE 'admin' AFTER 'owner';

-- R-28-18: one code = one new member. Invites that were joined are used up.
ALTER TABLE trip_invites
  ADD COLUMN used_at timestamptz,
  ADD COLUMN used_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT trip_invites_used_check CHECK (used_by IS NULL OR used_at IS NOT NULL);

UPDATE trip_invites i
   SET used_by = first_join.user_id,
       used_at = COALESCE(first_join.joined_at, now())
  FROM trip_invites src
  LEFT JOIN LATERAL (
    SELECT m.user_id, m.joined_at
      FROM trip_members m
     WHERE m.invited_via = src.id
     ORDER BY m.joined_at
     LIMIT 1
  ) first_join ON true
 WHERE src.id = i.id AND i.uses > 0;

ALTER TABLE trip_invites DROP COLUMN uses;

-- R-28-03: per-trip spot kinds.
CREATE TABLE spot_kinds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name        text        CHECK (char_length(btrim(name)) BETWEEN 1 AND 30),
  preset      text        CHECK (preset IN ('must_go', 'maybe')),
  color       text        NOT NULL CHECK (color ~ '^#[0-9A-F]{6}$'),
  symbol      text        NOT NULL CHECK (symbol IN (
                'exclamation', 'question', 'dot', 'star', 'heart', 'food',
                'coffee', 'camera', 'shopping', 'nature', 'temple', 'cat')),
  sort_order  integer     NOT NULL CHECK (sort_order >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, id),
  CHECK (name IS NOT NULL OR preset IS NOT NULL)
);

CREATE INDEX spot_kinds_trip_order_idx ON spot_kinds (trip_id, sort_order);
CREATE UNIQUE INDEX spot_kinds_trip_name_idx ON spot_kinds (trip_id, lower(btrim(name)))
  WHERE name IS NOT NULL;
CREATE UNIQUE INDEX spot_kinds_trip_preset_idx ON spot_kinds (trip_id, preset)
  WHERE preset IS NOT NULL;

CREATE TRIGGER spot_kinds_updated_at BEFORE UPDATE ON spot_kinds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- R-28-05: 1 or 2 kinds per non-home spot. Composite FKs keep a link inside its trip.
CREATE TABLE spot_kind_links (
  trip_id  uuid NOT NULL,
  spot_id  uuid NOT NULL,
  kind_id  uuid NOT NULL,
  PRIMARY KEY (spot_id, kind_id),
  FOREIGN KEY (trip_id, spot_id) REFERENCES spots (trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, kind_id) REFERENCES spot_kinds (trip_id, id) ON DELETE CASCADE
);

CREATE INDEX spot_kind_links_kind_idx ON spot_kind_links (kind_id);
CREATE INDEX spot_kind_links_trip_idx ON spot_kind_links (trip_id);

-- R-28-04: every trip starts with Must go and Maybe; existing spots keep their color.
INSERT INTO spot_kinds (trip_id, preset, color, symbol, sort_order)
SELECT t.id, v.preset, v.color, v.symbol, v.sort_order
  FROM trips t
 CROSS JOIN (VALUES
   ('must_go', '#E5484D', 'exclamation', 0),
   ('maybe',   '#30A46C', 'question',    1)
 ) AS v (preset, color, symbol, sort_order);

INSERT INTO spot_kind_links (trip_id, spot_id, kind_id)
SELECT s.trip_id, s.id, k.id
  FROM spots s
  JOIN spot_kinds k ON k.trip_id = s.trip_id AND k.preset = s.base_category::text
 WHERE s.base_category::text IN ('must_go', 'maybe');

-- The fixed must_go / maybe values are no longer stored: base is 'kind' or 'home'.
DROP VIEW spots_view;
DROP VIEW plan_entry_home;
DROP TRIGGER spots_clear_primary_home ON spots;
DROP INDEX spots_trip_category_idx;
ALTER TABLE spots DROP CONSTRAINT spots_check;

ALTER TYPE spot_category RENAME TO spot_category_old;
CREATE TYPE spot_category AS ENUM ('kind', 'home');
ALTER TABLE spots
  ALTER COLUMN base_category TYPE spot_category
  USING (CASE WHEN base_category::text = 'home' THEN 'home' ELSE 'kind' END)::spot_category;
DROP TYPE spot_category_old;

DROP TYPE display_category;
CREATE TYPE display_category AS ENUM ('kind', 'planned', 'home');

ALTER TABLE spots
  ADD CONSTRAINT spots_check CHECK (base_category = 'home' OR (stay_from IS NULL AND stay_to IS NULL));
CREATE INDEX spots_trip_category_idx ON spots (trip_id, base_category);

CREATE TRIGGER spots_clear_primary_home
  AFTER UPDATE OF base_category ON spots
  FOR EACH ROW EXECUTE FUNCTION clear_primary_home_on_recategorize();

-- kinds: the spot's kinds in trip kind order (first = primary kind).
-- primary_kind_order: sort_order of the primary kind, null for home spots.
CREATE VIEW spots_view AS
SELECT
  s.*,
  CASE
    WHEN s.base_category = 'home' THEN 'home'::display_category
    WHEN p.plan_count > 0         THEN 'planned'::display_category
    ELSE 'kind'::display_category
  END                                  AS display_category,
  COALESCE(p.plan_count, 0)            AS plan_count,
  p.first_scheduled_at,
  COALESCE(k.kinds, '[]'::jsonb)       AS kinds,
  k.primary_kind_order
FROM spots s
LEFT JOIN LATERAL (
  SELECT
    count(*)::int AS plan_count,
    min(COALESCE(pes.visit_date, pe.start_date)
        + COALESCE(pes.visit_time, pe.start_time, time '00:00')) AS first_scheduled_at
  FROM plan_entry_spots pes
  JOIN plan_entries pe ON pe.id = pes.plan_entry_id
  WHERE pes.spot_id = s.id
) p ON true
LEFT JOIN LATERAL (
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'id', sk.id, 'name', sk.name, 'preset', sk.preset,
        'color', sk.color, 'symbol', sk.symbol
      )
      ORDER BY sk.sort_order, sk.created_at, sk.id
    )                  AS kinds,
    min(sk.sort_order) AS primary_kind_order
  FROM spot_kind_links l
  JOIN spot_kinds sk ON sk.id = l.kind_id
  WHERE l.spot_id = s.id
) k ON true;

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

-- R-28-05: home -> 0 links, otherwise 1-2 links, checked at commit.
CREATE FUNCTION check_spot_kind_links() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  base   spot_category;
  links  int;
BEGIN
  IF TG_TABLE_NAME = 'spots' THEN
    target := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD.spot_id;
  ELSE
    target := NEW.spot_id;
  END IF;
  SELECT s.base_category INTO base FROM spots s WHERE s.id = target;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO links FROM spot_kind_links WHERE spot_id = target;
  IF base = 'home' AND links > 0 THEN
    RAISE EXCEPTION 'home spot % cannot have kinds', target USING ERRCODE = '23514';
  ELSIF base = 'kind' AND (links < 1 OR links > 2) THEN
    RAISE EXCEPTION 'spot % must have 1 or 2 kinds, has %', target, links USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER spots_kind_links_valid
  AFTER INSERT OR UPDATE OF base_category ON spots
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_spot_kind_links();

CREATE CONSTRAINT TRIGGER spot_kind_links_valid
  AFTER INSERT OR UPDATE OR DELETE ON spot_kind_links
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_spot_kind_links();
