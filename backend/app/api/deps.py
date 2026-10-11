import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from googleapiclient.errors import HttpError
from supabase import Client

from app import crud
from app.core.config import settings
from app.core.database import get_db
from app.core.security import AuthUnavailableError, InvalidTokenError, verify_access_token
from app.models import Psychologist
from app.services.google_calendar import CalendarNotConfiguredError, CalendarQueryError

DbDep = Annotated[Client, Depends(get_db)]


def require_admin(db: DbDep, authorization: Annotated[str | None, Header()] = None) -> str:
    """Exige "Authorization: Bearer <access token de Supabase Auth>" de un usuario autorizado.

    Autenticación: el JWT debe estar firmado por Supabase Auth y vigente.
    Autorización: cualquiera puede registrarse en Supabase Auth, así que además el email debe ser
    el de un psicólogo registrado o estar en ADMIN_EMAILS. Devuelve el email del usuario.
    """
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Inicia sesión para continuar", headers={"WWW-Authenticate": "Bearer"}
        )
    try:
        claims = verify_access_token(token)
    except AuthUnavailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No se pudo verificar la sesión") from exc
    except InvalidTokenError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Sesión inválida o expirada", headers={"WWW-Authenticate": "Bearer"}
        ) from exc

    email = (claims.get("email") or "").lower()
    allowed = settings.admin_emails | {p.email.lower() for p in crud.list_psychologists(db, limit=100)}
    if claims.get("role") != "authenticated" or not email or email not in allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Esta cuenta no tiene acceso al panel")
    return email


AdminEmail = Annotated[str, Depends(require_admin)]


@contextmanager
def calendar_errors() -> Iterator[None]:
    """Traduce los errores de Google Calendar a respuestas HTTP."""
    try:
        yield
    except CalendarNotConfiguredError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except (HttpError, CalendarQueryError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Google Calendar: {exc}") from exc


def find_psychologist(db: Client, psychologist_id: uuid.UUID | None) -> Psychologist | None:
    """Devuelve el psicólogo indicado o, si no se indica, el único registrado (None si no hay)."""
    if psychologist_id is not None:
        psychologist = crud.get_psychologist(db, psychologist_id)
        if psychologist is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Psicólogo no encontrado")
        return psychologist
    psychologists = crud.list_psychologists(db, limit=2)
    if len(psychologists) > 1:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Hay varios psicólogos: indica psychologist_id"
        )
    return psychologists[0] if psychologists else None
