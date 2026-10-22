import uuid
from datetime import datetime

from pydantic import BaseModel


class OtpCode(BaseModel):
    """Fila de la tabla otp_code: código de verificación enviado por WhatsApp (solo su HMAC)."""

    id: uuid.UUID
    appointment_id: uuid.UUID
    phone: str
    code_hash: str
    attempts: int = 0
    created_at: datetime
    expires_at: datetime
    consumed_at: datetime | None = None
