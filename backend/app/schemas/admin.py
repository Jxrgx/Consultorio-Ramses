import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.appointment import AppointmentRead


class AdminAppointmentRead(AppointmentRead):
    # Se envió el recordatorio por WhatsApp (si no, el paciente no pudo confirmar desde ahí)
    reminder_sent: bool = False
    # Sigue sin confirmar y faltan UNCONFIRMED_ALERT_MINUTES o menos para la cita
    unconfirmed_alert: bool = False


class AppointmentStatusUpdate(BaseModel):
    # "pending" no se permite: es solo el estado inicial de una reserva
    status: Literal["confirmed", "cancelled", "completed", "no_show"]


class CalendarStatus(BaseModel):
    connected: bool
    calendar_id: str
    error: str | None = None


class CancelDayRequest(BaseModel):
    date: dt.date
    # Se incluye en el WhatsApp a cada paciente
    reason: str | None = Field(default=None, max_length=200)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str | None) -> str | None:
        # Meta rechaza parámetros de plantilla con saltos de línea, tabs o muchos espacios seguidos
        value = " ".join((value or "").split())
        return value or None


class CancelDayItem(BaseModel):
    appointment_id: uuid.UUID
    patient_name: str
    start_time: dt.datetime
    cancelled: bool
    # Se envió el aviso por WhatsApp
    notified: bool
    error: str | None = None


class BlockedDayRead(BaseModel):
    day: dt.date
    reason: str | None = None
    created_by: str | None = None
    created_at: dt.datetime


class CancelDayResponse(BaseModel):
    date: dt.date
    # El día quedó bloqueado: el portal ya no ofrece horarios en esa fecha
    blocked_day: BlockedDayRead
    # Citas activas que había ese día (las que ya terminaron no se tocan)
    total: int
    cancelled: int
    notified: int
    items: list[CancelDayItem]
