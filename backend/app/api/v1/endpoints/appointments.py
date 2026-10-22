"""Portal del paciente: disponibilidad y reserva segura.

Flujo de reserva:
1. POST /appointments/book   -> captcha + límites; aparta el horario (status=hold) por
   HOLD_MINUTES y envía un código por WhatsApp.
2. POST /appointments/verify-otp -> si el código es correcto crea el evento en Google Calendar
   y la cita pasa a pending. Tras OTP_MAX_ATTEMPTS errores se libera el horario.
   POST /appointments/resend-otp  -> otro código (con espera y límite por hora).
"""

import logging
import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Request, status
from postgrest.exceptions import APIError
from supabase import Client

from app import crud
from app.api.deps import DbDep, calendar_errors, find_psychologist
from app.core.config import settings
from app.core.rate_limit import limiter
from app.models import Appointment, AppointmentStatus, Psychologist
from app.schemas.appointment import (
    AppointmentRead,
    BookAppointmentRequest,
    HoldResponse,
    ResendOtpRequest,
    VerifyOtpRequest,
)
from app.schemas.availability import AvailabilityResponse, BlockedDaysResponse, Slot
from app.services import otp, whatsapp
from app.services.availability import get_available_slots
from app.services.google_calendar import CalendarEventData, TimeSlot, create_calendar_event
from app.services.security import CaptchaError, CaptchaUnavailableError, verify_turnstile

logger = logging.getLogger(__name__)

router = APIRouter()

SLOT_UNAVAILABLE = "El horario solicitado no está disponible"
HOLD_GONE = "Tu reserva expiró o ya no existe. Elige tu horario de nuevo."
DAY_BLOCKED = "El consultorio no atenderá ese día."
# Días que puede abarcar una consulta de días bloqueados (el portal pide su ventana de reserva)
MAX_BLOCKED_DAYS_RANGE = 120


def _now() -> datetime:
    return datetime.now(UTC)


def _db_busy(db: Client, day: date) -> list[TimeSlot]:
    """Citas activas y holds vigentes del día, que todavía no estén en Google Calendar."""
    crud.delete_expired_holds(db, _now())
    day_start = datetime.combine(day, time.min, tzinfo=ZoneInfo(settings.TIMEZONE))
    return [TimeSlot(s, e) for s, e in crud.list_busy_intervals(db, day_start, day_start + timedelta(days=1))]


def _free_slots(db: Client, day: date, calendar_id: str | None, slot_minutes: int) -> list[TimeSlot]:
    with calendar_errors():
        return get_available_slots(day, calendar_id, slot_minutes, _db_busy(db, day))


@router.get("/availability", response_model=AvailabilityResponse, tags=["availability"])
def get_availability(
    db: DbDep,
    day: Annotated[date, Query(alias="date", description="Día a consultar (YYYY-MM-DD)")],
    psychologist_id: uuid.UUID | None = None,
) -> AvailabilityResponse:
    psychologist = find_psychologist(db, psychologist_id)
    # Sin psicólogos registrados se usan los valores del .env
    calendar_id = psychologist.google_calendar_id if psychologist else None
    slot_minutes = (
        psychologist.slot_duration_minutes if psychologist else settings.SLOT_DURATION_MINUTES
    )
    blocked = _is_blocked(db, psychologist, day)
    free = [] if blocked else _free_slots(db, day, calendar_id, slot_minutes)
    return AvailabilityResponse(
        date=day,
        timezone=settings.TIMEZONE,
        slot_duration_minutes=slot_minutes,
        slots=[Slot(start=s.start, end=s.end) for s in free],
        blocked=blocked,
    )


@router.get("/availability/blocked-days", response_model=BlockedDaysResponse, tags=["availability"])
def get_blocked_days(
    db: DbDep,
    start: Annotated[date, Query(alias="from", description="Primer día (YYYY-MM-DD)")],
    end: Annotated[date, Query(alias="to", description="Último día, inclusive")],
    psychologist_id: uuid.UUID | None = None,
) -> BlockedDaysResponse:
    """Días no laborales del rango, para deshabilitarlos en el calendario del portal."""
    if end < start or (end - start).days > MAX_BLOCKED_DAYS_RANGE:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"El rango debe ser de 0 a {MAX_BLOCKED_DAYS_RANGE} días"
        )
    psychologist = find_psychologist(db, psychologist_id)
    if psychologist is None:
        return BlockedDaysResponse(dates=[])
    return BlockedDaysResponse(dates=[b.day for b in crud.list_blocked_days(db, psychologist.id, start, end)])


def _is_blocked(db: Client, psychologist: Psychologist | None, day: date) -> bool:
    return psychologist is not None and crud.get_blocked_day(db, psychologist.id, day) is not None


