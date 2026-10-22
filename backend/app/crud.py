"""Acceso a las tablas de Supabase. Cada función recibe el cliente para poder sustituirlo en pruebas."""

import logging
import uuid
from datetime import date, datetime

from postgrest.exceptions import APIError
from supabase import Client

from app.models import (
    Appointment,
    AppointmentStatus,
    AppointmentType,
    BlockedDay,
    NotificationStatus,
    NotificationType,
    OtpCode,
    Patient,
    Psychologist,
)

logger = logging.getLogger(__name__)

# Código de Postgres para violación de la restricción appointment_no_overlap
OVERLAP_VIOLATION = "23P01"

APPOINTMENT_WITH_PATIENT = "*, patient(*)"


def list_psychologists(db: Client, limit: int) -> list[Psychologist]:
    rows = db.table("psychologist").select("*").limit(limit).execute().data
    return [Psychologist.model_validate(row) for row in rows]


def get_psychologist(db: Client, psychologist_id: uuid.UUID) -> Psychologist | None:
    rows = db.table("psychologist").select("*").eq("id", str(psychologist_id)).limit(1).execute().data
    return Psychologist.model_validate(rows[0]) if rows else None


def create_psychologist(
    db: Client, *, name: str, email: str, google_calendar_id: str, slot_duration_minutes: int
) -> Psychologist:
    row = {
        "name": name,
        "email": email,
        "google_calendar_id": google_calendar_id,
        "slot_duration_minutes": slot_duration_minutes,
    }
    return Psychologist.model_validate(db.table("psychologist").insert(row).execute().data[0])


def get_patient_by_phone(db: Client, phone: str) -> Patient | None:
    rows = db.table("patient").select("*").eq("phone", phone).limit(1).execute().data
    return Patient.model_validate(rows[0]) if rows else None


def create_patient(db: Client, *, full_name: str, phone: str, email: str | None) -> Patient:
    row = {"full_name": full_name, "phone": phone, "email": email}
    return Patient.model_validate(db.table("patient").insert(row).execute().data[0])


def update_patient(db: Client, patient_id: uuid.UUID, **fields) -> Patient:
    rows = db.table("patient").update(fields).eq("id", str(patient_id)).execute().data
    return Patient.model_validate(rows[0])


def has_overlapping_appointment(
    db: Client, psychologist_id: uuid.UUID, start_time: datetime, end_time: datetime
) -> bool:
    rows = (
        db.table("appointment")
        .select("id")
        .eq("psychologist_id", str(psychologist_id))
        .neq("status", AppointmentStatus.CANCELLED.value)
        .lt("start_time", end_time.isoformat())
        .gt("end_time", start_time.isoformat())
        .limit(1)
        .execute()
        .data
    )
    return bool(rows)


def get_appointment(db: Client, appointment_id: uuid.UUID) -> Appointment | None:
    rows = (
        db.table("appointment")
        .select(APPOINTMENT_WITH_PATIENT)
        .eq("id", str(appointment_id))
        .limit(1)
        .execute()
        .data
    )
    return Appointment.model_validate(rows[0]) if rows else None


def list_appointments_between(db: Client, start: datetime, end: datetime) -> list[Appointment]:
    """Citas que empiezan en [start, end), en orden cronológico, con los datos del paciente."""
    rows = (
        db.table("appointment")
        .select(APPOINTMENT_WITH_PATIENT)
        .gte("start_time", start.isoformat())
        .lt("start_time", end.isoformat())
        .order("start_time")
        .execute()
        .data
    )
    return [Appointment.model_validate(row) for row in rows]


def create_appointment(
    db: Client,
    *,
    psychologist_id: uuid.UUID,
    patient_id: uuid.UUID,
    start_time: datetime,
    end_time: datetime,
    type: AppointmentType,
    notes: str | None,
    status: AppointmentStatus = AppointmentStatus.PENDING,
    hold_expires_at: datetime | None = None,
) -> Appointment:
    row = {
        "psychologist_id": str(psychologist_id),
        "patient_id": str(patient_id),
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "type": type.value,
        "status": status.value,
        "notes": notes,
    }
    if hold_expires_at is not None:
        row["hold_expires_at"] = hold_expires_at.isoformat()
    return Appointment.model_validate(db.table("appointment").insert(row).execute().data[0])


def update_appointment(db: Client, appointment_id: uuid.UUID, **fields) -> None:
    db.table("appointment").update(fields).eq("id", str(appointment_id)).execute()


def delete_appointment(db: Client, appointment_id: uuid.UUID) -> None:
    db.table("appointment").delete().eq("id", str(appointment_id)).execute()


# --- Holds (horarios apartados mientras se verifica el OTP) ---

ACTIVE_STATUSES = [AppointmentStatus.HOLD.value, AppointmentStatus.PENDING.value, AppointmentStatus.CONFIRMED.value]


def delete_expired_holds(db: Client, now: datetime) -> int:
    """Borra las citas en hold cuyo apartado venció (sus otp_code se borran en cascada)."""
    rows = (
        db.table("appointment")
        .delete()
        .eq("status", AppointmentStatus.HOLD.value)
        .lt("hold_expires_at", now.isoformat())
        .execute()
        .data
    )
    return len(rows)


def delete_holds_for_patient(db: Client, patient_id: uuid.UUID) -> None:
    """Libera los apartados previos de un paciente (p. ej. abandonó la verificación y reintenta)."""
    db.table("appointment").delete().eq("patient_id", str(patient_id)).eq(
        "status", AppointmentStatus.HOLD.value
    ).execute()


