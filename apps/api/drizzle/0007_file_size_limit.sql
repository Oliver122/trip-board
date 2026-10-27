-- Trip Board migration 0007_file_size_limit. The largest image file per user:
-- a per-user override and a platform default, 1 MiB to 50 MiB (R-43-01), step 43.

ALTER TABLE users
  ADD COLUMN max_file_bytes bigint CHECK (max_file_bytes BETWEEN 1048576 AND 52428800);

ALTER TABLE app_settings
  ADD COLUMN default_max_file_bytes bigint NOT NULL DEFAULT 10485760  -- 10 MiB
    CHECK (default_max_file_bytes BETWEEN 1048576 AND 52428800);

-- Same columns as before plus max_file_bytes at the end, so admin_user_overview
-- keeps working unchanged.
CREATE OR REPLACE VIEW user_quota_usage AS
SELECT
  u.id                                              AS user_id,
  COALESCE(u.max_images, s.default_max_images)      AS max_images,
  COALESCE(u.max_bytes,  s.default_max_bytes)       AS max_bytes,
  (u.max_images IS NOT NULL OR u.max_bytes IS NOT NULL
    OR u.max_file_bytes IS NOT NULL)                AS has_override,
  COALESCE(i.used_images, 0)                        AS used_images,
  COALESCE(i.used_bytes, 0)::bigint                 AS used_bytes,
  COALESCE(u.max_file_bytes, s.default_max_file_bytes) AS max_file_bytes
FROM users u
CROSS JOIN app_settings s
LEFT JOIN (
  SELECT uploaded_by, count(*)::int AS used_images, sum(bytes) AS used_bytes
  FROM images GROUP BY uploaded_by
) i ON i.uploaded_by = u.id;
