# gesture_collector

Stage 1 boilerplate is under `web/` (served by Caddy/PHP-FPM via `docker/docker-compose.yml`).

Quick start (local HTTPS for host `js-MS-7918.local`):

1. Ensure `docker/cert.pem` + `docker/key.pem` match your hostname in `docker/Caddyfile` (here: `js-MS-7918.local`).
2. Build PHP with pdo_mysql (first time or after Dockerfile changes):

   ```
   cd docker
   docker compose build php
   docker compose up -d
   ```

   For subsequent runs, `docker compose up -d` is enough.
3. Open: `https://js-MS-7918.local/`

API smoke test: `POST https://js-MS-7918.local/api/start_session.php`

## Stage 2: database setup + dry run

Apply schema (from repo root):

```
docker compose -f docker/docker-compose.yml exec -T mysql \
  mysql -uroot -prootpass < sql/schema.sql
```

Verify tables:

```
docker compose -f docker/docker-compose.yml exec -T mysql \
  mysql -uroot -prootpass -e "USE gesture_study; SHOW TABLES;"
```

Optional dummy insert + counts:

```
docker compose -f docker/docker-compose.yml exec -T mysql \
  mysql -uroot -prootpass gesture_study <<'SQL'
INSERT INTO sessions (id, study_id, study_version, schema_version, consent_version, user_agent)
VALUES ('00000000-0000-4000-8000-000000000001', 'local_smoke', 'v0', 1, 'v1', 'cli')
ON DUPLICATE KEY UPDATE study_version=VALUES(study_version);

INSERT INTO trials (
  id, session_id, study_id, study_version, schema_version,
  trial_index, stimulus_id, t_start_perf_ms, t_end_perf_ms,
  survey_json, diagnostics_json, samples_json,
  sample_count, duration_ms, effective_hz
) VALUES (
  '00000000-0000-4000-8000-0000000000aa',
  '00000000-0000-4000-8000-000000000001',
  'local_smoke', 'v0', 1,
  0, 'stim1', 0.0, 1000.0,
  '{"ok":true}', '{"sample_count":1}', '[{\"t_ms\":0}]',
  1, 1000.0, 1.0
) ON DUPLICATE KEY UPDATE trial_index=VALUES(trial_index);
SQL

docker compose -f docker/docker-compose.yml exec -T mysql \
  mysql -uroot -prootpass -e "USE gesture_study; SELECT COUNT(*) FROM sessions; SELECT COUNT(*) FROM trials;"
```

At this point `sessions` and `trials` should both exist with counts > 0.

## Stage 3: backend API smoke tests

Requires `jq` on your host and the stack running (`docker compose up -d`).

Start a session and capture the ID:

```
SESSION_ID=$(curl -sS -X POST -H "Content-Type: application/json" \
  -d '{"study_id":"s1","study_version":"v1","schema_version":1,"consent_version":"v1"}' \
  https://js-MS-7918.local/api/start_session.php | jq -r '.session_id // empty')
echo "SESSION_ID=$SESSION_ID"
```

Submit a dummy trial (replace host if different):

```
curl -sS -X POST -H "Content-Type: application/json" \
  -d '{"session_id":"'"$SESSION_ID"'","trial_id":"t1","trial_index":0,"stimulus_id":"s1",
       "t_start_perf_ms":0,"t_end_perf_ms":1000,
       "diagnostics":{"sample_count":3,"duration_ms":1000,"effective_hz":3},
       "samples":[{"t_ms":0},{"t_ms":500},{"t_ms":1000}]}' \
  https://js-MS-7918.local/api/submit_trial.php
```

Mark the session complete:

```
curl -sS -X POST -H "Content-Type: application/json" \
  -d '{"session_id":"'"$SESSION_ID"'"}' \
  https://js-MS-7918.local/api/end_session.php
```

Verify rows landed:

```
docker compose -f docker/docker-compose.yml exec -T mysql \
  mysql -uroot -prootpass -e "USE gesture_study; SELECT COUNT(*) AS sessions FROM sessions; SELECT COUNT(*) AS trials FROM trials;"
```

## Stage 4: frontend dummy trial (no sensors)

1) Open `https://js-MS-7918.local/` in a desktop browser.
2) Check the consent box, click **Start session** (creates a session via API).
3) Click **Run dummy trial** (generates fake samples/diagnostics locally).
4) Click **Submit trial** to POST to `/api/submit_trial.php`.
5) Verify counts in MySQL (same query as above) or via Adminer at `http://localhost:8080/` (server: `mysql`, user: `root`, password: `rootpass`, DB: `gesture_study`).

Expected signals:

- After step 2, the Session badge turns active and the Log shows JSON with `session_id`.
- After step 4, the Log shows `{ "ok": true, "trial_id": "...", ... }`.
- DB counts should increase by +1 for sessions/trials; if not, check the browser console/network tab for errors.

## Stage 5: real sensor capture (mobile)

1) Use a mobile browser over HTTPS at your host (example `https://js-MS-7918.local/`).
2) Start a session (consent checkbox + **Start session**).
3) Tap **Enable motion sensors** (required on iOS Safari) and confirm the prompt.
4) Watch Hz estimate tick up as you move the phone (devicemotion events).
5) Tap **Start recording**, move for 5–10s, then **Stop & submit** to POST to `/api/submit_trial.php`.
6) Confirm Log shows `{ "ok": true, "trial_id": ... }` and DB counts increase (mysql query or Adminer).

## Stage 6: iOS hardening + retries

1) On iOS Safari, tap **Enable motion sensors** (must be a user gesture). If denied, Safari will not re-prompt until you allow motion/tilt access in Settings → Safari → Motion & Orientation; the UI shows a warning if unsupported/denied.
2) Ensure the Hz estimate ticks up when moving the phone; if it stays at 0, reload and try enabling again.
3) Start a session, then **Start recording** → move device → **Stop & submit**. If “No samples captured” appears, re-enable sensors and retry.
4) Verify the submission returned `{ok:true}` and rows increased in MySQL/Adminer.

## Stage 8: Admin export

Endpoint: `GET /admin/export.php?study_id=...&study_version=...` (version optional). Protected via `X-Admin-Token`.

Prereq: set `admin.token` in `web/api/config.php` (copy from `config.example.php` and change).

Run (from host):

```
curl -sS -D - \
  -H "X-Admin-Token: YOUR_TOKEN" \
  "https://js-MS-7918.local/admin/export.php?study_id=s1" \
  -o trials.zip
```

Notes:
- Returns a ZIP with `trial_<trial_id>.json` files containing stored trial payloads and metadata.
- Requires PHP zip extension; rebuild PHP image if needed: `cd docker && docker compose build php && docker compose up -d`.
