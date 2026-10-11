-- Notificaciones por WhatsApp.
-- Ejecutar en Supabase: Dashboard > SQL Editor > pegar y "Run".

-- Mensaje que se envía al paciente cuando cancela desde el botón de WhatsApp
alter type public.notification_type add value if not exists 'cancellation_notice';

alter table public.notification_log
    -- ID del mensaje en WhatsApp (wamid), para rastrear entregas
    add column if not exists provider_message_id varchar(100),
    -- Motivo del fallo cuando status = 'failed'
    add column if not exists error text;

-- El scheduler consulta si ya se envió el recordatorio de cada cita
create index if not exists notification_log_appointment_type_idx
    on public.notification_log (appointment_id, type);