def count_active_appointments(db: Client, patient_id: uuid.UUID, now: datetime) -> int:
    """Citas futuras del paciente que siguen activas (hold, pending o confirmed)."""
    rows = (
        db.table("appointment")
        .select("id")
        .eq("patient_id", str(patient_id))
        .in_("status", ACTIVE_STATUSES)
        .gt("start_time", now.isoformat())
        .execute()
        .data
    )
    return len(rows)


def list_busy_intervals(db: Client, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    """Intervalos ocupados en la base (citas activas y holds) que se cruzan con [start, end).

    Complementa a Google Calendar: los holds solo existen aquí. Llamar después de
    delete_expired_holds para no contar apartados vencidos.
    """
    rows = (
        db.table("appointment")
        .select("start_time,end_time")
        .in_("status", ACTIVE_STATUSES)
        .lt("start_time", end.isoformat())
        .gt("end_time", start.isoformat())
        .execute()
        .data
    )
    return [(datetime.fromisoformat(r["start_time"]), datetime.fromisoformat(r["end_time"])) for r in rows]


# --- Días bloqueados ---

# PostgREST/Postgres cuando la tabla no existe (falta la migración 20261022000000_blocked_day.sql)
MISSING_TABLE = ("PGRST205", "42P01")


def list_blocked_days(db: Client, psychologist_id: uuid.UUID, start: date, end: date) -> list[BlockedDay]:
    """Días bloqueados en [start, end], en orden. Sin la migración devuelve [] para no tumbar el portal."""
    try:
        rows = (
            db.table("blocked_day")
            .select("*")
            .eq("psychologist_id", str(psychologist_id))
            .gte("day", start.isoformat())
            .lte("day", end.isoformat())
            .order("day")
            .execute()
            .data
        )
    except APIError as exc:
        if exc.code not in MISSING_TABLE:
            raise
        logger.error("Falta la tabla blocked_day: ejecuta la migración 20261022000000_blocked_day.sql")
        return []
    return [BlockedDay.model_validate(row) for row in rows]


def get_blocked_day(db: Client, psychologist_id: uuid.UUID, day: date) -> BlockedDay | None:
    blocked = list_blocked_days(db, psychologist_id, day, day)
    return blocked[0] if blocked else None


def block_day(
    db: Client, *, psychologist_id: uuid.UUID, day: date, reason: str | None, created_by: str | None
) -> BlockedDay:
    """Bloquea el día; si ya estaba bloqueado actualiza el motivo."""
    row = {
        "psychologist_id": str(psychologist_id),
        "day": day.isoformat(),
        "reason": reason,
        "created_by": created_by,
    }
    data = db.table("blocked_day").upsert(row, on_conflict="psychologist_id,day").execute().data
    return BlockedDay.model_validate(data[0])


def unblock_day(db: Client, psychologist_id: uuid.UUID, day: date) -> bool:
    """Devuelve True si el día estaba bloqueado."""
    rows = (
        db.table("blocked_day")
        .delete()
        .eq("psychologist_id", str(psychologist_id))
        .eq("day", day.isoformat())
        .execute()
        .data
    )
    return bool(rows)


def delete_holds_between(db: Client, start: datetime, end: datetime) -> int:
    """Libera los apartados (hold) que empiezan en [start, end): p. ej. al bloquear ese día."""
    rows = (
        db.table("appointment")
        .delete()
        .eq("status", AppointmentStatus.HOLD.value)
        .gte("start_time", start.isoformat())
        .lt("start_time", end.isoformat())
        .execute()
        .data
    )
    return len(rows)


# --- Códigos OTP ---


def create_otp(
    db: Client, *, appointment_id: uuid.UUID, phone: str, code_hash: str, expires_at: datetime
) -> OtpCode:
    row = {
        "appointment_id": str(appointment_id),
        "phone": phone,
        "code_hash": code_hash,
        "expires_at": expires_at.isoformat(),
    }
    return OtpCode.model_validate(db.table("otp_code").insert(row).execute().data[0])


def latest_otp(db: Client, appointment_id: uuid.UUID) -> OtpCode | None:
    rows = (
        db.table("otp_code")
        .select("*")
        .eq("appointment_id", str(appointment_id))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return OtpCode.model_validate(rows[0]) if rows else None


def count_otps_for_phone_since(db: Client, phone: str, since: datetime) -> int:
    rows = db.table("otp_code").select("id").eq("phone", phone).gte("created_at", since.isoformat()).execute().data
    return len(rows)


def update_otp(db: Client, otp_id: uuid.UUID, **fields) -> None:
    db.table("otp_code").update(fields).eq("id", str(otp_id)).execute()


def create_notification_log(
    db: Client,
    *,
    appointment_id: uuid.UUID,
    type: NotificationType,
    status: NotificationStatus,
    provider_message_id: str | None = None,
    error: str | None = None,
    channel: str = "whatsapp",
) -> None:
    row = {"appointment_id": str(appointment_id), "channel": channel, "type": type.value, "status": status.value}
    # Solo se envían si tienen valor: así el insert funciona aunque falte la migración que las agrega
    if provider_message_id:
        row["provider_message_id"] = provider_message_id
    if error:
        row["error"] = error
    db.table("notification_log").insert(row).execute()


def appointment_ids_with_notification(
    db: Client, appointment_ids: list[uuid.UUID], type: NotificationType, status: NotificationStatus
) -> set[uuid.UUID]:
    """De las citas indicadas, las que ya tienen una notificación de ese tipo y estado."""
    if not appointment_ids:
        return set()
    rows = (
        db.table("notification_log")
        .select("appointment_id")
        .in_("appointment_id", [str(i) for i in appointment_ids])
        .eq("type", type.value)
        .eq("status", status.value)
        .execute()
        .data
    )
    return {uuid.UUID(row["appointment_id"]) for row in rows}
