# Step 44 — API stability: survive crashes, stop the leaks and hangs

**Goal:** the API stays up for weeks: a crashed process is restarted by systemd instead of lingering dead behind `concurrently`, stray rejections fail fast instead of corrupting state, and the three slow killers — rate-limiter maps that grow forever, outbound requests with no timeout, and unbounded image decodes — are bounded.
**Depends on:** 21, 34, 43
**Result:** Kill the API child of the running service (`kill <api pid>`): within seconds systemd restarts the whole unit and `/health` answers again. Point `NOMINATIM_BASE_URL` at a server that never answers: a board search shows the error state after about 5 s and the next search still works. Upload a 30000×30000 decompression-bomb PNG: the response is 415 and the API keeps serving.
**Core:** C-OPS-54, C-OPS-55, C-OPS-14, C-IMG-02, C-IMG-05, C-MEMB-16, C-SPOT-11
**Status:** planned

## Scope
- In: process guards (`unhandledRejection`, `uncaughtException`, SIGTERM/SIGINT) in `apps/api/src/server.ts`; the systemd unit and root `dev` script so a dead child ends the unit and `Restart=always` brings it back; stale-key eviction in `RequestLimiter`, `UploadLimiter` and `JoinLimiter`; a 5 s abort on the Nominatim fetch (I-10); timeouts on the S3 client and the Discord webhook post (I-26); pool `max` 10 and logged idle-client errors; an explicit `limitInputPixels` for sharp with a 415 instead of a 500 on decode failure (I-18); marking I-10, I-18 and I-26 fixed in `docs/SYSTEM_OVERVIEW.md`.
- Out: serving a production build instead of `pnpm dev` and `NODE_ENV=production` (I-01, its own step — this step only makes the dev-mode service self-heal); `trustProxy` and real client addresses behind nginx (I-02); running housekeeping once at startup (I-14); bucket check in `/health`, uptime probe, log shipping (I-15); moving limiter state out of the process (I-32).

## Current behavior
| Topic | Today |
| --- | --- |
| Crash recovery | The unit runs `pnpm dev` → `concurrently` (web, api) with `Restart=on-failure`. When the API child dies, `concurrently` keeps running Vite, the unit stays `active`, and systemd never restarts anything: the API is down until a person restarts the service (`scripts/deploy.sh:151`, root `package.json` `dev`) |
| Stray errors | No `unhandledRejection` / `uncaughtException` handlers in `server.ts`; Node's default kills the API child on any unhandled rejection — which then stays dead (above). No signal handling: a deploy's `systemctl restart` SIGTERMs the process mid-request with no graceful close |
| Limiter memory | `RequestLimiter.hits` keeps one array per session token and per IP forever (`apps/api/src/http/limit.ts:5`); `UploadLimiter` and `JoinLimiter` the same. Every scanner IP and every expired session adds an entry that is never removed — unbounded heap growth on a public host |
| Nominatim | The upstream fetch has no timeout and all geocoding queues behind a one-request-per-second gate (`apps/api/src/geocode/nominatim.ts:75`, `gate.ts`); one stalled response blocks every later search, pasted link and import forever (I-10) |
| S3 / webhook | `createS3Storage` sets no timeouts; the Discord webhook post has no abort signal (I-26): a hung bucket holds uploads and the blob-deletion job, a hung webhook holds the daily metrics job |
| Database pool | `max: 2`, `connectionTimeoutMillis: 2000`, and `pool.on('error', () => {})` swallows idle-client errors silently (`apps/api/src/db.ts:6`). Live-stream heartbeats (one auth query per stream every 25 s) plus normal requests contend for 2 connections |
| Image decode | `processImage` relies on sharp's implicit pixel limit; a decode failure after the sniff (bomb or corrupt file) throws and answers 500 (`apps/api/src/images/process.ts:13`, `routes.ts:140`) |

