"""Acceso a las tablas de Supabase. Cada función recibe el cliente para poder sustituirlo en pruebas."""

import uuid
from datetime import datetime

from supabase import Client

from app.models import Appointment, AppointmentStatus, AppointmentType, Patient, Psychologist

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


def create_appointment(
    db: Client,
    *,
    psychologist_id: uuid.UUID,
    patient_id: uuid.UUID,
    start_time: datetime,
    end_time: datetime,
    type: AppointmentType,
    notes: str | None,
) -> Appointment:
    row = {
        "psychologist_id": str(psychologist_id),
        "patient_id": str(patient_id),
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "type": type.value,
        "status": AppointmentStatus.PENDING.value,
        "notes": notes,
    }
    return Appointment.model_validate(db.table("appointment").insert(row).execute().data[0])


def update_appointment(db: Client, appointment_id: uuid.UUID, **fields) -> None:
    db.table("appointment").update(fields).eq("id", str(appointment_id)).execute()


def delete_appointment(db: Client, appointment_id: uuid.UUID) -> None:
    db.table("appointment").delete().eq("id", str(appointment_id)).execute()
