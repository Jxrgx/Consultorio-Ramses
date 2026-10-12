from datetime import time
from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "psico-agenda"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # Supabase (Project Settings > API). SUPABASE_KEY debe ser la service_role key: el backend
    # accede a las tablas sin pasar por RLS. Es secreta, nunca la expongas al frontend.
    SUPABASE_URL: str = Field(min_length=1)
    SUPABASE_KEY: str = Field(min_length=1)

    # Orígenes permitidos para CORS, separados por comas
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173"

    # Google Calendar: JSON de la Service Account. Si GOOGLE_OAUTH_TOKEN_FILE está definido
    # tiene prioridad (necesario para Meet e invitados en cuentas de Gmail normales).
    GOOGLE_CREDENTIALS_FILE: str | None = None
    GOOGLE_OAUTH_TOKEN_FILE: str | None = None
    # Con Service Account debe ser el ID del calendario del psicólogo compartido con ella;
    # "primary" sería el calendario propio (vacío) de la Service Account.
    GOOGLE_CALENDAR_ID: str = "primary"

    # Agenda
    TIMEZONE: str = "America/Mexico_City"
    WORKDAY_START: time = time(9, 0)
    WORKDAY_END: time = time(18, 0)
    SLOT_DURATION_MINUTES: int = 50

    # Psicólogo que init_db() crea si la tabla está vacía (opcional)
    PSYCHOLOGIST_NAME: str | None = None
    PSYCHOLOGIST_EMAIL: str | None = None

    # Acceso al panel (/admin): usuarios de Supabase Auth cuyo email sea el de un psicólogo
    # registrado o esté en esta lista (separados por comas).
    ADMIN_EMAILS: str = ""

    # Código de país que se antepone a los teléfonos de 10 dígitos (52 = México), para WhatsApp
    DEFAULT_COUNTRY_CODE: str = "52"

    # WhatsApp Cloud API (Meta). developers.facebook.com > tu app > WhatsApp > API Setup
    WHATSAPP_ACCESS_TOKEN: str | None = Field(
        default=None, validation_alias=AliasChoices("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_TOKEN")
    )
    WHATSAPP_PHONE_NUMBER_ID: str | None = None
    # Webhook: el verify token lo inventas tú y lo escribes también en la configuración del webhook
    # en Meta; el app secret está en App settings > Basic y sirve para validar la firma.
    WHATSAPP_VERIFY_TOKEN: str | None = None
    WHATSAPP_APP_SECRET: str | None = None
    WHATSAPP_API_VERSION: str = "v23.0"
    # Plantilla aprobada en Meta para el recordatorio (ver backend/README.md)
    WHATSAPP_REMINDER_TEMPLATE: str = "recordatorio_cita"
    WHATSAPP_TEMPLATE_LANGUAGE: str = "es_MX"

    # Recordatorios del mismo día: cada cuántos minutos se buscan citas pendientes y desde qué
    # hora local se envían. Desactivar con REMINDERS_ENABLED=false (p. ej. con varios workers).
    REMINDERS_ENABLED: bool = True
    REMINDER_INTERVAL_MINUTES: int = 30
    REMINDER_SEND_FROM: time = time(8, 0)

    @field_validator("SUPABASE_URL")
    @classmethod
    def _normalize_supabase_url(cls, value: str) -> str:
        # El cliente necesita la URL base del proyecto (https://<ref>.supabase.co), no la de /rest/v1
        value = value.strip().rstrip("/")
        return value.removesuffix("/rest/v1")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",") if o.strip()]

    @property
    def admin_emails(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
