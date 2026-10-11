"""Verificación de los access tokens (JWT) emitidos por Supabase Auth."""

from functools import lru_cache

import jwt

from app.core.config import settings


class InvalidTokenError(Exception):
    """El token no es válido: firma, expiración, emisor o audiencia incorrectos."""


class AuthUnavailableError(Exception):
    """No se pudieron obtener las llaves públicas de Supabase."""


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    # Llaves públicas del proyecto (firmas asimétricas ES256/RS256). Se cachean 10 minutos,
    # así que verificar un token normalmente no hace ninguna llamada a Supabase.
    return jwt.PyJWKClient(
        f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_jwk_set=True, lifespan=600
    )


def verify_access_token(token: str) -> dict:
    """Valida el JWT y devuelve sus claims (sub, email, role, ...)."""
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
    except jwt.PyJWKClientConnectionError as exc:
        raise AuthUnavailableError(str(exc)) from exc
    except (jwt.PyJWKClientError, jwt.DecodeError) as exc:
        raise InvalidTokenError(str(exc)) from exc

    try:
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=f"{settings.SUPABASE_URL}/auth/v1",
        )
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError(str(exc)) from exc
