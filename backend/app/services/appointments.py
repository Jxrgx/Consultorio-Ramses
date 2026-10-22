"""Cambios de estado de una cita con sus efectos en Google Calendar. Los usan el panel y el webhook."""

import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from googleapiclient.errors import HttpError
from postgrest.exceptions import APIError
from supabase import Client

from app import crud
from app.core.config import settings
from app.models import Appointment, AppointmentStatus, NotificationStatus, NotificationType, Psychologist
from app.services import whatsapp
from app.services.google_calendar import (
    CalendarNotConfiguredError,
    delete_calendar_event,
    mark_event_confirmed,
)
from app.services.whatsapp import WhatsAppNotConfiguredError, WhatsAppSendError

logger = logging.getLogger(__name__)

# Errores de PostgREST/Postgres cuando se escribe una columna que no existe
MISSING_COLUMN = ("PGRST204", "42703")


def _calendar_id(db: Client, appointment: Appointment) -> str | None:
    psychologist = crud.get_psychologist(db, appointment.psychologist_id)
    return psychologist.google_calendar_id if psychologist else None


def confirm_appointment(db: Client, appointment: Appointment) -> None:
    """status = confirmed y "[CONFIRMADA]" en el título del evento.

    Si Google Calendar falla, la cita queda confirmada igual: el título es solo informativo.
    """
    crud.update_appointment(db, appointment.id, status=AppointmentStatus.CONFIRMED.value)
    if appointment.google_event_id:
        try:
            mark_event_confirmed(appointment.google_event_id, _calendar_id(db, appointment))
        except (HttpError, CalendarNotConfiguredError) as exc:
            logger.warning("Cita %s confirmada, pero no se actualizó el título en Google: %s", appointment.id, exc)


def cancel_appointment(db: Client, appointment: Appointment) -> None:
    """Borra el evento de Google (libera el horario) y luego marca status = cancelled.

    El evento se borra primero: si Google falla se lanza la excepción y la cita no cambia,
    para no dejar una cita cancelada que sigue ocupando el horario.
    """
    if appointment.google_event_id:
        delete_calendar_event(appointment.google_event_id, _calendar_id(db, appointment))
    crud.update_appointment(db, appointment.id, status=AppointmentStatus.CANCELLED.value)


@dataclass
class DayCancellation:
    appointment: Appointment
    cancelled: bool
    notified: bool = False
    error: str | None = None


def cancel_day(
    db: Client,
    psychologist: Psychologist,
    day: date,
    reason: str | None,
    blocked_by: str | None = None,
    now: datetime | None = None,
) -> list[DayCancellation]:
    """Bloquea el día y cancela sus citas pending/confirmed que aún no terminan, avisando a cada paciente.

    El día se bloquea primero (y se liberan los apartados en verificación) para que no entren
    reservas nuevas mientras se cancelan las existentes; se desbloquea con unblock_day.
    Cada cita se procesa por separado: si Google falla con una, esa queda sin cancelar (igual que
    cancel_appointment) y se sigue con las demás. Repetirlo es seguro: solo toma las citas que
    siguen activas.
    """
    day_start = datetime.combine(day, time.min, tzinfo=ZoneInfo(settings.TIMEZONE))
    day_end = day_start + timedelta(days=1)
    now = now or datetime.now(UTC)
    crud.block_day(db, psychologist_id=psychologist.id, day=day, reason=reason, created_by=blocked_by)
    crud.delete_holds_between(db, day_start, day_end)

    targets = [
        a
        for a in crud.list_appointments_between(db, day_start, day_end)
        if a.psychologist_id == psychologist.id
        and a.status in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED)
        and a.end_time > now
    ]

    results: list[DayCancellation] = []
    for appointment in targets:
        try:
            cancel_appointment(db, appointment)
        except (HttpError, CalendarNotConfiguredError, APIError) as exc:
            logger.warning("No se pudo cancelar la cita %s: %s", appointment.id, exc)
            error = (
                "No se guardó el cambio en la base de datos"
                if isinstance(exc, APIError)
                else "No se pudo borrar el evento de Google Calendar"
            )
            results.append(DayCancellation(appointment, cancelled=False, error=error))
            continue
        notified = send_whatsapp_and_log(
            db,
            appointment,
            NotificationType.CANCELLATION_NOTICE,
            lambda a: whatsapp.send_day_cancellation_notice(a, psychologist.name, reason),
        )
        results.append(DayCancellation(appointment, cancelled=True, notified=notified))

    logger.info(
        "Agenda del %s cancelada: %d de %d citas, %d avisos enviados",
        day,
        sum(r.cancelled for r in results),
        len(results),
        sum(r.notified for r in results),
    )
    return results


def send_whatsapp_and_log(
    db: Client, appointment: Appointment, type: NotificationType, send: Callable[[Appointment], str]
) -> bool:
    """Ejecuta send(appointment) y registra el resultado. Devuelve True si se envió."""
    try:
        message_id = send(appointment)
    except (WhatsAppSendError, WhatsAppNotConfiguredError) as exc:
        logger.warning("WhatsApp %s de la cita %s no enviado: %s", type.value, appointment.id, exc)
        log_notification(db, appointment.id, type, NotificationStatus.FAILED, error=str(exc)[:1000])
        return False
    log_notification(db, appointment.id, type, NotificationStatus.SENT, provider_message_id=message_id)
    return True


def log_notification(
    db: Client,
    appointment_id: uuid.UUID,
    type: NotificationType,
    status: NotificationStatus,
    *,
    provider_message_id: str | None = None,
    error: str | None = None,
) -> None:
    """Registra en notification_log. Nunca lanza: un fallo al registrar no debe romper el envío."""
    try:
        try:
            crud.create_notification_log(
                db,
                appointment_id=appointment_id,
                type=type,
                status=status,
                provider_message_id=provider_message_id,
                error=error,
            )
        except APIError as exc:
            if exc.code not in MISSING_COLUMN:
                raise
            # Sin la migración no existen provider_message_id ni error. Se registra sin ellos:
            # el registro del recordatorio es lo que evita reenviarlo en cada vuelta del scheduler.
            crud.create_notification_log(db, appointment_id=appointment_id, type=type, status=status)
    except APIError as exc:
        logger.error(
            "No se pudo registrar la notificación %s de la cita %s (¿falta la migración "
            "20261011020000_whatsapp_notifications.sql?): %s",
            type.value,
            appointment_id,
            exc.message,
        )
