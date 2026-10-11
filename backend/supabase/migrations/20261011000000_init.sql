-- Esquema inicial de psico-agenda.
-- Ejecutar una vez en Supabase: Dashboard > SQL Editor > pegar y "Run"
-- (o con la CLI: supabase db push).

-- Necesaria para la restricción que impide citas traslapadas (uuid + rango en un índice GiST)
create extension if not exists btree_gist with schema extensions;

create type public.appointment_type as enum ('presencial', 'online');
create type public.appointment_status as enum ('pending', 'confirmed', 'cancelled', 'completed');
create type public.notification_type as enum ('confirmation', 'reminder_same_day');
create type public.notification_status as enum ('sent', 'failed');

create table public.psychologist (
    id uuid primary key default gen_random_uuid(),
    name varchar(120) not null,
    email varchar(255) not null unique,
    phone varchar(30),
    google_calendar_id varchar(255) not null default 'primary',
    slot_duration_minutes integer not null default 50 check (slot_duration_minutes > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.patient (
    id uuid primary key default gen_random_uuid(),
    full_name varchar(120) not null,
    -- Formato internacional (E.164), identificador para WhatsApp
    phone varchar(30) not null unique,
    email varchar(255),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.appointment (
    id uuid primary key default gen_random_uuid(),
    psychologist_id uuid not null references public.psychologist (id),
    patient_id uuid not null references public.patient (id),
    google_event_id varchar(255),
    start_time timestamptz not null,
    end_time timestamptz not null,
    type public.appointment_type not null,
    status public.appointment_status not null default 'pending',
    meeting_link varchar(500),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (end_time > start_time),
    -- Un psicólogo no puede tener dos citas activas traslapadas (protege contra reservas simultáneas)
    constraint appointment_no_overlap exclude using gist (
        psychologist_id with =,
        tstzrange(start_time, end_time) with &&
    ) where (status <> 'cancelled')
);

create index appointment_patient_id_idx on public.appointment (patient_id);
create index appointment_google_event_id_idx on public.appointment (google_event_id);

create table public.notification_log (
    id uuid primary key default gen_random_uuid(),
    appointment_id uuid not null references public.appointment (id) on delete cascade,
    -- Canal de envío: "whatsapp" (por defecto) o "email"
    channel varchar(30) not null default 'whatsapp',
    type public.notification_type not null,
    status public.notification_status not null,
    sent_at timestamptz not null default now()
);

create index notification_log_appointment_id_idx on public.notification_log (appointment_id);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger psychologist_set_updated_at before update on public.psychologist
    for each row execute function public.set_updated_at();
create trigger patient_set_updated_at before update on public.patient
    for each row execute function public.set_updated_at();
create trigger appointment_set_updated_at before update on public.appointment
    for each row execute function public.set_updated_at();

-- RLS activado sin políticas: la API pública (anon key) no puede leer ni escribir nada.
-- El backend usa la service_role key, que no está sujeta a RLS.
alter table public.psychologist enable row level security;
alter table public.patient enable row level security;
alter table public.appointment enable row level security;
alter table public.notification_log enable row level security;
