import datetime as dt

from pydantic import BaseModel


class Slot(BaseModel):
    start: dt.datetime
    end: dt.datetime


class AvailabilityResponse(BaseModel):
    date: dt.date
    timezone: str
    slot_duration_minutes: int
    slots: list[Slot]
    # El psicólogo bloqueó el día (no laboral): no hay horarios
    blocked: bool = False


class BlockedDaysResponse(BaseModel):
    # Fechas del rango en las que el portal no ofrece horarios
    dates: list[dt.date]
