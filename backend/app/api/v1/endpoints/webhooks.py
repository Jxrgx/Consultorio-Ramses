import json
import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import PlainTextResponse
from supabase import Client

from app import crud
from app.api.deps import DbDep
from app.core.config import settings
from app.models import AppointmentStatus, NotificationType
from app.services import whatsapp
from app.services.appointments import cancel_appointment, confirm_appointment, send_whatsapp_and_log

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("/whatsapp", response_class=PlainTextResponse)
def verify_whatsapp_webhook(
    mode: Annotated[str | None, Query(alias="hub.mode")] = None,
    verify_token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
    challenge: Annotated[str | None, Query(alias="hub.challenge")] = None,
) -> str:
    """Handshake de Meta al registrar el webhook: devuelve hub.challenge si el token coincide."""
    if not settings.WHATSAPP_VERIFY_TOKEN:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "WHATSAPP_VERIFY_TOKEN no está configurado")
    if mode != "subscribe" or not secrets.compare_digest(
        (verify_token or "").encode(), settings.WHATSAPP_VERIFY_TOKEN.encode()
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token de verificación inválido")
    return challenge or ""


@router.post("/whatsapp")
async def receive_whatsapp_webhook(
    request: Request,
    db: DbDep,
    x_hub_signature_256: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    """Respuestas de los pacientes a los botones del recordatorio.

    Solo se aceptan peticiones firmadas por Meta con el App Secret. Si algo falla al procesar se
    responde 500 y Meta reintenta; procesar la misma respuesta dos veces no tiene efecto extra.
    """
    if not settings.WHATSAPP_APP_SECRET:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "WHATSAPP_APP_SECRET no está configurado")
    raw_body = await request.body()
    if not whatsapp.verify_signature(raw_body, x_hub_signature_256):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Firma inválida")
    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "JSON inválido") from exc

    for reply in whatsapp.parse_button_replies(body):
        await run_in_threadpool(_handle_reply, db, reply)
    return {"status": "ok"}


def _handle_reply(db: Client, reply: whatsapp.ButtonReply) -> None:
    appointment = crud.get_appointment(db, reply.appointment_id)
    if appointment is None or appointment.patient is None:
        logger.warning("Respuesta de WhatsApp para una cita inexistente: %s", reply.appointment_id)
        return
    if not whatsapp.same_phone(appointment.patient.phone, reply.from_phone):
        # El payload trae el ID de la cita: solo su paciente puede confirmarla o cancelarla
        logger.warning("Respuesta para la cita %s desde un número que no es el del paciente", appointment.id)
        return

    if reply.action == whatsapp.ReplyAction.CONFIRM:
        # Idempotente: un reintento de Meta o un segundo toque no repite nada
        if appointment.status != AppointmentStatus.PENDING:
            logger.info("Cita %s ya estaba %s; se ignora Confirmar", appointment.id, appointment.status.value)
            return
        confirm_appointment(db, appointment)
        send_whatsapp_and_log(db, appointment, NotificationType.CONFIRMATION, whatsapp.send_confirmation_ack)
    else:
        if appointment.status not in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED):
            logger.info("Cita %s ya estaba %s; se ignora Cancelar", appointment.id, appointment.status.value)
            return
        cancel_appointment(db, appointment)
        send_whatsapp_and_log(
            db, appointment, NotificationType.CANCELLATION_NOTICE, whatsapp.send_cancellation_notice
        )
