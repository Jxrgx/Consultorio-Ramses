import uuid
from datetime import date, datetime

from pydantic import BaseModel


class BlockedDay(BaseModel):
    """Fila de la tabla blocked_day: fecha en la que el portal no ofrece horarios."""

    id: uuid.UUID
    psychologist_id: uuid.UUID
    day: date
    reason: str | None = None
    created_by: str | None = None
    created_at: datetime
