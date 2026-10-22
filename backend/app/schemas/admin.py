from typing import Literal

from pydantic import BaseModel

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
