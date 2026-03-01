# ─── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts
COPY frontend/ .
RUN npm run build

# ─── Stage 2: Python backend ──────────────────────────────────────────────────
FROM python:3.11-slim AS backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps for psycopg, Pillow, reportlab
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq-dev gcc libjpeg-dev zlib1g-dev && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn daphne

COPY backend/ .

# Collect static files (will be served by Nginx)
RUN DJANGO_SECRET_KEY=build-placeholder \
    USE_SQLITE=1 \
    python manage.py collectstatic --noinput 2>/dev/null || true

EXPOSE 8000

# Default command: daphne for ASGI (WebSocket support)
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "planora_backend.asgi:application"]
