import { Building2, CalendarDays, CircleCheck, Clock, Info, Phone, User, Video, type LucideIcon } from 'lucide-react'
import type { Appointment } from '../services/api'
import { dateInZone, formatLongDate, formatTime } from '../utils/dates'

interface SuccessCardProps {
  appointment: Appointment
  timeZone: string
  onBookAnother: () => void
}

export function SuccessCard({ appointment, timeZone, onBookAnother }: SuccessCardProps) {
  const isOnline = appointment.type === 'online'

  return (
    <div className="text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100">
        <CircleCheck className="size-9 text-emerald-600" />
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-slate-900">¡Tu cita quedó reservada!</h2>
      <p className="mt-2 text-slate-600">
        Gracias, {appointment.patient.full_name.split(' ')[0]}. Te contactaremos por WhatsApp para confirmarla.
      </p>

      <dl className="mt-6 divide-y divide-slate-100 rounded-2xl border border-slate-200 text-left">
        <Row icon={CalendarDays} label="Fecha" value={formatLongDate(dateInZone(appointment.start_time, timeZone))} />
        <Row
          icon={Clock}
          label="Horario"
          value={`${formatTime(appointment.start_time, timeZone)} – ${formatTime(appointment.end_time, timeZone)}`}
        />
        <Row
          icon={isOnline ? Video : Building2}
          label="Modalidad"
          value={isOnline ? 'En línea (videollamada)' : 'Presencial'}
        />
        <Row icon={User} label="Paciente" value={appointment.patient.full_name} />
        <Row icon={Phone} label="WhatsApp" value={appointment.patient.phone} />
      </dl>

      {isOnline &&
        (appointment.meeting_link ? (
          <a
            href={appointment.meeting_link}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-50 px-4 py-2 font-medium text-teal-700 ring-1 ring-teal-200 hover:bg-teal-100"
          >
            <Video className="size-4" /> Enlace de la videollamada
          </a>
        ) : (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-left text-sm text-sky-800">
            <Info className="mt-0.5 size-4 shrink-0" />
            Recibirás el enlace de la videollamada antes de tu sesión.
          </p>
        ))}

      <button
        type="button"
        onClick={onBookAnother}
        className="mt-8 rounded-xl px-4 py-2 font-medium text-teal-700 hover:bg-teal-50"
      >
        Agendar otra cita
      </button>
    </div>
  )
}

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="size-5 shrink-0 text-teal-600" />
      <dt className="w-24 shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  )
}
