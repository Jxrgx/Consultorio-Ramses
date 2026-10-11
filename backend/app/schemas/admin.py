from typing import Literal

from pydantic import BaseModel


class AppointmentStatusUpdate(BaseModel):
    # "pending" no se permite: es solo el estado inicial de una reserva
    status: Literal["confirmed", "cancelled", "completed", "no_show"]


class CalendarStatus(BaseModel):
    connected: bool
    calendar_id: str
    error: str | None = None
