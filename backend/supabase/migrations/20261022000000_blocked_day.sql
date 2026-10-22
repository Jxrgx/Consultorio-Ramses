-- Días bloqueados (no laborales): el portal no ofrece horarios en estas fechas.
-- Se crean al cancelar la agenda de un día desde el panel y se borran con "Desbloquear día".
-- Ejecutar en Supabase: Dashboard > SQL Editor > pegar y "Run".

create table if not exists public.blocked_day (
    id uuid primary key default gen_random_uuid(),
    psychologist_id uuid not null references public.psychologist (id) on delete cascade,
    day date not null,
    reason varchar(200),
    -- Email del usuario del panel que bloqueó el día
    created_by varchar(255),
    created_at timestamptz not null default now(),
    constraint blocked_day_unique unique (psychologist_id, day)
);

-- Igual que las demás tablas: sin políticas, solo el backend (service_role) puede leerla.
alter table public.blocked_day enable row level security;
