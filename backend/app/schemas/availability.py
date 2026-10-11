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
