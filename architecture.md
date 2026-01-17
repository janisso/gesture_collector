# Gesture IMU Study — Web App Architecture (Schema v1)

**Context**

* Online-required study, ~10–100 participants, running ~1 month.
* Mobile web page collects IMU gesture data while users perform trials.
* Target sample rate: **100 Hz ideal**, **60 Hz acceptable**.
* **Schema version:** `1`.
* **Orientation:** optional; relative motion is fine.
* Stack preference: **PHP + SQL** (like an older project), but implemented cleanly.

---

## 1) System overview

### Client (mobile browser)

Responsibilities:

* Consent + instructions
* Sensor permission handling (iOS Safari requires user gesture)
* Trial flow (state machine)
* IMU capture (timestamped)
* Buffer per trial
* Upload per trial with retry

### Server (PHP API) + SQL

Responsibilities:

* Create sessions
* Accept trial uploads (idempotent)
* Store trials + metadata
* Provide export/download for analysis

**Storage strategy (recommended for this scale):**

* Store trial samples as **JSON in SQL** (`LONGTEXT` / `JSON` column if available).
* Keep metadata in columns for easy filtering and exporting.

---

## 2) User flow (client)

1. Landing → consent
2. Capability check
3. “Tap to enable motion sensors” (required for iOS)
4. Short calibration (optional but recommended): hold still for ~2s
5. Trials loop:

   * Prompt (listen/move)
   * Countdown (3–2–1)
   * Record motion for fixed duration
   * Quick survey (tags/confidence)
   * Upload trial (retry on failure)
6. Completion screen

**Online-required** means:

* You may avoid IndexedDB, but keep a small **in-memory retry queue**.
* Optional: also persist unsent trials in `localStorage` to survive refresh.

---

## 3) Client architecture (modules)

### 3.1 Trial state machine

States (example):

* `CONSENT` → `PERMISSION` → `CALIBRATE` → `READY` → `COUNTDOWN` → `RECORDING` → `SURVEY` → `UPLOADING` → `NEXT_TRIAL` → `DONE`

Goal: prevent partial/inconsistent recordings.

### 3.2 Sensor logger

Primary sources:

* `DeviceMotionEvent`: acceleration (with/without gravity), rotationRate
* `DeviceOrientationEvent`: optional orientation angles

**Timestamping rule:**

* Every sample is stamped with `performance.now()` on receipt.

**Sampling note:**

* You cannot truly force 100 Hz on all devices. You record what you get, measure effective Hz, and resample offline.

### 3.3 Diagnostics per trial

Compute and store:

* `duration_ms`
* `sample_count`
* `effective_hz`
* missing fields counts (e.g., no `acc`, no `rot`)

### 3.4 Upload queue

* On trial end, POST to `/api/submit_trial.php`.
* If it fails, retry with exponential backoff (e.g., 1s, 2s, 4s, 8s, cap 30s).
* Include `trial_id` for idempotency.

---

## 4) PHP API endpoints

### 4.1 `POST /api/start_session.php`

Creates a new session.

**Request:**

```json
{
  "study_id": "gesture_mapping_2026_01",
  "study_version": "2026-01-17",
  "schema_version": 1,
  "consent_version": "v1"
}
```

**Response:**

```json
{
  "session_id": "uuid",
  "study_id": "gesture_mapping_2026_01",
  "study_version": "2026-01-17",
  "schema_version": 1,
  "config": {
    "target_hz": 100,
    "min_hz": 60,
    "trials": [
      {"stimulus_id": "s1", "prompt": "..."},
      {"stimulus_id": "s2", "prompt": "..."}
    ]
  }
}
```

Server should also store:

* `created_at` (server time)
* `user_agent`
* optional `capabilities_json` later (client can POST this too)

---

### 4.2 `POST /api/submit_trial.php`

Uploads one trial, idempotent on `trial_id`.

**Request (schema v1):**

```json
{
  "schema_version": 1,
  "study_id": "gesture_mapping_2026_01",
  "study_version": "2026-01-17",

  "session_id": "uuid",
  "trial_id": "uuid",
  "trial_index": 3,
  "stimulus_id": "s3",

  "t_start_perf_ms": 12345.67,
  "t_end_perf_ms": 23456.78,

  "survey": {
    "tags": ["brightness", "energy"],
    "confidence": 4,
    "notes": "optional"
  },

  "diagnostics": {
    "sample_count": 812,
    "duration_ms": 8110,
    "effective_hz": 100.12,
    "missing": {
      "acc": 0,
      "acc_g": 0,
      "rot": 10,
      "ori": 812
    }
  },

  "samples": [
    {
      "t_ms": 12345.67,
      "acc": {"x": 0.12, "y": -0.03, "z": 9.71},
      "acc_g": {"x": 0.02, "y": 0.01, "z": 9.81},
      "rot": {"a": 0.1, "b": -0.2, "g": 0.05},
      "ori": {"alpha": 12.3, "beta": -1.2, "gamma": 3.4},
      "interval_ms": 10
    }
  ]
}
```

