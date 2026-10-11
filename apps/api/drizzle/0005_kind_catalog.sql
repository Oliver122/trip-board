-- Trip Board migration 0005_kind_catalog. Kind catalog, per-trip kind limits
-- and kind limit requests (step 29). No kinds are added to existing trips.

-- R-29-02: six more presets.
ALTER TABLE spot_kinds DROP CONSTRAINT spot_kinds_preset_check;
ALTER TABLE spot_kinds ADD CONSTRAINT spot_kinds_preset_check CHECK (preset IN (
  'must_go', 'maybe', 'food', 'sights', 'shopping', 'coffee', 'nature', 'nightlife'));

-- R-29-01: 64 symbols. Append-only, in the order of kindSymbols (texture cells).
ALTER TABLE spot_kinds DROP CONSTRAINT spot_kinds_symbol_check;
ALTER TABLE spot_kinds ADD CONSTRAINT spot_kinds_symbol_check CHECK (symbol IN (
                'exclamation', 'question', 'dot', 'star', 'heart', 'food', 'coffee', 'camera',
                'shopping', 'nature', 'temple', 'cat', 'beer', 'wine', 'cocktail', 'pizza', 'soup',
                'cake', 'ice_cream', 'fish', 'hotel', 'bed', 'tent', 'mountain', 'beach', 'water',
                'flower', 'leaf', 'sun', 'snow', 'sunset', 'castle', 'church', 'building', 'train',
                'bus', 'car', 'plane', 'ship', 'bike', 'walk', 'parking', 'fuel', 'music',
                'theater', 'film', 'game', 'ticket', 'gift', 'book', 'shirt', 'store', 'market',
                'money', 'hospital', 'info', 'wifi', 'bath', 'sparkles', 'dog', 'bird', 'flag',
                'pin', 'bookmark'));

-- R-29-06: platform default and per-trip override of the kind limit.
ALTER TABLE app_settings
  ADD COLUMN default_max_kinds integer NOT NULL DEFAULT 12
    CONSTRAINT app_settings_default_max_kinds_check CHECK (default_max_kinds BETWEEN 1 AND 64);

ALTER TABLE trips
  ADD COLUMN max_kinds integer
    CONSTRAINT trips_max_kinds_check CHECK (max_kinds BETWEEN 1 AND 64);

-- R-29-08: a board admin or owner asks the platform admin for more kinds.
CREATE TABLE kind_limit_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id        uuid           NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  requested_by   uuid           REFERENCES users(id) ON DELETE SET NULL,
  requested_max  integer        NOT NULL CHECK (requested_max BETWEEN 1 AND 64),
  message        text           CHECK (char_length(message) <= 500),
  status         request_status NOT NULL DEFAULT 'pending',
  decided_by     uuid           REFERENCES users(id) ON DELETE SET NULL,
  decided_at     timestamptz,
  decision_note  text           CHECK (char_length(decision_note) <= 500),
  created_at     timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT kind_limit_requests_decided_at_check CHECK ((status = 'pending') = (decided_at IS NULL))
);

CREATE UNIQUE INDEX kind_limit_requests_one_pending_idx ON kind_limit_requests (trip_id) WHERE status = 'pending';
CREATE INDEX kind_limit_requests_status_idx ON kind_limit_requests (status, created_at);
