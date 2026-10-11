"""Envío de mensajes y lectura de webhooks de WhatsApp Cloud API (Meta)."""

import hashlib
import hmac
import logging
import uuid
from dataclasses import dataclass
from enum import StrEnum
from zoneinfo import ZoneInfo

import httpx

from app.core.config import settings
from app.models import Appointment, AppointmentType

logger = logging.getLogger(__name__)

GRAPH_URL = "https://graph.facebook.com"


class WhatsAppNotConfiguredError(RuntimeError):
    """Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID."""


class WhatsAppSendError(RuntimeError):
    """Meta rechazó el mensaje (número inválido, plantilla no aprobada, token vencido, ...)."""


class ReplyAction(StrEnum):
    CONFIRM = "CONFIRM"
    CANCEL = "CANCEL"


@dataclass(frozen=True)
class ButtonReply:
    message_id: str
    from_phone: str
    action: ReplyAction
    appointment_id: uuid.UUID


def is_configured() -> bool:
    return bool(settings.WHATSAPP_ACCESS_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID)


def _send(to: str, message: dict) -> str:
    """Envía un mensaje y devuelve su ID (wamid)."""
    if not is_configured():
        raise WhatsAppNotConfiguredError("Configura WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID")
    url = f"{GRAPH_URL}/{settings.WHATSAPP_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    try:
        response = httpx.post(
            url,
            headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"},
            json={"messaging_product": "whatsapp", "recipient_type": "individual", "to": to, **message},
            timeout=15,
        )
    except httpx.HTTPError as exc:
        raise WhatsAppSendError(f"No se pudo conectar con WhatsApp: {exc}") from exc
    if response.is_error:
        error = response.json().get("error", {}) if response.headers.get("content-type", "").startswith("application/json") else {}
        raise WhatsAppSendError(f"{response.status_code}: {error.get('message', response.text[:300])}")
    return response.json()["messages"][0]["id"]


def send_text(to: str, body: str) -> str:
    """Texto libre. Meta solo lo permite dentro de las 24 h siguientes al último mensaje del paciente."""
    return _send(to, {"type": "text", "text": {"body": body, "preview_url": False}})


def _first_name(appointment: Appointment) -> str:
    return appointment.patient.full_name.split()[0] if appointment.patient else ""


def _local_time(appointment: Appointment) -> str:
    local = appointment.start_time.astimezone(ZoneInfo(settings.TIMEZONE))
    return local.strftime("%I:%M %p").lstrip("0")


def send_same_day_reminder(appointment: Appointment, psychologist_name: str) -> str:
    """Envía la plantilla de recordatorio con los botones "Confirmar" y "Cancelar".

    La plantilla debe existir y estar aprobada en Meta (ver backend/README.md). Cada botón lleva
    como payload la acción y el ID de la cita, que el webhook recibe al pulsarlo.
    """
    if appointment.patient is None:
        raise ValueError("La cita debe incluir los datos del paciente")
    mode = "en línea" if appointment.type == AppointmentType.ONLINE else "presencial"
    body_params = [_first_name(appointment), mode, _local_time(appointment), psychologist_name]
    components = [
        {"type": "body", "parameters": [{"type": "text", "text": value} for value in body_params]},
        *(
            {
                "type": "button",
                "sub_type": "quick_reply",
                "index": str(index),
                "parameters": [{"type": "payload", "payload": f"{action.value}:{appointment.id}"}],
            }
            for index, action in enumerate([ReplyAction.CONFIRM, ReplyAction.CANCEL])
        ),
    ]
    return _send(
        appointment.patient.phone,
        {
            "type": "template",
            "template": {
                "name": settings.WHATSAPP_REMINDER_TEMPLATE,
                "language": {"code": settings.WHATSAPP_TEMPLATE_LANGUAGE},
                "components": components,
            },
        },
    )


def send_confirmation_ack(appointment: Appointment) -> str:
    return send_text(
        appointment.patient.phone,
        f"¡Gracias, {_first_name(appointment)}! Tu cita de hoy a las {_local_time(appointment)} quedó "
        "confirmada. Te esperamos.",
    )


def send_cancellation_notice(appointment: Appointment) -> str:
    return send_text(
        appointment.patient.phone,
        f"{_first_name(appointment)}, tu cita de hoy a las {_local_time(appointment)} quedó cancelada "
        "y el horario se liberó. Si quieres reagendar, con gusto te ayudamos.",
    )


# --- Webhook ---


def verify_signature(raw_body: bytes, signature_header: str | None) -> bool:
    """Valida X-Hub-Signature-256: HMAC-SHA256 del cuerpo con el App Secret de Meta."""
    if not settings.WHATSAPP_APP_SECRET or not signature_header:
        return False
    expected = "sha256=" + hmac.new(settings.WHATSAPP_APP_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def _parse_payload(payload: str | None) -> tuple[ReplyAction, uuid.UUID] | None:
    action, _, appointment_id = (payload or "").partition(":")
    try:
        return ReplyAction(action), uuid.UUID(appointment_id)
    except ValueError:
        return None


def parse_button_replies(body: dict) -> list[ButtonReply]:
    """Extrae los botones pulsados. Ignora estados de entrega y mensajes de otro tipo."""
    replies: list[ButtonReply] = []
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            for message in change.get("value", {}).get("messages", []):
                if message.get("type") == "button":  # quick reply de una plantilla
                    payload = message.get("button", {}).get("payload")
                elif message.get("type") == "interactive":  # botones de un mensaje interactivo
                    payload = message.get("interactive", {}).get("button_reply", {}).get("id")
                else:
                    continue
                parsed = _parse_payload(payload)
                if parsed is None:
                    logger.warning("Botón de WhatsApp con payload desconocido: %r", payload)
                    continue
                replies.append(ButtonReply(message["id"], message["from"], *parsed))
    return replies


def _canonical_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    # WhatsApp reporta los celulares de México como 521XXXXXXXXXX aunque se registren como 52XXXXXXXXXX
    if digits.startswith("521") and len(digits) == 13:
        return "52" + digits[3:]
    return digits


def same_phone(a: str, b: str) -> bool:
    return _canonical_phone(a) == _canonical_phone(b)
