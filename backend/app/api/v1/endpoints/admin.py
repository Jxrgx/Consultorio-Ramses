import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from googleapiclient.errors import HttpError
from postgrest.exceptions import APIError
from supabase import Client

from app import crud
from app.api.deps import AdminEmail, DbDep, calendar_errors, find_psychologist, require_admin
from app.core.config import settings
from app.models import Appointment, AppointmentStatus, NotificationStatus, NotificationType, Psychologist
from app.schemas.admin import (
    AdminAppointmentRead,
    AppointmentStatusUpdate,
    BlockedDayRead,
    CalendarStatus,
    CancelDayItem,
    CancelDayRequest,
    CancelDayResponse,
)
from app.schemas.appointment import AppointmentRead
from app.services.appointments import cancel_appointment, cancel_day, confirm_appointment
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


def _require_psychologist(db: Client) -> Psychologist:
    psychologist = find_psychologist(db, None)
    if psychologist is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "No hay psicólogo registrado")
    return psychologist


def _missing_table_error() -> HTTPException:
    return HTTPException(
        status.HTTP_409_CONFLICT,
        "Falta la tabla de días bloqueados: ejecuta la migración "
        "backend/supabase/migrations/20261022000000_blocked_day.sql en Supabase",
    )


@router.post("/appointments/cancel-day", response_model=CancelDayResponse)
def cancel_day_appointments(db: DbDep, email: AdminEmail, data: CancelDayRequest) -> CancelDayResponse:
    """Bloquea el día y cancela sus citas pendientes y confirmadas, avisando a cada paciente por WhatsApp.

    Con el día bloqueado el portal no ofrece horarios en esa fecha hasta que se desbloquee
    (DELETE /admin/blocked-days/{date}). Si alguna cita no se pudo cancelar se informa en
    items (error) y se puede reintentar.
    """
    today = datetime.now(ZoneInfo(settings.TIMEZONE)).date()
    if data.date < today:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "No se puede cancelar la agenda de un día pasado")

    psychologist = _require_psychologist(db)
    try:
        results = cancel_day(db, psychologist, data.date, data.reason, blocked_by=email)
    except APIError as exc:
        if exc.code in crud.MISSING_TABLE:
            raise _missing_table_error() from exc
        raise
    blocked = crud.get_blocked_day(db, psychologist.id, data.date)
    return CancelDayResponse(
        date=data.date,
        blocked_day=BlockedDayRead.model_validate(blocked.model_dump()),
        total=len(results),
        cancelled=sum(r.cancelled for r in results),
        notified=sum(r.notified for r in results),
        items=[
            CancelDayItem(
                appointment_id=r.appointment.id,
                patient_name=r.appointment.patient.full_name if r.appointment.patient else "",
                start_time=r.appointment.start_time,
                cancelled=r.cancelled,
                notified=r.notified,
                error=r.error,
            )
            for r in results
        ],
    )


@router.get("/blocked-days", response_model=list[BlockedDayRead])
def list_blocked_days(
    db: DbDep,
    start: Annotated[date, Query(alias="from", description="Primer día (YYYY-MM-DD)")],
    end: Annotated[date, Query(alias="to", description="Último día, inclusive")],
) -> list[BlockedDayRead]:
    psychologist = _require_psychologist(db)
    return [BlockedDayRead.model_validate(b.model_dump()) for b in crud.list_blocked_days(db, psychologist.id, start, end)]


@router.delete("/blocked-days/{day}", status_code=status.HTTP_204_NO_CONTENT)
def unblock_day(db: DbDep, day: date) -> None:
    """Vuelve a habilitar el día en el portal. Las citas que se cancelaron al bloquearlo siguen canceladas."""
    psychologist = _require_psychologist(db)
    try:
        found = crud.unblock_day(db, psychologist.id, day)
    except APIError as exc:
        if exc.code in crud.MISSING_TABLE:
            raise _missing_table_error() from exc
        raise
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ese día no está bloqueado")


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
