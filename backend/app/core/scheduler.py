"""Tareas programadas: recordatorio por WhatsApp antes de cada cita y limpieza de holds vencidos."""

import logging
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler

from app import crud
from app.core.config import settings
from app.core.database import get_db
from app.models import AppointmentStatus, NotificationStatus, NotificationType
from app.services import whatsapp
from app.services.appointments import send_whatsapp_and_log

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def send_pending_reminders(now: datetime | None = None) -> int:
    """Envía el recordatorio a cada cita pendiente a la que le falten REMINDER_HOURS_BEFORE horas
    o menos y que no lo haya recibido ya. Devuelve cuántos se enviaron.

    Corre cada REMINDER_INTERVAL_MINUTES: cada cita lo recibe ~24 h antes, y las reservadas con
    menos anticipación en la siguiente vuelta. notification_log evita enviarlo dos veces
    (el tipo sigue llamándose reminder_same_day en la base).
    """
    tz = ZoneInfo(settings.TIMEZONE)
    now = (now or datetime.now(tz)).astimezone(tz)
    if not settings.REMINDER_SEND_FROM <= now.time() < settings.REMINDER_SEND_UNTIL:
        return 0
    if not whatsapp.is_configured():
        logger.info("WhatsApp no está configurado; no se envían recordatorios")
        return 0

    db = get_db()
    window_end = now + timedelta(hours=settings.REMINDER_HOURS_BEFORE)
    candidates = [
        a for a in crud.list_appointments_between(db, now, window_end) if a.status == AppointmentStatus.PENDING
    ]
    already_sent = crud.appointment_ids_with_notification(
        db, [a.id for a in candidates], NotificationType.REMINDER_SAME_DAY, NotificationStatus.SENT
    )
    names = {p.id: p.name for p in crud.list_psychologists(db, limit=100)}

    sent = 0
    for appointment in candidates:
        if appointment.id in already_sent:
            continue
        psychologist_name = names.get(appointment.psychologist_id, "")
        if send_whatsapp_and_log(
            db,
            appointment,
            NotificationType.REMINDER_SAME_DAY,
            lambda a, name=psychologist_name: whatsapp.send_appointment_reminder(a, name),
        ):
            sent += 1
    if candidates:
        logger.info("Recordatorios: %d enviados de %d citas pendientes próximas", sent, len(candidates))
    return sent


def _run_job() -> None:
    try:
        send_pending_reminders()
    except Exception:
        # Un fallo (Supabase caído, etc.) no debe detener el scheduler: se reintenta en la siguiente vuelta
        logger.exception("Falló el envío de recordatorios")


def cleanup_expired_holds() -> None:
    """Libera los horarios apartados (hold) cuyo tiempo de verificación ya venció."""
    try:
        deleted = crud.delete_expired_holds(get_db(), datetime.now(UTC))
        if deleted:
            logger.info("Se liberaron %d horarios apartados sin verificar", deleted)
    except Exception:
        logger.exception("Falló la limpieza de holds vencidos")


def start_scheduler() -> None:
    """Arranca los jobs en un hilo de fondo (el backend corre en una sola instancia)."""
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone=ZoneInfo(settings.TIMEZONE))
    # La reserva también borra los holds vencidos al consultar disponibilidad; este job evita
    # que se acumulen cuando nadie está reservando.
    _scheduler.add_job(cleanup_expired_holds, "interval", minutes=1, id="cleanup_expired_holds", coalesce=True)
    if settings.REMINDERS_ENABLED:
        _scheduler.add_job(
            _run_job,
            "interval",
            minutes=settings.REMINDER_INTERVAL_MINUTES,
            id="same_day_reminders",
            next_run_time=datetime.now(ZoneInfo(settings.TIMEZONE)) + timedelta(seconds=30),
            max_instances=1,
            coalesce=True,
        )
        logger.info("Recordatorios activos (cada %d min)", settings.REMINDER_INTERVAL_MINUTES)
    _scheduler.start()


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
