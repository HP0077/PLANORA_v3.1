# Planora – All-in-One Event Management Platform

This repository contains a Django REST + Channels backend and a React + Tailwind frontend implementing user auth, events, tasks, chat, posters/certificates, and budgeting.

## Developer Docs

c:\Users\User\Desktop\planora_v3.0

- Implementation plan: `docs/IMPLEMENTATION_PLAN.md`
- API spec: `docs/API_SPEC.md`
- DB schema (SQLite DDL): `docs/DB_SCHEMA_SQLITE.sql`
- Wireframes & components: `docs/UI_WIREFRAMES_AND_COMPONENTS.md`
- Example flows & snippets: `docs/EXAMPLE_FLOWS.md`

Quick start (Windows, cmd):

1) Backend env and install

```
cd c:\Users\User\Desktop\planora_v3.0\backend
copy .env.example .env
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
# If daphne is not already available, install it
pip install daphne
python manage.py migrate
# Run ASGI (needed for WebSockets/chat)
.venv\Scripts\daphne.exe -b 0.0.0.0 -p 8000 planora_backend.asgi:application
```

2) Frontend

```
cd c:\Users\User\Desktop\planora_v3.0\frontend
npm install
npm run dev
```

## Command cheatsheet (Windows cmd)

Backend (ASGI, required for chat):
```
cd c:\Users\User\Desktop\planora_v3.0\backend
.venv\Scripts\activate
python manage.py migrate
.venv\Scripts\daphne.exe -b 0.0.0.0 -p 8000 planora_backend.asgi:application
```

Frontend (Vite):
```
cd c:\Users\User\Desktop\planora_v3.0\frontend
set VITE_API_BASE=http://127.0.0.1:8000/api
set VITE_WS_BASE=ws://127.0.0.1:8000
npm run dev
```

Stop old servers before switching: use Ctrl+C in the terminal running `runserver`; keep only Daphne on port 8000 for HTTP + WebSockets.

Visit `http://localhost:5173` (or the Vite dev port shown in the console) for the frontend and `http://localhost:8000` for the API.

If you configure custom hosts/ports, align both REST and WS bases:
- `VITE_API_BASE=http://localhost:8000/api`
- `VITE_WS_BASE=ws://localhost:8000`

API map (prefix `/api`):
- `POST /users/register/` – register
- `POST /users/token/` – login with username or email + password
- `POST /users/token/refresh/` – refresh token
- `GET /users/me/` – current user
- `GET/POST /events/` – list/create user events
- `GET /events/<id>/timeline/` – append-only activity feed for an event; filters: `type`, `user`, `since`, `until`; entries carry `source`, `payload.snapshot`, and automation `matched_conditions` for “why”.

WebSocket: `ws://localhost:8000/ws/chats/<room_id>/`

Authentication for WS: append `?token=<ACCESS_TOKEN>`; membership is enforced server-side.

## Backend environment (.env)

Create `backend/.env` by copying `backend/.env.example` and adjust as needed:

- `USE_SQLITE=1` for local dev; remove for Postgres (see `infra/docker-compose.yml`)
- `FRONTEND_ORIGIN=http://localhost:5173` for CORS
- `API_PAGE_SIZE`, `THROTTLE_ANON`, `THROTTLE_USER`, `THROTTLE_LOGIN` to control DRF pagination and rate limits
- `LOG_LEVEL` to control log verbosity

## WebSocket authentication

For chat, include the access token in the query string:

`ws://localhost:8000/ws/chats/<room_id>/?token=<ACCESS_TOKEN>`

Unauthenticated connections are rejected; users can only send messages to rooms whose event they own.

## Run (Windows cmd)

Backend:

```
cd c:\Users\User\Desktop\planora_v3.0\backend
copy .env.example .env
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
# Use ASGI for HTTP+WS
.venv\Scripts\daphne.exe -b 0.0.0.0 -p 8000 planora_backend.asgi:application
```

Frontend:

```
cd c:\Users\User\Desktop\planora_v3.0\frontend
npm install
npm run dev
```

### AI Assistant (Phase 4)

- Endpoint: POST `/api/ai/ask/` { event_id, question }
- Provider selection: `AI_PROVIDER` env (`ollama` default). If `GROQ_API_KEY` is set, you can switch to `groq` (llama3-70b-8192).
- Rate limit: 20 queries/hour/user (ScopedRateThrottle `ai_query`).
- Frontend: Event page tab “AI Assistant 🤖” at `/ai-assistant`.
- Scope: event owner/participants only; context capped (~2.5k tokens); files/cert URLs excluded; no destructive actions performed by AI.

### Recent changes (v3.0 budget & certificates upgrade)

- Added `apps.automation` with `AutomationLog` and `run_automation()`; shipped with migrations and registered in settings.
- Event lifecycle now tracked via `Event.status` (DRAFT → PLANNING → LIVE → COMPLETED → ARCHIVED); run `python manage.py migrate` to apply.
- Budget: aggregation summary endpoint plus mutation locking when status is COMPLETED/ARCHIVED; existing endpoints remain unchanged.
- Certificates: CSV/XLSX ingestion, LIVE-only generation, stored certificate records, and automation trigger logging.
- Dependency update: `openpyxl` added to backend `requirements.txt` for Excel support.
- Demo automation rule is seeded by migrations: trigger `event_risk_high` with conditions `{ "risk_score": { ">": 0.7 } }` will post a chat, create a "Review event risks" task, and notify the event owner. Destructive actions require `confirm` in the payload when `requires_confirmation` is true (call `run_automation("event_risk_high", {"event_id": <id>, "confirm": true})`).

## Troubleshooting

- WebSocket 404 on `/ws/chats/<room_id>/`: ensure you are running the ASGI server (`daphne planora_backend.asgi:application`) and that the frontend `VITE_WS_BASE` points to the same host/port.
- Mixed REST/WS hosts: set `VITE_API_BASE` and `VITE_WS_BASE` explicitly to the same domain/port to avoid CORS or connection failures.
- Stale server after code change: restart Daphne so new routes/serializers load; `runserver` alone will not serve WebSockets.


1) Backend env and install

```
cd c:\Users\User\Desktop\planora_v3.0\backend
copy .env.example .env
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8001
or 
python manage.py runserver

C:\Users\User\Desktop\planora_v3.0\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8001

Frontend:

```
cd c:\Users\User\Desktop\planora_v3.0\frontend
npm install
npm run dev

or

cd /d C:\Users\User\Desktop\planora_v3.0\frontend
set VITE_API_BASE=http://127.0.0.1:8001/api
npm run dev -- --host --port 5173

Ollama COMMAND:

'''

ollama serve 

ollama run llama3