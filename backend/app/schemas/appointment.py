import re
import uuid
from datetime import datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.models.enums import AppointmentStatus, AppointmentType


class BookAppointmentRequest(BaseModel):
    patient_name: str = Field(min_length=1, max_length=120)
    # Formato internacional recomendado (p. ej. +5215512345678), se usa para WhatsApp
    phone: str = Field(min_length=8, max_length=30)
    email: str | None = Field(default=None, max_length=255)
    start_time: AwareDatetime
    type: AppointmentType
    notes: str | None = None
    # Opcional si solo hay un psicólogo registrado
    psychologist_id: uuid.UUID | None = None

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, value: str) -> str:
        # Quita espacios, guiones y paréntesis para que el mismo número no genere dos pacientes
        normalized = re.sub(r"[^\d+]", "", value)
        if not re.fullmatch(r"\+?\d{8,15}", normalized):
            raise ValueError("Teléfono inválido")
        return normalized


class PatientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    phone: str
    email: str | None


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    psychologist_id: uuid.UUID
    patient: PatientRead
    start_time: datetime
    end_time: datetime
    type: AppointmentType
    status: AppointmentStatus
    google_event_id: str | None
    meeting_link: str | None
    notes: str | None
    created_at: datetime
