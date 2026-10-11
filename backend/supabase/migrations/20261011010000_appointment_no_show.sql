-- Estado "no_show": el paciente no asistió a la cita.
-- Ejecutar en Supabase: Dashboard > SQL Editor > pegar y "Run".
alter type public.appointment_status add value if not exists 'no_show';