## Decisions
| Topic | Decision |
| --- | --- |
| Fail fast, restart outside | On an unhandled rejection or exception the process logs and exits 1 rather than trying to keep serving with unknown state; systemd is the supervisor. `--kill-others` on `concurrently` makes any dead child end the unit so `Restart=always` fires |
| Eviction without timers | Each limiter sweeps its own map on the next `check`/`allow` once a full window has passed since the last sweep — no new timers, no wiring, deterministic in tests |
| Timeout values | Nominatim 5 s (like Commons and Discord), S3 connect 3 s / request 15 s (uploads of large blobs), webhook 5 s. A timeout is an upstream failure (existing 502 / logged error paths), never a crash |
| Pool size | `max` 10: small enough for one Postgres, enough that heartbeats and a slow query do not starve requests. Idle-client errors become one structured log line |
| Pixel limit | `limitInputPixels: 268402689` (sharp's documented default, now pinned so an upstream change cannot widen it); a decode failure is 415 `unsupported_media` like other bad files |

## Requirements

### Process lifecycle
| ID | Requirement |
| --- | --- |
| R-44-01 | The root `dev` script passes `--kill-others` to `concurrently`, and the systemd unit written by `scripts/deploy.sh` uses `Restart=always` (keeping `RestartSec=3`): when either child process exits for any reason, the whole unit stops and systemd restarts it |
| R-44-02 | `apps/api/src/server.ts` installs process guards via an exported `installProcessGuards(proc, log, close)`: `unhandledRejection` and `uncaughtException` write one structured JSON log line (`level: "fatal"`, the message and stack) and exit with code 1; SIGTERM and SIGINT run the close function (Fastify `close()`, which already stops housekeeping, the hub and the pool via `onClose`) and exit 0, or exit 1 if closing takes longer than 10 s. The guards are installed once, before `listen` |

### Memory
| ID | Requirement |
| --- | --- |
| R-44-03 | `RequestLimiter`, `UploadLimiter` and `JoinLimiter` evict stale keys: each keeps a `lastSweep` time and, on the first `check` / `allow` more than one window (60 s) after it, deletes every key whose newest hit is older than the window before answering. Rate-limit decisions are unchanged. Each class exposes `size()` for tests |

### Timeouts and the pool
| ID | Requirement |
| --- | --- |
| R-44-04 | The Nominatim fetch aborts after 5 s (`AbortSignal.timeout`, injectable for tests); a timeout answers 502 with the existing upstream-failure key, the gate advances, and the next geocode request goes upstream normally |
| R-44-05 | `createS3Storage` sets a 3 s connection and 15 s request timeout on the S3 client; the Discord webhook post aborts after 5 s. In both cases the existing failure path runs (upload/read error, logged webhook error, blob deletion retried) and no job or request hangs |
| R-44-06 | `createPool` uses `max: 10` (keeping `connectionTimeoutMillis: 2000`), and the pool's `error` handler writes one structured JSON log line (`level: "error"`, `source: "pg-pool"`, the message) instead of swallowing the event |

### Image decode
| ID | Requirement |
| --- | --- |
| R-44-07 | `processImage` passes `limitInputPixels: 268402689` to sharp, and `POST /spots/:id/images` answers 415 `unsupported_media` (nothing stored, the upload does not count against the rate limit) when sharp fails to decode a file that passed the sniff — a decompression bomb or truncated file no longer answers 500 |

### Docs
| ID | Requirement |
| --- | --- |
| R-44-08 | `docs/SYSTEM_OVERVIEW.md` *Issues* marks I-10, I-18 and I-26 fixed by this step (kept, not deleted), and the *Operations* section states the restart behavior: any crashed child ends the unit and systemd restarts it (no core change) |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-OPS-54 | add | R-44-01, R-44-02 |
| C-OPS-55 | add | R-44-05, R-44-06 |
| C-OPS-14 | modify | R-44-03 |
| C-IMG-05 | modify | R-44-03 |
| C-MEMB-16 | modify | R-44-03 |
| C-SPOT-11 | modify | R-44-04 |
| C-IMG-02 | modify | R-44-07 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-44-01 | unit | R-44-02 | `apps/api/src/process-guards.test.ts`: with a fake process emitter, fake log and fake close — an emitted `unhandledRejection` and `uncaughtException` each produce one JSON line with `level: "fatal"` and a stack, then `exit(1)`; SIGTERM calls close and exits 0; a close that never resolves exits 1 after 10 s (fake timers); the handlers are registered exactly once |
| T-44-02 | unit | R-44-01 | A script test next to `deploy-env.test.ts`: the unit text written by `scripts/deploy.sh` contains `Restart=always` and `RestartSec=3`, and the root `package.json` `dev` script contains `--kill-others` |
| T-44-03 | unit | R-44-03 | For each of the three limiters: 10 000 distinct keys hit at t₀ → `size()` is 10 000; one call at t₀ + 61 s sweeps → `size()` is at most 2 (the sweeping caller and its key); a key hit 30 s ago survives a sweep; the 300th/30th/10th request in a window still passes and the next one is still refused |
| T-44-04 | api | R-44-04 | With an injected geocode fetch that respects its abort signal but never answers: `GET /geocode/search` answers 502 in about 5 s (fake timers); a second search with a normal fixture afterwards answers 200 — the gate is not stuck |
| T-44-05 | unit | R-44-05 | `createS3Storage` configures the documented connection and request timeouts; `reportCapacityWarnings` with a hanging `fetchImpl` resolves after the 5 s abort (fake timers) and logs the error instead of hanging |
| T-44-06 | unit | R-44-06 | `createPool` returns a pool with `max` 10; emitting `error` on the pool writes one JSON line with `source: "pg-pool"` and does not throw |
| T-44-07 | api | R-44-07 | Uploading a tiny PNG fixture that declares a 30000×30000 bitmap → 415 `unsupported_media`, nothing in MinIO and no image row; a normal upload directly after → 201; two bomb uploads do not consume the upload rate limit |
| T-44-08 | manual | R-44-08 | `docs/SYSTEM_OVERVIEW.md` shows I-10, I-18, I-26 as fixed with this step as evidence, the *Operations* restart note is present, and `scripts/overview.test.mjs` still passes |
