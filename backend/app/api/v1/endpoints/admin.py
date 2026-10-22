import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from googleapiclient.errors import HttpError
from postgrest.exceptions import APIError

from app import crud
from app.api.deps import AdminEmail, DbDep, calendar_errors, find_psychologist, require_admin
from app.core.config import settings
from app.models import Appointment, AppointmentStatus, NotificationStatus, NotificationType
from app.schemas.admin import AdminAppointmentRead, AppointmentStatusUpdate, CalendarStatus
from app.schemas.appointment import AppointmentRead
from app.services.appointments import cancel_appointment, confirm_appointment
from app.services.google_calendar import CalendarNotConfiguredError, CalendarQueryError, get_busy_slots

# Código de Postgres para un valor que no existe en el enum (p. ej. falta la migración de no_show)
INVALID_ENUM_VALUE = "22P02"

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/me")
def me(email: AdminEmail) -> dict[str, str]:
    """Usuario del panel; el login lo usa para comprobar que la cuenta tiene acceso."""
    return {"email": email}


@router.get("/appointments", response_model=list[AdminAppointmentRead])
def list_appointments(
    db: DbDep,
    day: Annotated[date, Query(alias="date", description="Día a consultar (YYYY-MM-DD)")],
) -> list[AdminAppointmentRead]:
    """Citas del día (en la zona horaria del consultorio), en orden cronológico.

    Cada cita indica si ya se le envió el recordatorio y si requiere atención: sigue pendiente
    y faltan UNCONFIRMED_ALERT_MINUTES o menos para que empiece (o ya está en curso).
    """
    day_start = datetime.combine(day, time.min, tzinfo=ZoneInfo(settings.TIMEZONE))
    appointments = [
        a
        for a in crud.list_appointments_between(db, day_start, day_start + timedelta(days=1))
        # Los holds son reservas que aún no verifican su teléfono: no son citas de la agenda
        if a.status != AppointmentStatus.HOLD
    ]
    reminded = crud.appointment_ids_with_notification(
        db, [a.id for a in appointments], NotificationType.REMINDER_SAME_DAY, NotificationStatus.SENT
    )
    now = datetime.now(UTC)
    alert_from = timedelta(minutes=settings.UNCONFIRMED_ALERT_MINUTES)
    return [
        AdminAppointmentRead.model_validate(
            {
                **a.model_dump(),
                "reminder_sent": a.id in reminded,
                "unconfirmed_alert": a.status == AppointmentStatus.PENDING
                and a.start_time - alert_from <= now < a.end_time,
            }
        )
        for a in appointments
    ]


@router.patch("/appointments/{appointment_id}/status", response_model=AppointmentRead)
def update_appointment_status(
    db: DbDep, appointment_id: uuid.UUID, data: AppointmentStatusUpdate
) -> Appointment:
    appointment = crud.get_appointment(db, appointment_id)
    if appointment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada")
    new_status = AppointmentStatus(data.status)
    if appointment.status == new_status:
        return appointment
    if appointment.status == AppointmentStatus.CANCELLED:
        # Al cancelar se borra el evento y el horario queda libre: reactivarla podría causar empalmes
        raise HTTPException(
            status.HTTP_409_CONFLICT, "La cita está cancelada; para retomarla agenda una nueva"
        )

    try:
        # Confirmar y cancelar tienen efectos en Google Calendar (mismos que el webhook de WhatsApp)
        if new_status == AppointmentStatus.CONFIRMED:
            confirm_appointment(db, appointment)
        elif new_status == AppointmentStatus.CANCELLED:
            with calendar_errors():
                cancel_appointment(db, appointment)
        else:
            crud.update_appointment(db, appointment.id, status=new_status.value)
    except APIError as exc:
        if exc.code == INVALID_ENUM_VALUE:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"La base de datos no admite el estado '{new_status.value}': ejecuta las migraciones "
                "pendientes de backend/supabase/migrations en Supabase",
            ) from exc
        raise
    return crud.get_appointment(db, appointment.id)


@router.get("/calendar/status", response_model=CalendarStatus)
def calendar_status(db: DbDep) -> CalendarStatus:
    """Comprueba que Google Calendar responde para el calendario del psicólogo."""
    psychologist = find_psychologist(db, None)
    calendar_id = psychologist.google_calendar_id if psychologist else settings.GOOGLE_CALENDAR_ID
    try:
        get_busy_slots(datetime.now(ZoneInfo(settings.TIMEZONE)).date().isoformat(), calendar_id)
    except (CalendarNotConfiguredError, CalendarQueryError, HttpError) as exc:
        return CalendarStatus(connected=False, calendar_id=calendar_id, error=str(exc))
    return CalendarStatus(connected=True, calendar_id=calendar_id)
