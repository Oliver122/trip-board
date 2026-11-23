-- Trip Board migration 0009_photobook. Photobook photos are images rows that
-- may have no spot, with their own point, capture time, place source and
-- caption (R-47-01), step 47.

ALTER TABLE images
  ALTER COLUMN spot_id DROP NOT NULL,
  ADD COLUMN lat          double precision CHECK (lat BETWEEN -90 AND 90),
  ADD COLUMN lng          double precision CHECK (lng BETWEEN -180 AND 180),
  -- The camera's wall-clock time at the place (EXIF DateTimeOriginal), no zone.
  ADD COLUMN taken_at     timestamp,
  ADD COLUMN place_source text CHECK (place_source IN ('exif', 'manual')),
  ADD COLUMN caption      text CHECK (char_length(caption) <= 500),
  ADD CONSTRAINT images_point_check CHECK ((lat IS NULL) = (lng IS NULL)),
  ADD CONSTRAINT images_trip_id_fkey
    FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE;

-- A deleted spot leaves its photos that have their own point in the trip's
-- photobook: the foreign key clears only spot_id. Photos without a point
-- (gallery uploads) are deleted with the spot by the trigger below, which
-- still queues their blobs (images_enqueue_blob_deletion).
ALTER TABLE images
  DROP CONSTRAINT images_trip_id_spot_id_fkey,
  ADD CONSTRAINT images_trip_id_spot_id_fkey
    FOREIGN KEY (trip_id, spot_id) REFERENCES spots (trip_id, id)
    ON DELETE SET NULL (spot_id);

CREATE FUNCTION delete_pointless_spot_images() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM images WHERE spot_id = OLD.id AND lat IS NULL;
  RETURN OLD;
END $$;

CREATE TRIGGER spots_delete_pointless_images
  BEFORE DELETE ON spots
  FOR EACH ROW EXECUTE FUNCTION delete_pointless_spot_images();

CREATE INDEX images_trip_taken_idx ON images (trip_id, taken_at);
