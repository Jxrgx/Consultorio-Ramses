"""Cambios de estado de una cita con sus efectos en Google Calendar. Los usan el panel y el webhook."""

import logging
import uuid
from collections.abc import Callable

from googleapiclient.errors import HttpError
from postgrest.exceptions import APIError
from supabase import Client

from app import crud
from app.models import Appointment, AppointmentStatus, NotificationStatus, NotificationType
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
