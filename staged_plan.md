# Staged Implementation Plan — Local HTTPS Host + PHP+MySQL IMU Study

Goal: build and test the IMU gesture-collection web app **locally**, accessible from a smartphone on the same network, served over **HTTPS** (required for iOS motion permissions).

Assumptions:

* You will implement backend with **PHP + MySQL**.
* Online deployment comes later.
* Study scale: 10–100 participants; 1 month run.
* Target sample rate: 100 Hz (accept 60 Hz).

---

## Stage 0 — Local HTTPS hosting that a phone can access

### 0.1 Choose a hostname + find your LAN IP

* Preferred: `your-computer-name.local` (mDNS often works on iOS/macOS).
* Find your LAN IP (example: `192.168.1.50`).

**Acceptance:** phone and computer are on same Wi‑Fi; you know the computer’s LAN IP.

### 0.2 Create a trusted local CA and HTTPS certificate (mkcert)

1. Install mkcert on your dev machine.
2. Create and install a local CA:

   * `mkcert -install`
3. Generate a cert for your hostname + LAN IP:

   * `mkcert yourcomputername.local 192.168.1.50 localhost 127.0.0.1`
4. Locate mkcert CA root:

   * `mkcert -CAROOT`

**Acceptance:** you have a cert + key files for your hostname.

### 0.3 Trust the local CA on the smartphone

**iOS**

* AirDrop/email the `rootCA.pem` (from `mkcert -CAROOT`) to the phone.
* Install profile.
* Settings → General → About → Certificate Trust Settings → enable full trust.

**Android**

* Install `rootCA.pem` as a user CA (path varies by OS version).

**Acceptance:** opening an HTTPS page served with your mkcert cert shows **no certificate warning**.

### 0.4 Serve the project over HTTPS (recommended: Caddy)

* Install Caddy.
* Create a `Caddyfile` pointing to your `public/` directory and using your mkcert cert/key.
* Run PHP as FastCGI (`php-fpm`) behind Caddy.

**Acceptance:** from the phone, `https://yourcomputername.local/` loads successfully over HTTPS.

> Fallback if LAN DNS is annoying: use the LAN IP and include it in the certificate (already done in 0.2).

### 0.5 Firewall/network sanity

* Ensure your dev machine allows inbound connections on port 443.

**Acceptance:** phone can load the site over HTTPS reliably.

---

## Stage 1 — Repo structure + config conventions

Create a minimal project layout:

```
gesture_collector/
  docker/
    docker-compose.yml
    Caddyfile
    cert.pem
    key.pem
  web/
    index.html
    app.js
    style.css
    api/
      db.php
      start_session.php
      submit_trial.php
      end_session.php
    admin/
      export.php
  sql/
    schema.sql
  docs/
    schema_v1.md
```

Decide configuration strategy:

* Local: `web/api/config.php` (ignored by git)
* Later: environment variables or separate config.

Notes:

* The Docker/Caddy setup serves the web root from `web/` (currently mounted to `/srv/public` inside containers).

**Acceptance:** opening `/` shows a placeholder page; `POST /api/start_session.php` responds with JSON.

---

## Stage 2 — Database schema (local MySQL)

### 2.1 Create database + user

* DB: `gesture_study`
* User with limited permissions (local dev can be relaxed).

### 2.2 Create tables

Implement `sessions` and `trials` tables in `sql/schema.sql`.

Key requirements:

* `sessions.id` is UUID (CHAR(36))
* `trials.id` is UUID (CHAR(36)) and **primary key** (idempotency)
* `samples_json` is LONGTEXT
* store `sample_count`, `duration_ms`, `effective_hz` as columns

**Acceptance:** `SHOW TABLES;` shows `sessions`, `trials`.

---

## Stage 3 — Backend API “happy path” (PHP)

**Status:** Complete.

Implement with PDO + prepared statements.

### 3.1 `api/db.php`

* PDO connection factory
* helper: JSON response
* helper: UUID generator (or use random_bytes)

### 3.2 `POST api/start_session.php`

* Create `session_id`
* Store: timestamps, user agent, study_id/version/schema_version
* Return: `session_id` + config stub

### 3.3 `POST api/submit_trial.php`

* Validate `session_id` exists
* Insert trial row; on duplicate `trial_id`, return OK (idempotent)
* Store:

  * `t_start_perf_ms`, `t_end_perf_ms`
  * `survey_json`, `diagnostics_json`, `samples_json`
  * `sample_count`, `duration_ms`, `effective_hz`

### 3.4 `POST api/end_session.php`

* Set `completed_at`

**Acceptance:** using curl/Postman you can:

* start session
* submit a dummy trial
* see rows in DB

---

## Stage 4 — Frontend without sensors (API wiring first)

**Status:** Complete.

### 4.1 Minimal UI

* Consent checkbox
* “Start session” button
* “Run dummy trial” button
* “Submit trial” button

### 4.2 Dummy data generation

* Generate `samples[]` with timestamps and fake accel/gyro fields.
* Compute diagnostics.

**Acceptance:** you can complete a trial on desktop and see it stored in DB.

---

## Stage 5 — Real sensor capture (Android first if possible)

**Status:** Complete.

### 5.1 Permission gating screen

* Button: “Enable motion sensors”
* On click:

  * request permission where required
  * show live sensor feed + estimated Hz

### 5.2 Recorder implementation

* On `startTrial()`:

  * clear buffer
  * set `t_start_perf_ms = performance.now()`
  * attach event listeners
* During recording:

  * push samples with `t_ms = performance.now()`
* On `stopTrial()`:

  * remove listeners
  * set `t_end_perf_ms`
  * compute diagnostics
  * POST to submit_trial

**Acceptance:** phone records a 5–10s gesture and uploads a trial.

---

## Stage 6 — iOS hardening

Checklist:

* permission request must be triggered by a user gesture
* handle missing fields gracefully
* clear UX when sensors unavailable

Add:

* feature detection + “unsupported browser” notice
* retry permission request flow

**Acceptance:** iPhone Safari records and uploads trials.

---

## Stage 7 — Data quality rails

Add checks:

* If `effective_hz < 30` or `sample_count < threshold`, flag and optionally prompt redo.
* Store diagnostics so analysis can filter.

**Acceptance:** low-quality recordings are detectable and optionally prevented.

---

## Stage 8 — Admin export

Implement `admin/export.php` (protected by basic auth or token).

Export strategy:

* Download a ZIP containing `trial_<trial_id>.json` for all trials in a study.

**Acceptance:** you can download a dataset and load it in Python/R.

---

## Stage 9 — Pre-deploy checklist (for later)

* Confirm HTTPS on real domain
* Confirm PHP limits: `post_max_size`, `upload_max_filesize`
* Confirm MySQL storage limits
* Create production DB + user
* Copy code, set config
* Run one end-to-end test online

---

## Suggested milestone order

1. Stage 0 (local HTTPS reachable from phone)
2. Stage 2 (DB schema)
3. Stage 3 (PHP API)
4. Stage 4 (frontend dummy data)
5. Stage 5–6 (real sensors)
6. Stage 8 (export)

---

## Notes

* You cannot force 100 Hz on all devices in a browser; always store timestamps and resample offline.
* Keep orientation optional; record accel+gyro reliably.
* Online-required allows simpler storage, but consider retry logic to handle transient network issues.
