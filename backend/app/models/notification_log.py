import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import NotificationStatus, NotificationType


class NotificationLog(BaseModel):
    """Fila de la tabla notification_log (ver supabase/migrations)."""

    id: uuid.UUID
    appointment_id: uuid.UUID
    # Canal de envío: "whatsapp" (por defecto) o "email"
    channel: str = "whatsapp"
    type: NotificationType
    status: NotificationStatus
    sent_at: datetime
    # ID del mensaje en WhatsApp (wamid)
    provider_message_id: str | None = None
    # Motivo del fallo cuando status = failed
    error: str | None = None
