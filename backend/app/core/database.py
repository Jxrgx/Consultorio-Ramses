from functools import lru_cache

from postgrest.exceptions import APIError
from supabase import Client, create_client

from app.core.config import settings

MIGRATIONS_HINT = (
    "Ejecuta backend/supabase/migrations/*.sql en Supabase (Dashboard > SQL Editor) "
    "y revisa SUPABASE_URL y SUPABASE_KEY (service_role) en el .env"
)


@lru_cache
def get_db() -> Client:
    """Cliente de Supabase compartido (usar como dependencia de FastAPI)."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


def init_db() -> None:
    """Verifica que el esquema exista en Supabase y crea el psicólogo inicial si está configurado.

    Las tablas no se crean desde aquí: la API de Supabase no permite DDL. Se crean con las
    migraciones SQL de backend/supabase/migrations.
    """
    from app import crud

    db = get_db()
    try:
        crud.list_psychologists(db, limit=1)
    except APIError as exc:
        raise RuntimeError(f"No se pudo leer la tabla psychologist ({exc.message}). {MIGRATIONS_HINT}") from exc

    if settings.PSYCHOLOGIST_NAME and settings.PSYCHOLOGIST_EMAIL and not crud.list_psychologists(db, limit=1):
        crud.create_psychologist(
            db,
            name=settings.PSYCHOLOGIST_NAME,
            email=settings.PSYCHOLOGIST_EMAIL,
            google_calendar_id=settings.GOOGLE_CALENDAR_ID,
            slot_duration_minutes=settings.SLOT_DURATION_MINUTES,
        )
