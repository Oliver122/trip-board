-- Trip Board migration 0003_spot_comments. Spot discussions (step 24).

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
