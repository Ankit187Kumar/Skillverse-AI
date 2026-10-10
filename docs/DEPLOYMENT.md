# Deployment guide

## Quick path: Vercel (frontend) + Render (backend and database)

1. **Push the repo to GitHub.**
2. **Render:** New → Blueprint → pick the repo. `render.yaml` creates the API (`skillverse-api`) and a PostgreSQL database, and generates `JWT_SECRET`. When asked, paste `OPENAI_API_KEY` (a free key from https://console.groq.com/keys works with the defaults). Wait for the deploy and copy the service URL, e.g. `https://skillverse-api.onrender.com`.
3. **Vercel:** New Project → pick the repo → set **Root Directory** to `frontend` → add the env var `BACKEND_URL` = the Render URL (no trailing slash) → Deploy. The browser only talks to Vercel; `/api/*` is proxied to Render, so cookies stay first-party and no CORS setup is needed.
4. Open the Vercel URL, register, and check the dashboard.

Notes: Render's free web service sleeps after ~15 minutes idle (the first request takes ~50 s), and its free Postgres expires after 30 days, so use a paid plan or export your data for anything you want to keep. Groq has no embeddings endpoint, so Research document search falls back to keyword search. The Coding Lab needs a sandbox (Piston/Judge0) that isn't part of this setup, so it stays off (`CODE_RUNNER=none`). Long AI answers can hit Vercel's proxy time limit; a fast hosted model keeps them short.

---

## Self-hosting with Docker

The repository ships a production `docker-compose.yml`:

| Service | Image | Purpose | Enabled by |
|---|---|---|---|
| `caddy` | caddy:2-alpine | HTTPS (automatic certificates), reverse proxy | always |
| `frontend` | built from `frontend/Dockerfile` | Next.js standalone server | always |
| `backend` | built from `backend/Dockerfile` | FastAPI; runs `alembic upgrade head` on start | always |
| `db` | postgres:16-alpine | database | always |
| `ollama` | ollama/ollama | local LLM + embeddings | `--profile local-ai` |
| `piston` | ghcr.io/engineer-man/piston | code sandbox | `--profile sandbox` |
| `searxng` | searxng/searxng | web search | `--profile search` |
| `speaches` | ghcr.io/speaches-ai/speaches | speech-to-text / text-to-speech | `--profile voice` |

Only Caddy publishes ports (80/443). Everything else is reachable only on the internal Docker network.

## 1. Prepare a server

- Linux VPS with Docker Engine + the Compose plugin. 2 vCPU / 4 GB RAM is enough without local models; add RAM/GPU for Ollama.
- A DNS `A` record pointing your domain at the server; ports 80 and 443 open.

## 2. Configure

```bash
git clone <your repo> skillverse && cd skillverse
cp .env.production.example .env
nano .env     # DOMAIN, POSTGRES_PASSWORD, JWT_SECRET, model + optional services
```

The frontend image bakes in the API address at build time (`BACKEND_URL=http://backend:8000`, already set in the compose file).

## 3. Start

```bash
docker compose --profile sandbox --profile search up -d --build
docker compose exec backend python scripts/piston_setup.py http://piston:2000   # once, installs runtimes
# with local models:
docker compose --profile local-ai up -d
docker compose exec ollama ollama pull qwen3:8b
docker compose exec ollama ollama pull nomic-embed-text
```

Open `https://<DOMAIN>`, register, and check the dashboard. A yellow banner means the model isn't reachable.

## 4. Operate

- **Logs:** `docker compose logs -f backend`
- **Upgrade:** `git pull && docker compose up -d --build` (migrations run automatically)
- **Backups:** `docker compose exec db pg_dump -U skillverse skillverse | gzip > backup-$(date +%F).sql.gz` — schedule it, and test restores.
- **Scaling:** the in-process rate limiter and job runner assume one API instance (uvicorn workers are fine). For multiple instances, move both to Redis or a queue.

## Without Docker

- Backend: `pip install -r requirements.txt -r requirements-postgres.txt`, set env vars, `alembic upgrade head`, run `uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2` under systemd.
- Frontend: `npm ci && BACKEND_URL=http://127.0.0.1:8000 npm run build && npm start`.
- Put Caddy or Nginx with HTTPS in front of port 3000.

## Notes and caveats

- Image tags use `latest` for the optional services; pin versions you've tested.
- Piston runs `privileged` because it creates its own isolated sandboxes per run (namespaces, cgroups). Keep it off the public internet. Judge0 is an alternative.
- Build and compose configuration were validated in development (`docker compose config` passes, and the Next.js standalone build serves correctly), but the containers themselves weren't started there because no Docker daemon was available. Do a staging run before going live.
