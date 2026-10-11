"""Tarea programada: recordatorio por WhatsApp a las citas pendientes del día."""

import logging
from datetime import datetime, time, timedelta
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
    """Envía el recordatorio a cada cita de hoy que siga pendiente, aún no haya empezado y no
    lo haya recibido ya. Devuelve cuántos se enviaron.

    Corre cada REMINDER_INTERVAL_MINUTES, así que también alcanza a las citas reservadas durante
    el día; notification_log evita enviar dos veces el mismo recordatorio.
    """
    tz = ZoneInfo(settings.TIMEZONE)
    now = (now or datetime.now(tz)).astimezone(tz)
    if now.time() < settings.REMINDER_SEND_FROM:
        return 0
    if not whatsapp.is_configured():
        logger.info("WhatsApp no está configurado; no se envían recordatorios")
        return 0

    db = get_db()
    day_start = datetime.combine(now.date(), time.min, tzinfo=tz)
    candidates = [
        a
        for a in crud.list_appointments_between(db, day_start, day_start + timedelta(days=1))
        if a.status == AppointmentStatus.PENDING and a.start_time > now
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
            lambda a, name=psychologist_name: whatsapp.send_same_day_reminder(a, name),
        ):
            sent += 1
    if candidates:
        logger.info("Recordatorios: %d enviados de %d citas pendientes hoy", sent, len(candidates))
    return sent


def _run_job() -> None:
    try:
        send_pending_reminders()
    except Exception:
        # Un fallo (Supabase caído, etc.) no debe detener el scheduler: se reintenta en la siguiente vuelta
        logger.exception("Falló el envío de recordatorios")


def start_scheduler() -> None:
    """Arranca el job en un hilo de fondo. Con varios workers de uvicorn, deja REMINDERS_ENABLED=true
    en uno solo para no enviar duplicados."""
    global _scheduler
    if not settings.REMINDERS_ENABLED or _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone=ZoneInfo(settings.TIMEZONE))
    _scheduler.add_job(
        _run_job,
        "interval",
        minutes=settings.REMINDER_INTERVAL_MINUTES,
        id="same_day_reminders",
        next_run_time=datetime.now(ZoneInfo(settings.TIMEZONE)) + timedelta(seconds=30),
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()
    logger.info("Scheduler de recordatorios activo (cada %d min)", settings.REMINDER_INTERVAL_MINUTES)


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
