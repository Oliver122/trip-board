-- Trip Board migration 0008_service_health. Service health for the admin
-- dashboard (R-45-05), step 45: per-day API starts and 5xx / 429 response
-- counts, and the last run of every housekeeping job (one row per job).

CREATE TABLE ops_counters (
  day        date    PRIMARY KEY,  -- UTC date, like metrics_daily
  http_5xx   integer NOT NULL DEFAULT 0 CHECK (http_5xx >= 0),
  http_429   integer NOT NULL DEFAULT 0 CHECK (http_429 >= 0),
  api_starts integer NOT NULL DEFAULT 0 CHECK (api_starts >= 0)
);

CREATE TABLE job_runs (
  job              text        PRIMARY KEY CHECK (job ~ '^[a-z]+$'),
  last_started_at  timestamptz NOT NULL,
  last_finished_at timestamptz,
  last_result      text        CHECK (last_result IN ('ok', 'error')),
  last_error       text        CHECK (char_length(last_error) <= 1000)
);
