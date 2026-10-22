import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import AppointmentStatus, AppointmentType
from app.models.patient import Patient


class Appointment(BaseModel):
    """Fila de la tabla appointment (ver supabase/migrations)."""

    id: uuid.UUID
    psychologist_id: uuid.UUID
    patient_id: uuid.UUID
    google_event_id: str | None = None
    start_time: datetime
    end_time: datetime
    type: AppointmentType
    status: AppointmentStatus = AppointmentStatus.PENDING
    meeting_link: str | None = None
    notes: str | None = None
    # Hasta cuándo dura el apartado de una cita en hold
    hold_expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # Presente cuando la consulta incluye la relación: select("*, patient(*)")
    patient: Patient | None = None