**Notes**

* `ori` may be omitted or null for most samples if you skip orientation.
* Use consistent naming for axes. Above:

  * `acc` and `acc_g` in m/s^2 (as delivered)
  * `rot` in deg/s (as delivered)
  * `interval_ms` from event if available

**Response:**

```json
{ "ok": true, "trial_id": "uuid" }
```

Idempotency:

* If the same `trial_id` is received again, return `{ok:true}` without duplicating.

---

### 4.3 `POST /api/end_session.php`

Marks a session as complete.

**Request:**

```json
{ "session_id": "uuid", "completed": true }
```

**Response:**

```json
{ "ok": true }
```

---

### 4.4 `GET /admin/export.php?study_id=...`

Protected endpoint that downloads a dataset.

Export formats (pick one):

* **Zip of JSON**: one file per trial
* Or **CSV metadata + JSON samples**

Recommended for simplicity: **zip of JSON**.

---

## 5) SQL schema (MySQL/MariaDB-friendly)

### 5.1 `sessions`

Columns:

* `id` (CHAR(36), PK) — UUID
* `study_id` (VARCHAR)
* `study_version` (VARCHAR)
* `schema_version` (INT)
* `consent_version` (VARCHAR)
* `created_at` (DATETIME)
* `completed_at` (DATETIME NULL)
* `user_agent` (TEXT)
* `capabilities_json` (LONGTEXT NULL)

Indexes:

* `study_id`
* `created_at`

### 5.2 `trials`

Columns:

* `id` (CHAR(36), PK) — trial UUID
* `session_id` (CHAR(36), indexed)
* `trial_index` (INT)
* `stimulus_id` (VARCHAR)
* `server_received_at` (DATETIME)
* `t_start_perf_ms` (DOUBLE)
* `t_end_perf_ms` (DOUBLE)
* `duration_ms` (INT)
* `sample_count` (INT)
* `effective_hz` (DOUBLE)
* `survey_json` (LONGTEXT)
* `diagnostics_json` (LONGTEXT)
* `samples_json` (LONGTEXT)

Indexes:

* `session_id`
* `(session_id, trial_index)`
* `stimulus_id`

---

## 6) Practical constraints + decisions

### Target sample rate

* You **aim** for 100 Hz but accept 60 Hz.
* Always store timestamps. Offline processing can resample (e.g., to 100 Hz uniform).

### Orientation

* Treat as optional.
* If included, store it as best-effort.
* If not available, rely on accel+gyro and remove gravity offline.

### Gravity removal

* Don’t do heavy filtering on-device.
* Capture both `acc` (no gravity) and `acc_g` (with gravity) when available.

### Phone held in different ways

Record:

* whether screen orientation changes during trial
* optional prompt: “hold phone in one hand, screen facing you”

---

## 7) Minimum acceptance checks (client-side)

Before allowing a trial to start:

* motion permission granted
* at least one sensor field is producing data
* show a live “Hz estimate” for 1–2 seconds

After trial:

* if `effective_hz < 30` or `sample_count` too low, flag it and optionally request a redo

---

## 8) Implementation checklist

**Client**

* [ ] Consent screen
* [ ] Permission request button (iOS-safe)
* [ ] Live sensor status indicator
* [ ] Trial state machine
* [ ] IMU sample collection with `performance.now()` timestamps
* [ ] Compute diagnostics
* [ ] POST trial JSON
* [ ] Retry failed uploads

**Server**

* [ ] Create session endpoint
* [ ] Submit trial endpoint with idempotency
* [ ] End session endpoint
* [ ] SQL tables + indexes
* [ ] Export endpoint (zip of trial JSON)
* [ ] Basic auth / token protection for admin

---

## 9) Open choices (safe defaults)

* Stimulus/trial definitions served from server as JSON config.
* Use UUIDv4 for `session_id` and `trial_id`.
* Keep `schema_version: 1` fixed for the month; if you change fields mid-study, bump to `2`.
