import uuid
from datetime import datetime

from pydantic import BaseModel


class Patient(BaseModel):
    """Fila de la tabla patient (ver supabase/migrations)."""

    id: uuid.UUID
    full_name: str
    # Número en formato internacional (E.164), usado como identificador para WhatsApp
    phone: str
    email: str | None = None
    created_at: datetime
    updated_at: datetime
