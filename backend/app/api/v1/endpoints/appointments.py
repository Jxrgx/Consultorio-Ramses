import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from googleapiclient.errors import HttpError
from postgrest.exceptions import APIError
from supabase import Client

from app import crud
from app.core.config import settings
from app.core.database import get_db
from app.models import Appointment, Psychologist
from app.schemas.appointment import AppointmentRead, BookAppointmentRequest
from app.schemas.availability import AvailabilityResponse, Slot
from app.services.availability import get_available_slots
from app.services.google_calendar import (
    CalendarEventData,
    CalendarNotConfiguredError,
    CalendarQueryError,
    create_calendar_event,
)

router = APIRouter()

DbDep = Annotated[Client, Depends(get_db)]

SLOT_UNAVAILABLE = "El horario solicitado no está disponible"


@contextmanager
def _calendar_errors() -> Iterator[None]:
    """Traduce los errores de Google Calendar a respuestas HTTP."""
    try:
        yield
    except CalendarNotConfiguredError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except (HttpError, CalendarQueryError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Google Calendar: {exc}") from exc


def _find_psychologist(db: Client, psychologist_id: uuid.UUID | None) -> Psychologist | None:
    """Devuelve el psicólogo indicado o, si no se indica, el único registrado (None si no hay)."""
    if psychologist_id is not None:
        psychologist = crud.get_psychologist(db, psychologist_id)
        if psychologist is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Psicólogo no encontrado")
        return psychologist
    psychologists = crud.list_psychologists(db, limit=2)
    if len(psychologists) > 1:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Hay varios psicólogos: indica psychologist_id"
        )
    return psychologists[0] if psychologists else None


@router.get("/availability", response_model=AvailabilityResponse, tags=["availability"])
def get_availability(
    db: DbDep,
    day: Annotated[date, Query(alias="date", description="Día a consultar (YYYY-MM-DD)")],
    psychologist_id: uuid.UUID | None = None,
) -> AvailabilityResponse:
    psychologist = _find_psychologist(db, psychologist_id)
    # Sin psicólogos registrados se usan los valores del .env
    calendar_id = psychologist.google_calendar_id if psychologist else None
    slot_minutes = (
        psychologist.slot_duration_minutes if psychologist else settings.SLOT_DURATION_MINUTES
    )

    with _calendar_errors():
        free = get_available_slots(day, calendar_id, slot_minutes)

    return AvailabilityResponse(
        date=day,
        timezone=settings.TIMEZONE,
        slot_duration_minutes=slot_minutes,
        slots=[Slot(start=s.start, end=s.end) for s in free],
    )


@router.post(
    "/appointments/book",
    response_model=AppointmentRead,
    status_code=status.HTTP_201_CREATED,
    tags=["appointments"],
)
def book_appointment(db: DbDep, data: BookAppointmentRequest) -> Appointment:
    psychologist = _find_psychologist(db, data.psychologist_id)
    if psychologist is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No hay psicólogo registrado (define PSYCHOLOGIST_NAME y PSYCHOLOGIST_EMAIL en el .env)",
        )

    start_time = data.start_time
    end_time = start_time + timedelta(minutes=psychologist.slot_duration_minutes)

    # El horario debe ser uno de los slots libres según Google Calendar...
    local_day = start_time.astimezone(ZoneInfo(settings.TIMEZONE)).date()
    with _calendar_errors():
        free = get_available_slots(
            local_day, psychologist.google_calendar_id, psychologist.slot_duration_minutes
        )
    if not any(slot.start == start_time for slot in free):
        raise HTTPException(status.HTTP_409_CONFLICT, SLOT_UNAVAILABLE)

    # ...y no chocar con citas de la base que aún no estén en el calendario
    if crud.has_overlapping_appointment(db, psychologist.id, start_time, end_time):
        raise HTTPException(status.HTTP_409_CONFLICT, SLOT_UNAVAILABLE)

    patient = crud.get_patient_by_phone(db, data.phone)
    if patient is None:
        patient = crud.create_patient(
            db, full_name=data.patient_name, phone=data.phone, email=data.email
        )
    elif data.email and not patient.email:
        patient = crud.update_patient(db, patient.id, email=data.email)

    try:
        appointment = crud.create_appointment(
            db,
            psychologist_id=psychologist.id,
            patient_id=patient.id,
            start_time=start_time,
            end_time=end_time,
            type=data.type,
            notes=data.notes,
        )
    except APIError as exc:
        # Otra reserva tomó el mismo horario entre la verificación y el insert
        if exc.code == crud.OVERLAP_VIOLATION:
            raise HTTPException(status.HTTP_409_CONFLICT, SLOT_UNAVAILABLE) from exc
        raise

    try:
        with _calendar_errors():
            event = create_calendar_event(
                CalendarEventData(
                    patient_name=patient.full_name,
                    patient_phone=patient.phone,
                    patient_email=patient.email,
                    start_time=start_time,
                    end_time=end_time,
                    type=data.type,
                    notes=data.notes,
                    calendar_id=psychologist.google_calendar_id,
                )
            )
    except HTTPException:
        # Sin evento en el calendario la cita no es válida: se descarta para liberar el horario
        crud.delete_appointment(db, appointment.id)
        raise

    crud.update_appointment(
        db, appointment.id, google_event_id=event.google_event_id, meeting_link=event.meeting_link
    )
    return crud.get_appointment(db, appointment.id)
