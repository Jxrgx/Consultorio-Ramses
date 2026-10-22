import clsx from 'clsx'
import { CalendarX2, CircleAlert, Mail, MessageSquareText, Phone, RotateCw, TriangleAlert } from 'lucide-react'
import type { AdminStatus, Appointment } from '../../services/api'
import { formatTime12 } from '../../utils/dates'
import { AppointmentActions } from './AppointmentActions'
import { StatusBadge, TypeBadge } from './badges'

interface AppointmentTimelineProps {
  appointments: Appointment[]
  timeZone: string
  loading: boolean
  error: string | null
  // id de la cita cuyo estado se está actualizando
  busyId: string | null
  onChangeStatus: (appointment: Appointment, status: AdminStatus) => void
  onRetry: () => void
}

export function AppointmentTimeline({
  appointments,
  timeZone,
  loading,
  error,
  busyId,
  onChangeStatus,
  onRetry,
}: AppointmentTimelineProps) {
  if (loading) {
    return (
      <ol className="space-y-4" aria-busy="true" aria-label="Cargando citas">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex gap-5">
            <div className="hidden h-5 w-24 animate-pulse rounded bg-slate-200 sm:block" />
            <div className="h-44 flex-1 animate-pulse rounded-2xl border border-slate-100 bg-white" />
          </li>
        ))}
      </ol>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-rose-50 p-8 text-center ring-1 ring-rose-200">
        <CircleAlert className="size-8 text-rose-500" />
        <p className="text-rose-800">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
        >
          <RotateCw className="size-4" /> Reintentar
        </button>
      </div>
    )
  }

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center sm:p-10">
        <CalendarX2 className="size-10 text-slate-300" />
        <p className="font-medium text-slate-700">No hay citas agendadas para este día</p>
        <p className="text-sm text-slate-500">Las reservas del portal de pacientes aparecerán aquí.</p>
      </div>
    )
  }

  return (
    <ol className="relative space-y-4 sm:space-y-5">
      {appointments.map((appointment, i) => {
        const cancelled = appointment.status === 'cancelled'
        return (
          <li key={appointment.id} className="relative flex gap-5">
            {/* Columna de hora con la línea del timeline; en móvil se oculta y la hora va dentro de la tarjeta */}
            <div className="relative hidden w-24 shrink-0 flex-col items-end pt-5 sm:flex">
              <span className={clsx('text-sm font-semibold', cancelled ? 'text-slate-400 line-through' : 'text-slate-900')}>
                {formatTime12(appointment.start_time, timeZone)}
              </span>
              <span className="text-xs text-slate-500">{formatTime12(appointment.end_time, timeZone)}</span>
            </div>
            <div className="relative hidden flex-col items-center pt-6 sm:flex" aria-hidden>
              <span
                className={clsx(
                  'z-[1] size-3 rounded-full ring-4 ring-slate-50',
                  cancelled ? 'bg-slate-300' : 'bg-teal-500',
                )}
              />
              {i < appointments.length - 1 && <span className="absolute top-6 -bottom-5 w-px bg-slate-200" />}
            </div>

            <article
              className={clsx(
                'min-w-0 flex-1 rounded-2xl bg-white p-5 shadow-sm sm:p-6',
                appointment.unconfirmed_alert ? 'ring-2 ring-amber-400' : 'border border-slate-100',
                cancelled && 'opacity-70',
              )}
            >
              {appointment.unconfirmed_alert && (
                <p className="mb-5 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <span>
                    <strong>Sin confirmar.</strong> La cita está por empezar y el paciente no ha respondido.{' '}
                    {appointment.reminder_sent
                      ? 'Se le envió el recordatorio por WhatsApp.'
                      : 'El recordatorio por WhatsApp no se pudo enviar.'}{' '}
                    Puedes escribirle o llamarle.
                  </span>
                </p>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  {/* Hasta dos líneas para nombres largos; después se corta con "…" sin tocar el borde */}
                  <h3
                    title={appointment.patient.full_name}
                    className="line-clamp-2 text-lg leading-snug font-semibold break-words text-slate-900"
                  >
                    {appointment.patient.full_name}
                  </h3>
                  <p className={clsx('mt-1 text-sm', cancelled ? 'text-slate-400 line-through sm:no-underline' : 'text-slate-500')}>
                    {formatTime12(appointment.start_time, timeZone)} – {formatTime12(appointment.end_time, timeZone)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5 sm:max-w-[50%] sm:justify-end">
                  <TypeBadge type={appointment.type} />
                  <StatusBadge status={appointment.status} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Phone className="size-4 text-slate-400" /> {appointment.patient.phone}
                </span>
                {appointment.patient.email && (
                  <a href={`mailto:${appointment.patient.email}`} className="flex min-w-0 items-center gap-1.5 hover:text-teal-700">
                    <Mail className="size-4 shrink-0 text-slate-400" />
                    <span className="truncate">{appointment.patient.email}</span>
                  </a>
                )}
              </div>

              {appointment.notes && (
                <p className="mt-4 flex gap-2 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                  <MessageSquareText className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 break-words whitespace-pre-line">{appointment.notes}</span>
                </p>
              )}

              <div className="mt-5 border-t border-slate-100 pt-5">
                <AppointmentActions
                  appointment={appointment}
                  timeZone={timeZone}
                  busy={busyId === appointment.id}
                  onChangeStatus={(status) => onChangeStatus(appointment, status)}
                />
              </div>
            </article>
          </li>
        )
      })}
    </ol>
  )
}
