"""Códigos de verificación (OTP) de un solo uso para confirmar el teléfono del paciente."""

import hashlib
import hmac
import secrets
import uuid

from app.core.config import settings


class OtpNotConfiguredError(RuntimeError):
    """Falta OTP_SECRET en el .env."""


def generate_code() -> str:
    """Código numérico criptográficamente aleatorio, p. ej. "849201"."""
    return "".join(secrets.choice("0123456789") for _ in range(settings.OTP_LENGTH))


def hash_code(appointment_id: uuid.UUID, code: str) -> str:
    """HMAC-SHA256 del código ligado a la cita.

    Con un hash simple, un código de 6 dígitos (1 millón de combinaciones) se recupera al instante
    si la tabla se filtra; con HMAC hace falta además OTP_SECRET, que vive solo en el servidor.
    """
    if not settings.OTP_SECRET:
        raise OtpNotConfiguredError("Configura OTP_SECRET en el .env del backend")
    message = f"{appointment_id}:{code}".encode()
    return hmac.new(settings.OTP_SECRET.encode(), message, hashlib.sha256).hexdigest()


def matches(appointment_id: uuid.UUID, code: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_code(appointment_id, code), code_hash)
