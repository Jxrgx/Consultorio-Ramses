# psico-agenda

Sistema de citas médicas. Monorepo:

- `backend/` — FastAPI + SQLModel (PostgreSQL) + Google Calendar
- `frontend/` — React + Vite + TypeScript + Tailwind CSS

## Desarrollo

```bash
# Backend (http://localhost:8000)
cd backend
uv sync
cp .env.example .env
uv run uvicorn app.main:app --reload

# Frontend (http://localhost:5173)
cd frontend
npm install
cp .env.example .env
npm run dev
```

El frontend redirige `/api` al backend mediante el proxy de Vite.
