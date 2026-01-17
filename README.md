# gesture_collector

Stage 1 boilerplate is under `web/` (served by Caddy/PHP-FPM via `docker/docker-compose.yml`).

Quick start (local HTTPS):

1. Ensure `docker/cert.pem` + `docker/key.pem` match your hostname in `docker/Caddyfile`.
2. Run: `cd docker && docker compose up`
3. Open: `https://<your-hostname>/`

API smoke test: `POST https://<your-hostname>/api/start_session.php`

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
