# Planora - All-in-One Event Management Platform

Full-stack event management platform: Django REST + Channels backend, React + Tailwind frontend. Features include user auth, events, tasks, real-time chat, poster/certificate editor, budgeting, analytics, AI assistant, and automation rules.

> **This repo ships with a pre-populated SQLite database, media files, and environment configs so you can clone and run immediately -- no setup beyond installing dependencies.**

---

## Quick Start (Clone & Run -- Windows)

> **Prerequisites:** Python 3.10+, Node.js 18+, Git

### Step 0 -- Clone

```
cd %USERPROFILE%\Desktop
git clone https://github.com/HP0077/PLANORA_v3.git planora_v3.0
```

### Step 1 -- Backend (open CMD window 1)

```
cd %USERPROFILE%\Desktop\planora_v3.0\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
daphne -b 127.0.0.1 -p 8001 planora_backend.asgi:application
```

> Keep this window open. Backend runs at **http://127.0.0.1:8001**
> The `.env` and `db.sqlite3` are already in the repo -- no extra config needed.

### Step 2 -- Frontend (open CMD window 2)

```
cd %USERPROFILE%\Desktop\planora_v3.0\frontend
npm install
npm run dev -- --host --port 5173
```

> Keep this window open. Frontend runs at **http://localhost:5173**
> The `frontend/.env` already points to `http://127.0.0.1:8001`.

### Step 3 -- Open the App

Go to **http://localhost:5173** in your browser. The database already has demo users and events.

---

### Quick Restart (if you closed everything)

**CMD 1 -- Backend:**
```
cd %USERPROFILE%\Desktop\planora_v3.0\backend
.venv\Scripts\activate
daphne -b 127.0.0.1 -p 8001 planora_backend.asgi:application
```

**CMD 2 -- Frontend:**
```
cd %USERPROFILE%\Desktop\planora_v3.0\frontend
npm run dev -- --host --port 5173
```

---

## What's Included

| Component | Tech | Port |
|-----------|------|------|
| Backend (ASGI) | Django 5 + Channels + Daphne | 8001 |
| Frontend | React + Vite + Tailwind | 5173 |
| Database | SQLite (pre-populated, in repo) | -- |
| AI Assistant | Groq cloud (API key in `.env`) + Ollama fallback | -- |

### AI Assistant

The Groq API key is already configured in `backend/.env`. The AI Assistant works out of the box. If you also want local Ollama as fallback:

```
ollama serve          (CMD window 3)
ollama pull llama3    (separate terminal)
```

---

## Developer Docs

- [API Spec](docs/API_SPEC.md)
- [DB Schema](docs/DB_SCHEMA_SQLITE.sql)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [UI Wireframes & Components](docs/UI_WIREFRAMES_AND_COMPONENTS.md)
- [Example Flows](docs/EXAMPLE_FLOWS.md)

### Key API Endpoints (prefix `/api`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/users/register/` | Register |
| POST | `/users/token/` | Login (username or email + password) |
| POST | `/users/token/refresh/` | Refresh JWT |
| GET | `/users/me/` | Current user profile |
| GET/POST | `/events/` | List / create events |
| GET | `/events/<id>/timeline/` | Activity feed |
| POST | `/ai/ask/` | AI Assistant query |
| WS | `ws://host/ws/chats/<room_id>/?token=<JWT>` | Real-time chat |

### Backend Environment Variables (`backend/.env`)

Already configured. Key settings:
- `USE_SQLITE=1` -- uses SQLite (default for local dev)
- `GROQ_API_KEY` -- Groq cloud LLM key (pre-configured)
- `AI_PROVIDER=groq` -- use Groq as primary AI provider
- `FRONTEND_ORIGIN=http://localhost:5173` -- CORS origin

## Troubleshooting

- **WebSocket 404:** Make sure you're running Daphne (not `runserver`). `runserver` doesn't support WebSockets.
- **Port conflict:** If port 8001 is busy, change it in the `daphne` command and update `frontend/.env` accordingly.
- **Missing dependencies:** Run `pip install -r requirements.txt` and `npm install` again.
- **Database reset:** Delete `backend/db.sqlite3`, then run `python manage.py migrate` to start fresh (you'll lose demo data).
