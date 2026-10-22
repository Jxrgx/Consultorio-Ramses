"""Protección anti-bots del portal público: validación de Cloudflare Turnstile."""

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


class CaptchaError(Exception):
    """El token de Turnstile falta, es inválido o ya se usó."""


class CaptchaUnavailableError(Exception):
    """No se pudo contactar a Cloudflare para validar el token."""


def captcha_required() -> bool:
    return bool(settings.TURNSTILE_SECRET_KEY)


def verify_turnstile(token: str | None, remote_ip: str | None) -> None:
    """Valida el token contra Cloudflare. Sin TURNSTILE_SECRET_KEY no se exige (desarrollo).

    Cada token sirve una sola vez y caduca a los 5 minutos: el frontend debe pedir uno nuevo
    en cada envío.
    """
    if not captcha_required():
        return
    if not token:
        raise CaptchaError("Falta completar la verificación anti-bots")
    data = {"secret": settings.TURNSTILE_SECRET_KEY, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        response = httpx.post(SITEVERIFY_URL, data=data, timeout=10)
        result = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise CaptchaUnavailableError(str(exc)) from exc
    if not result.get("success"):
        logger.info("Turnstile rechazó un token: %s", result.get("error-codes"))
        raise CaptchaError("No pudimos verificar que no eres un robot. Inténtalo de nuevo.")
