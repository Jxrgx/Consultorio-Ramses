from collections.abc import Sequence
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.services.google_calendar import TimeSlot, get_busy_slots


def workday_bounds(day: date, start: time, end: time, tz: ZoneInfo) -> TimeSlot:
    return TimeSlot(datetime.combine(day, start, tzinfo=tz), datetime.combine(day, end, tzinfo=tz))


def compute_free_slots(
    workday: TimeSlot,
    busy: Sequence[TimeSlot],
    slot_minutes: int,
    not_before: datetime | None = None,
) -> list[TimeSlot]:
    """Divide la jornada en bloques consecutivos de slot_minutes (sin descanso entre ellos)
    y descarta los que se traslapan con algún intervalo ocupado o empiezan antes de not_before."""
    step = timedelta(minutes=slot_minutes)
    free: list[TimeSlot] = []
    cursor = workday.start
    while cursor + step <= workday.end:
        slot = TimeSlot(cursor, cursor + step)
        overlaps = any(b.start < slot.end and slot.start < b.end for b in busy)
        if not overlaps and (not_before is None or slot.start >= not_before):
            free.append(slot)
        cursor += step
    return free


def get_available_slots(
    day: date, calendar_id: str | None, slot_minutes: int, extra_busy: Sequence[TimeSlot] = ()
) -> list[TimeSlot]:
    """Slots libres del día: jornada configurada menos lo ocupado en Google Calendar y en
    extra_busy (citas de la base que aún no están en el calendario, como los holds)."""
    tz = ZoneInfo(settings.TIMEZONE)
    workday = workday_bounds(day, settings.WORKDAY_START, settings.WORKDAY_END, tz)
    busy = [*get_busy_slots(day.isoformat(), calendar_id), *extra_busy]
    return compute_free_slots(workday, busy, slot_minutes, not_before=datetime.now(tz))
