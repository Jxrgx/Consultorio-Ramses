"""Rate limiting por IP con slowapi (en memoria: válido porque el backend corre en una sola instancia)."""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# La IP sale de request.client: detrás de un proxy, uvicorn debe correr con --proxy-headers
# para que sea la del paciente y no la del proxy (si no, todos compartirían el mismo límite).
limiter = Limiter(key_func=get_remote_address)


def rate_limit_exceeded_handler(_request: Request, _exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Demasiados intentos desde tu conexión. Espera unos minutos e inténtalo de nuevo."},
    )
