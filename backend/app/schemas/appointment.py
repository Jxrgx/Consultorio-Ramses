import re
import uuid
from datetime import datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.core.config import settings
from app.models.enums import AppointmentStatus, AppointmentType

# Mismas reglas que frontend/src/utils/validation.ts. À-ÖØ-öø-ÿ son las letras latinas con acento,
# ü y ñ (excluye × y ÷).
LETTERS = "A-Za-zÀ-ÖØ-öø-ÿ"
NAME_RE = re.compile(rf"[{LETTERS}. ]+")
PHONE_RE = re.compile(r"\d{10,13}")
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
NOTES_RE = re.compile(rf"[{LETTERS}0-9\s.,?!¿¡]*")

NAME_MAX = 100
EMAIL_MAX = 254
NOTES_MAX = 250


def _collapse_spaces(value: str) -> str:
    return re.sub(r"[ \t]+", " ", value).strip()


class BookAppointmentRequest(BaseModel):
    patient_name: str
    # Solo dígitos, 10 a 13. Los de 10 dígitos se guardan con el código de país por defecto
    phone: str
    email: str | None = None
    start_time: AwareDatetime
    type: AppointmentType
    notes: str | None = None
    # Opcional si solo hay un psicólogo registrado
    psychologist_id: uuid.UUID | None = None
    # Token de Cloudflare Turnstile (obligatorio si el backend tiene TURNSTILE_SECRET_KEY)
    captcha_token: str | None = Field(default=None, max_length=2048)

    @field_validator("patient_name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        value = _collapse_spaces(value)
        if len(value) > NAME_MAX:
            raise ValueError(f"El nombre admite máximo {NAME_MAX} caracteres")
        if not NAME_RE.fullmatch(value) or len(re.findall(rf"[{LETTERS}]", value)) < 3:
            raise ValueError("El nombre solo puede contener letras, espacios y puntos")
        return value

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, value: str) -> str:
        value = value.strip()
        if not PHONE_RE.fullmatch(value):
            raise ValueError("El teléfono debe tener solo números, entre 10 y 13 dígitos")
        # Mismo número con o sin código de país = mismo paciente (y wa.me necesita el código)
        return settings.DEFAULT_COUNTRY_CODE + value if len(value) == 10 else value

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str | None) -> str | None:
        value = (value or "").strip().lower()
        if not value:
            return None
        if len(value) > EMAIL_MAX or not EMAIL_RE.fullmatch(value):
            raise ValueError("El correo no tiene un formato válido (usuario@dominio.com)")
        return value

    @field_validator("notes")
    @classmethod
    def _validate_notes(cls, value: str | None) -> str | None:
        value = (value or "").strip()
        if not value:
            return None
        if len(value) > NOTES_MAX:
            raise ValueError(f"El motivo admite máximo {NOTES_MAX} caracteres")
        if not NOTES_RE.fullmatch(value):
            raise ValueError("El motivo solo puede contener letras, números y . , ? ! ¿ ¡")
        return value


class PatientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    phone: str
    email: str | None


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    psychologist_id: uuid.UUID
    patient: PatientRead
    start_time: datetime
    end_time: datetime
    type: AppointmentType
    status: AppointmentStatus
    google_event_id: str | None
    meeting_link: str | None
    notes: str | None
    created_at: datetime


class HoldResponse(BaseModel):
    """Horario apartado: falta verificar el teléfono con el código enviado por WhatsApp."""

    appointment_id: uuid.UUID
    hold_expires_at: datetime
    otp_expires_at: datetime
    # Cuándo se puede pedir otro código
    resend_available_at: datetime
    # Últimos dígitos del teléfono, para mostrar "enviamos un código a •••• 2306"
    phone_hint: str


class VerifyOtpRequest(BaseModel):
    appointment_id: uuid.UUID
    code: str = Field(pattern=r"^\d{4,8}$")


class ResendOtpRequest(BaseModel):
    appointment_id: uuid.UUID
