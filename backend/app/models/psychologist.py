import uuid
from datetime import datetime

from pydantic import BaseModel


class Psychologist(BaseModel):
    """Fila de la tabla psychologist (ver supabase/migrations)."""

    id: uuid.UUID
    name: str
    email: str
    phone: str | None = None
    google_calendar_id: str = "primary"
    slot_duration_minutes: int = 50
    created_at: datetime
    updated_at: datetime