def _issue_otp(db: Client, appointment_id: uuid.UUID, phone: str) -> datetime:
    """Genera, guarda (como HMAC) y envía un código. Devuelve cuándo expira."""
    code = otp.generate_code()
    try:
        code_hash = otp.hash_code(appointment_id, code)
    except otp.OtpNotConfiguredError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    expires_at = _now() + timedelta(minutes=settings.OTP_TTL_MINUTES)
    crud.create_otp(db, appointment_id=appointment_id, phone=phone, code_hash=code_hash, expires_at=expires_at)
    try:
        whatsapp.send_verification_code(phone, code)
    except (whatsapp.WhatsAppSendError, whatsapp.WhatsAppNotConfiguredError) as exc:
        if not settings.is_development:
            logger.error("No se pudo enviar el OTP de la cita %s: %s", appointment_id, exc)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "No pudimos enviarte el código por WhatsApp. Revisa tu número e inténtalo de nuevo.",
            ) from exc
        # Solo en desarrollo (ENVIRONMENT=development): mientras la plantilla de Meta no esté
        # aprobada, el código se muestra en la consola del backend para poder probar el flujo.
        logger.warning("[DESARROLLO] OTP no enviado por WhatsApp (%s). Código para %s: %s", exc, phone, code)
    return expires_at


def _check_otp_hourly_limit(db: Client, phone: str) -> None:
    if crud.count_otps_for_phone_since(db, phone, _now() - timedelta(hours=1)) >= settings.OTP_MAX_PER_PHONE_PER_HOUR:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Ya enviamos varios códigos a este número. Inténtalo de nuevo en una hora.",
        )


def _hold_response(appointment: Appointment, phone: str, otp_expires_at: datetime) -> HoldResponse:
    return HoldResponse(
        appointment_id=appointment.id,
        hold_expires_at=appointment.hold_expires_at,
        otp_expires_at=otp_expires_at,
        resend_available_at=_now() + timedelta(seconds=settings.OTP_RESEND_SECONDS),
        phone_hint=f"•••• {phone[-4:]}",
    )


def _require_psychologist(db: Client, psychologist_id: uuid.UUID | None) -> Psychologist:
    psychologist = find_psychologist(db, psychologist_id)
    if psychologist is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No hay psicólogo registrado (define PSYCHOLOGIST_NAME y PSYCHOLOGIST_EMAIL en el .env)",
        )
    return psychologist


@router.post(
    "/appointments/book",
    response_model=HoldResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["appointments"],
)
@limiter.limit(settings.BOOKING_RATE_LIMIT)
def book_appointment(request: Request, db: DbDep, data: BookAppointmentRequest) -> HoldResponse:
    # 1. Anti-bots
    try:
        verify_turnstile(data.captcha_token, request.client.host if request.client else None)
    except CaptchaError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except CaptchaUnavailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No se pudo verificar el captcha") from exc

    psychologist = _require_psychologist(db, data.psychologist_id)
    now = _now()
    crud.delete_expired_holds(db, now)

    # 2. Límites por teléfono
    patient = crud.get_patient_by_phone(db, data.phone)
    if patient is not None:
        # Si abandonó una verificación y vuelve a intentar, su apartado anterior no le estorba
        crud.delete_holds_for_patient(db, patient.id)
        if crud.count_active_appointments(db, patient.id, now) >= settings.MAX_ACTIVE_APPOINTMENTS_PER_PHONE:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Este número ya tiene {settings.MAX_ACTIVE_APPOINTMENTS_PER_PHONE} citas activas. "
                "Para agendar otra, cancela o espera a que pase alguna.",
            )
    _check_otp_hourly_limit(db, data.phone)

    # 3. El horario debe estar libre en Google Calendar y en la base (incluidos otros holds)
    start_time = data.start_time
    end_time = start_time + timedelta(minutes=psychologist.slot_duration_minutes)
    local_day = start_time.astimezone(ZoneInfo(settings.TIMEZONE)).date()
    if _is_blocked(db, psychologist, local_day):
        raise HTTPException(status.HTTP_409_CONFLICT, DAY_BLOCKED)
    free = _free_slots(db, local_day, psychologist.google_calendar_id, psychologist.slot_duration_minutes)
    if not any(slot.start == start_time for slot in free):
        raise HTTPException(status.HTTP_409_CONFLICT, SLOT_UNAVAILABLE)

    if patient is None:
        patient = crud.create_patient(db, full_name=data.patient_name, phone=data.phone, email=data.email)
    elif data.email and not patient.email:
        patient = crud.update_patient(db, patient.id, email=data.email)

    try:
        hold = crud.create_appointment(
            db,
            psychologist_id=psychologist.id,
            patient_id=patient.id,
            start_time=start_time,
            end_time=end_time,
            type=data.type,
            notes=data.notes,
            status=AppointmentStatus.HOLD,
            hold_expires_at=now + timedelta(minutes=settings.HOLD_MINUTES),
        )
    except APIError as exc:
        # Otra persona apartó el mismo horario entre la verificación y el insert
        if exc.code == crud.OVERLAP_VIOLATION:
            raise HTTPException(status.HTTP_409_CONFLICT, SLOT_UNAVAILABLE) from exc
        raise

    # 4. Código de verificación por WhatsApp
    try:
        otp_expires_at = _issue_otp(db, hold.id, patient.phone)
    except HTTPException:
        crud.delete_appointment(db, hold.id)  # sin código no hay forma de verificar: se libera
        raise
    return _hold_response(hold, patient.phone, otp_expires_at)


