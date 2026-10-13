-- Trip Board migration 0006_web_photos. Source, credit and license on images
-- (R-34-05) and the Wikimedia Commons suggestion cache (R-34-08), step 34.

ALTER TABLE images
  ADD COLUMN source_url text CHECK (char_length(source_url) <= 2000),
  ADD COLUMN credit     text CHECK (char_length(credit) <= 300),
  ADD COLUMN license    text CHECK (char_length(license) <= 100);

CREATE TABLE commons_cache (
  point_key   text        PRIMARY KEY,  -- the point rounded to 4 decimals, '35.0394,135.7292'
  response    jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX commons_cache_created_at_idx ON commons_cache (created_at);
