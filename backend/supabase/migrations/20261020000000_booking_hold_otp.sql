-- Reserva segura: bloqueo temporal del horario (hold) + verificación del teléfono con OTP.
-- Ejecutar en Supabase: Dashboard > SQL Editor > pegar y "Run".

-- Estado de una cita recién solicitada que aún no verifica su teléfono.
-- Las citas en hold ocupan el horario (la restricción appointment_no_overlap ya las incluye,
-- porque solo excluye 'cancelled') hasta hold_expires_at; luego el backend las borra.
alter type public.appointment_status add value if not exists 'hold';

alter table public.appointment add column if not exists hold_expires_at timestamptz;

-- Limpieza periódica de holds vencidos y cálculo de disponibilidad
create index if not exists appointment_hold_expires_at_idx on public.appointment (hold_expires_at);

-- Códigos de verificación enviados por WhatsApp. Solo se guarda el HMAC del código, nunca el código.
create table if not exists public.otp_code (
    id uuid primary key default gen_random_uuid(),
    appointment_id uuid not null references public.appointment (id) on delete cascade,
    phone varchar(30) not null,
    code_hash varchar(64) not null,
    attempts integer not null default 0,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    consumed_at timestamptz
);

-- Límite de envíos por teléfono por hora y búsqueda del último código de una cita
create index if not exists otp_code_phone_created_at_idx on public.otp_code (phone, created_at);
create index if not exists otp_code_appointment_id_idx on public.otp_code (appointment_id, created_at);

-- Igual que las demás tablas: sin políticas, solo el backend (service_role) puede leerla.
alter table public.otp_code enable row level security;
