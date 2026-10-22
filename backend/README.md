# psico-agenda · backend

```bash
uv sync                      # crea .venv e instala dependencias
cp .env.example .env         # completar SUPABASE_URL y SUPABASE_KEY (service_role)
uv run uvicorn app.main:app --reload
```

Antes del primer arranque, crea el esquema en Supabase: abre **SQL Editor** en el dashboard,
pega el contenido de `supabase/migrations/20261011000000_init.sql` y ejecútalo.

API en http://localhost:8000 · docs en http://localhost:8000/docs

## Recordatorios por WhatsApp

Cada 30 minutos (entre 08:00 y 21:00) el backend busca las citas `pending` a las que les faltan
24 horas o menos y envía
un recordatorio (una sola vez por cita) con los botones **Confirmar** / **Cancelar**. La respuesta llega al webhook
`POST /api/v1/webhooks/whatsapp`, que confirma la cita (y agrega `[CONFIRMADA]` al evento) o la
cancela (y borra el evento para liberar el horario).

1. Ejecuta `supabase/migrations/20261011020000_whatsapp_notifications.sql` en el SQL Editor.
2. En Meta (WhatsApp Manager > Message templates) crea la plantilla **`recordatorio_cita`**,
   categoría *Utility*, idioma *Spanish (MEX)* (`es_MX`):
   - Cuerpo:
     `Hola {{1}}, te recordamos tu cita {{2}} de hoy a las {{3}} con {{4}}. ¿Nos confirmas tu asistencia?`
     (ejemplos: `María`, `presencial`, `4:00 PM`, `Lic. Jorge Castro`)
   - Botones de respuesta rápida, en este orden: **Confirmar**, **Cancelar**.
3. Completa las variables `WHATSAPP_*` del `.env`.
4. En Meta > WhatsApp > Configuration > Webhook: URL `https://<tu-dominio>/api/v1/webhooks/whatsapp`,
   el mismo `WHATSAPP_VERIFY_TOKEN`, y suscríbete al campo **messages**. Meta necesita una URL
   pública con HTTPS (en local: `ngrok http 8000`).

## Reserva segura (captcha, límites, hold y OTP)

1. `POST /api/v1/appointments/book`: valida Cloudflare Turnstile (si hay `TURNSTILE_SECRET_KEY`),
   aplica los límites (3 reservas por IP cada 15 min, 2 citas activas por teléfono, 3 códigos por
   teléfono por hora), aparta el horario 10 min (`status = hold`) y envía un código por WhatsApp.
2. `POST /api/v1/appointments/verify-otp`: con el código correcto crea el evento en Google Calendar
   y la cita pasa a `pending`. Tras 3 errores se libera el horario.
   `POST /api/v1/appointments/resend-otp`: otro código (espera de 60 s).

Requisitos:
- Ejecutar `supabase/migrations/20261020000000_booking_hold_otp.sql` en el SQL Editor.
- `OTP_SECRET` en el `.env` (firma los códigos guardados).
- Plantilla de Meta de categoría **Authentication**, nombre `codigo_verificacion`, idioma `es_MX`,
  con botón "Copiar código".
- Con `ENVIRONMENT=development`, si WhatsApp no puede enviar el código (plantilla sin aprobar,
  número no autorizado) el código se imprime en la consola del backend para poder probar.
  **En producción usa `ENVIRONMENT=production`.**
- Detrás de un proxy, arrancar uvicorn con `--proxy-headers` para limitar por la IP real.
