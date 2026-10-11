import logging
import uuid
from datetime import date, datetime, time, timedelta
from typing import NamedTuple
from zoneinfo import ZoneInfo

from google.oauth2 import service_account
from google.oauth2.credentials import Credentials as OAuthCredentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pydantic import BaseModel

from app.core.config import settings
from app.models.enums import AppointmentType

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar"]


class CalendarNotConfiguredError(RuntimeError):
    """No hay credenciales de Google configuradas."""


class CalendarQueryError(RuntimeError):
    """Google Calendar respondió, pero con errores para el calendario consultado."""


class TimeSlot(NamedTuple):
    start: datetime
    end: datetime


class CalendarEventData(BaseModel):
    patient_name: str
    start_time: datetime
    end_time: datetime
    type: AppointmentType
    patient_phone: str | None = None
    patient_email: str | None = None
    notes: str | None = None
    calendar_id: str | None = None


class CreatedEvent(NamedTuple):
    google_event_id: str
    meeting_link: str | None


def _get_credentials():
    # El token OAuth2, si existe, tiene prioridad: una Service Account sin delegación de
    # dominio (Google Workspace) no puede crear enlaces de Meet.
    if settings.GOOGLE_OAUTH_TOKEN_FILE:
        return OAuthCredentials.from_authorized_user_file(settings.GOOGLE_OAUTH_TOKEN_FILE, SCOPES)
    if settings.GOOGLE_CREDENTIALS_FILE:
        return service_account.Credentials.from_service_account_file(
            settings.GOOGLE_CREDENTIALS_FILE, scopes=SCOPES
        )
    raise CalendarNotConfiguredError("Configura GOOGLE_CREDENTIALS_FILE en el .env")


def get_calendar_service():
    """Crea un cliente de Google Calendar autenticado con la Service Account (o OAuth2)."""
    return build("calendar", "v3", credentials=_get_credentials(), cache_discovery=False)


def _resolve_calendar_id(calendar_id: str | None) -> str:
    return calendar_id or settings.GOOGLE_CALENDAR_ID


def get_busy_slots(date_str: str, calendar_id: str | None = None) -> list[TimeSlot]:
    """Devuelve los bloques ocupados del calendario durante el día date_str (YYYY-MM-DD),
    en la zona horaria configurada."""
    tz = ZoneInfo(settings.TIMEZONE)
    day_start = datetime.combine(date.fromisoformat(date_str), time.min, tzinfo=tz)
    day_end = day_start + timedelta(days=1)
    calendar_id = _resolve_calendar_id(calendar_id)

    response = (
        get_calendar_service()
        .freebusy()
        .query(
            body={
                "timeMin": day_start.isoformat(),
                "timeMax": day_end.isoformat(),
                "timeZone": settings.TIMEZONE,
                "items": [{"id": calendar_id}],
            }
        )
        .execute()
    )
    calendar = response["calendars"].get(calendar_id, {})
    if calendar.get("errors"):
        raise CalendarQueryError(f"Error consultando {calendar_id}: {calendar['errors']}")
    return [
        TimeSlot(datetime.fromisoformat(b["start"]), datetime.fromisoformat(b["end"]))
        for b in calendar.get("busy", [])
    ]


def _extract_meeting_link(event: dict) -> str | None:
    if event.get("hangoutLink"):
        return event["hangoutLink"]
    for entry in event.get("conferenceData", {}).get("entryPoints", []):
        if entry.get("entryPointType") == "video":
            return entry.get("uri")
    return None


def create_calendar_event(appointment_data: CalendarEventData) -> CreatedEvent:
    """Crea el evento de la cita. Si es online, solicita un enlace de Google Meet."""
    is_online = appointment_data.type == AppointmentType.ONLINE
    description_lines = [
        f"Paciente: {appointment_data.patient_name}",
        f"Teléfono: {appointment_data.patient_phone}" if appointment_data.patient_phone else None,
        f"Email: {appointment_data.patient_email}" if appointment_data.patient_email else None,
        f"Notas: {appointment_data.notes}" if appointment_data.notes else None,
    ]
    body: dict = {
        "summary": f"Sesión {appointment_data.type.value} - {appointment_data.patient_name}",
        "description": "\n".join(line for line in description_lines if line),
        "start": {"dateTime": appointment_data.start_time.isoformat(), "timeZone": settings.TIMEZONE},
        "end": {"dateTime": appointment_data.end_time.isoformat(), "timeZone": settings.TIMEZONE},
    }
    if is_online:
        body["conferenceData"] = {
            "createRequest": {
                "requestId": uuid.uuid4().hex,
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        }

    events = get_calendar_service().events()
    calendar_id = _resolve_calendar_id(appointment_data.calendar_id)
    try:
        # Sin conferenceDataVersion=1 Google ignora conferenceData
        event = events.insert(
            calendarId=calendar_id, body=body, conferenceDataVersion=1 if is_online else 0
        ).execute()
    except HttpError as exc:
        # Una Service Account sin delegación de dominio no puede crear Meet ("Invalid conference
        # type value"). Se crea el evento sin enlace para no perder la cita.
        if not (is_online and exc.status_code == 400 and "conference" in str(exc.reason).lower()):
            raise
        logger.warning("No se pudo crear el enlace de Meet (%s); evento creado sin enlace", exc.reason)
        del body["conferenceData"]
        event = events.insert(calendarId=calendar_id, body=body).execute()
    return CreatedEvent(google_event_id=event["id"], meeting_link=_extract_meeting_link(event))


CONFIRMED_PREFIX = "[CONFIRMADA] "


def mark_event_confirmed(google_event_id: str, calendar_id: str | None = None) -> None:
    """Antepone "[CONFIRMADA]" al título del evento (una sola vez)."""
    events = get_calendar_service().events()
    calendar_id = _resolve_calendar_id(calendar_id)
    event = events.get(calendarId=calendar_id, eventId=google_event_id).execute()
    summary = event.get("summary", "")
    if not summary.startswith(CONFIRMED_PREFIX):
        events.patch(
            calendarId=calendar_id, eventId=google_event_id, body={"summary": CONFIRMED_PREFIX + summary}
        ).execute()


def delete_calendar_event(google_event_id: str, calendar_id: str | None = None) -> None:
    """Borra el evento. Si ya no existe (borrado a mano en Google Calendar) no hace nada."""
    try:
        get_calendar_service().events().delete(
            calendarId=_resolve_calendar_id(calendar_id), eventId=google_event_id
        ).execute()
    except HttpError as exc:
        if exc.status_code not in (404, 410):
            raise
