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

Cada 30 minutos (desde las 08:00) el backend busca las citas de hoy con estado `pending` y envía
un recordatorio con los botones **Confirmar** / **Cancelar**. La respuesta llega al webhook
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
