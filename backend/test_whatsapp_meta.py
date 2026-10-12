"""Prueba manual (temporal) de envío por WhatsApp Cloud API.

Uso, desde backend/:
    uv run python test_whatsapp_meta.py [telefono]      # por defecto 529821162306

1. Verifica que WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID sean válidos.
2. Envía la plantilla de recordatorio (WHATSAPP_REMINDER_TEMPLATE) con una cita ficticia.
3. Si Meta rechaza esa plantilla (p. ej. aún no aprobada), envía "hello_world", la plantilla
   de prueba que Meta incluye en toda cuenta, para confirmar que las credenciales funcionan.

No toca la base de datos: los botones de este mensaje apuntan a una cita que no existe,
así que si se pulsan el webhook simplemente los ignora.
"""

import sys
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

from app.core.config import settings
from app.models import Appointment, Patient
from app.services import whatsapp

DEFAULT_PHONE = "529821162306"


def check_credentials() -> bool:
    url = f"{whatsapp.GRAPH_URL}/{settings.WHATSAPP_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}"
    response = httpx.get(
        url,
        params={"fields": "display_phone_number,verified_name,quality_rating"},
        headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"},
        timeout=15,
    )
    if response.is_error:
        print(f"[X] Credenciales rechazadas ({response.status_code}): {response.json().get('error', {}).get('message')}")
        return False
    data = response.json()
    print(f"[OK] Credenciales válidas. Número emisor: {data.get('display_phone_number')} ({data.get('verified_name')})")
    return True


def fake_appointment(phone: str) -> Appointment:
    tz = ZoneInfo(settings.TIMEZONE)
    start = (datetime.now(tz) + timedelta(hours=2)).replace(minute=0, second=0, microsecond=0)
    now = datetime.now(tz)
    return Appointment(
        id=uuid.uuid4(),
        psychologist_id=uuid.uuid4(),
        patient_id=uuid.uuid4(),
        start_time=start,
        end_time=start + timedelta(minutes=50),
        type="presencial",
        status="pending",
        created_at=now,
        updated_at=now,
        patient=Patient(id=uuid.uuid4(), full_name="Paciente Prueba", phone=phone, created_at=now, updated_at=now),
    )


def main() -> int:
    phone = "".join(ch for ch in (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PHONE) if ch.isdigit())
    if not whatsapp.is_configured():
        print("[X] Falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en backend/.env")
        return 1
    if not check_credentials():
        return 1

    print(f"-> Enviando plantilla '{settings.WHATSAPP_REMINDER_TEMPLATE}' ({settings.WHATSAPP_TEMPLATE_LANGUAGE}) a {phone}...")
    try:
        message_id = whatsapp.send_same_day_reminder(fake_appointment(phone), "Lic. Jorge Castro")
        print(f"[OK] Recordatorio aceptado por Meta. wamid: {message_id}")
        return 0
    except whatsapp.WhatsAppSendError as exc:
        print(f"[X] Meta rechazó el recordatorio: {exc}")

    print("-> Probando con la plantilla 'hello_world' (en_US) para validar las credenciales...")
    try:
        message_id = whatsapp._send(  # noqa: SLF001 - script de prueba
            phone, {"type": "template", "template": {"name": "hello_world", "language": {"code": "en_US"}}}
        )
        print(f"[OK] hello_world aceptado por Meta. wamid: {message_id}")
        print("   Las credenciales funcionan; falta crear/aprobar la plantilla del recordatorio (ver README).")
    except whatsapp.WhatsAppSendError as exc:
        print(f"[X] También falló hello_world: {exc}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