def _get_active_hold(db: Client, appointment_id: uuid.UUID) -> Appointment:
    appointment = crud.get_appointment(db, appointment_id)
    if appointment is None or appointment.status != AppointmentStatus.HOLD:
        raise HTTPException(status.HTTP_410_GONE, HOLD_GONE)
    if appointment.hold_expires_at is None or appointment.hold_expires_at <= _now():
        crud.delete_appointment(db, appointment.id)
        raise HTTPException(status.HTTP_410_GONE, HOLD_GONE)
    return appointment


@router.post("/appointments/verify-otp", response_model=AppointmentRead, tags=["appointments"])
@limiter.limit(settings.VERIFY_RATE_LIMIT)
def verify_otp(request: Request, db: DbDep, data: VerifyOtpRequest) -> Appointment:
    existing = crud.get_appointment(db, data.appointment_id)
    if existing is not None and existing.status in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED):
        # Doble envío del mismo formulario: la cita ya quedó verificada
        return existing
    appointment = _get_active_hold(db, data.appointment_id)

    code = crud.latest_otp(db, appointment.id)
    if code is None or code.consumed_at is not None:
        raise HTTPException(status.HTTP_410_GONE, HOLD_GONE)
    if code.expires_at <= _now():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El código expiró. Pide uno nuevo.")

    if not otp.matches(appointment.id, data.code, code.code_hash):
        attempts = code.attempts + 1
        crud.update_otp(db, code.id, attempts=attempts)
        remaining = settings.OTP_MAX_ATTEMPTS - attempts
        if remaining <= 0:
            crud.delete_appointment(db, appointment.id)
            raise HTTPException(
                status.HTTP_410_GONE, "Código incorrecto. Agotaste los intentos; elige tu horario de nuevo."
            )
        left = "Te queda 1 intento" if remaining == 1 else f"Te quedan {remaining} intentos"
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Código incorrecto. {left}.")

    # 5. Teléfono verificado: la cita entra a la agenda real (salvo que el día se haya bloqueado
    # mientras el paciente escribía el código)
    psychologist = crud.get_psychologist(db, appointment.psychologist_id)
    local_day = appointment.start_time.astimezone(ZoneInfo(settings.TIMEZONE)).date()
    if _is_blocked(db, psychologist, local_day):
        crud.delete_appointment(db, appointment.id)
        raise HTTPException(status.HTTP_410_GONE, f"{DAY_BLOCKED} Elige otra fecha.")
    patient = appointment.patient
    with calendar_errors():  # si Google falla, el hold sigue vigente y se puede reintentar
        event = create_calendar_event(
            CalendarEventData(
                patient_name=patient.full_name,
                patient_phone=patient.phone,
                patient_email=patient.email,
                start_time=appointment.start_time,
                end_time=appointment.end_time,
                type=appointment.type,
                notes=appointment.notes,
                calendar_id=psychologist.google_calendar_id if psychologist else None,
            )
        )
    crud.update_appointment(
        db,
        appointment.id,
        status=AppointmentStatus.PENDING.value,
        hold_expires_at=None,
        google_event_id=event.google_event_id,
        meeting_link=event.meeting_link,
    )
    crud.update_otp(db, code.id, consumed_at=_now().isoformat())
    return crud.get_appointment(db, appointment.id)


@router.post("/appointments/resend-otp", response_model=HoldResponse, tags=["appointments"])
@limiter.limit(settings.VERIFY_RATE_LIMIT)
def resend_otp(request: Request, db: DbDep, data: ResendOtpRequest) -> HoldResponse:
    appointment = _get_active_hold(db, data.appointment_id)
    phone = appointment.patient.phone
    last = crud.latest_otp(db, appointment.id)
    if last is not None:
        wait = (last.created_at + timedelta(seconds=settings.OTP_RESEND_SECONDS) - _now()).total_seconds()
        if wait > 0:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS, f"Espera {int(wait) + 1} segundos para pedir otro código."
            )
    _check_otp_hourly_limit(db, phone)
    otp_expires_at = _issue_otp(db, appointment.id, phone)
    return _hold_response(appointment, phone, otp_expires_at)
