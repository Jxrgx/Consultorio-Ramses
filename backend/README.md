# psico-agenda · backend

```bash
uv sync                      # crea .venv e instala dependencias
cp .env.example .env         # completar SUPABASE_URL y SUPABASE_KEY (service_role)
uv run uvicorn app.main:app --reload
```

Antes del primer arranque, crea el esquema en Supabase: abre **SQL Editor** en el dashboard,
pega el contenido de `supabase/migrations/20261011000000_init.sql` y ejecútalo.

API en http://localhost:8000 · docs en http://localhost:8000/docs
