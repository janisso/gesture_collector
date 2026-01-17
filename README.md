# gesture_collector

Stage 1 boilerplate is under `web/` (served by Caddy/PHP-FPM via `docker/docker-compose.yml`).

Quick start (local HTTPS):

1. Ensure `docker/cert.pem` + `docker/key.pem` match your hostname in `docker/Caddyfile`.
2. Run: `cd docker && docker compose up`
3. Open: `https://<your-hostname>/`

API smoke test: `POST https://<your-hostname>/api/start_session.php`
