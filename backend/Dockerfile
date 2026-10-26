# Build context is the repo root: docker build -f backend/Dockerfile .

FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
# empty = same origin: the API serves this build
ENV VITE_API_URL=""
RUN npm run build

FROM python:3.13-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv PATH="/app/.venv/bin:$PATH"
RUN useradd --create-home --uid 1000 app && mkdir -p /app && chown app /app
USER app
WORKDIR /app/backend
COPY --chown=app backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --frozen --no-dev --extra search --no-install-project
COPY --chown=app backend/ ./
RUN uv sync --frozen --no-dev --extra search
COPY --from=frontend --chown=app /app/frontend/dist /app/frontend/dist
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn scouter.api:app --host 0.0.0.0 --port 8000"]
