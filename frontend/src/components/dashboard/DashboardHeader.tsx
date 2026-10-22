import clsx from 'clsx'
import {
  Ban,
  CalendarCheck,
  CalendarOff,
  CircleDashed,
  LoaderCircle,
  LogOut,
  MessageCircleCheck,
  RefreshCw,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { PSYCHOLOGIST } from '../../config'
import type { Appointment, CalendarStatus } from '../../services/api'
import { formatLongDate, greetingFor } from '../../utils/dates'

interface DashboardHeaderProps {
  date: string
  timeZone: string
  appointments: Appointment[]
  loading: boolean
  refreshing: boolean
  calendar: CalendarStatus | null
  userEmail: string
  onRefresh: () => void
  onLogout: () => void
}

export function DashboardHeader({
  date,
  timeZone,
  appointments,
  loading,
  refreshing,
  calendar,
  userEmail,
  onRefresh,
  onLogout,
}: DashboardHeaderProps) {
  const count = (status: Appointment['status']) => appointments.filter((a) => a.status === status).length
  const metrics: { label: string; value: number; icon: LucideIcon; className: string }[] = [
    { label: 'Total citas', value: appointments.length, icon: Users, className: 'bg-slate-100 text-slate-700' },
    { label: 'Confirmadas', value: count('confirmed'), icon: MessageCircleCheck, className: 'bg-emerald-100 text-emerald-700' },
    { label: 'Pendientes', value: count('pending'), icon: CircleDashed, className: 'bg-amber-100 text-amber-700' },
    { label: 'Canceladas', value: count('cancelled'), icon: Ban, className: 'bg-rose-100 text-rose-700' },
  ]

  return (
    <header className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-teal-700">
            {greetingFor(timeZone)}, {PSYCHOLOGIST.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance text-slate-900 sm:text-3xl">
            {formatLongDate(date)}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-auto">
            <CalendarSyncBadge calendar={calendar} />
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Actualizar"
            title="Actualizar"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={clsx('size-5', refreshing && 'animate-spin')} />
          </button>
          <Link
            to="/"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-white px-4 text-sm font-medium whitespace-nowrap text-slate-600 ring-1 ring-slate-200 hover:text-slate-900 sm:flex-none"
          >
            Ver portal de pacientes
          </Link>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Cerrar sesión"
            title={userEmail ? `Sesión iniciada como ${userEmail}` : undefined}
            className="inline-flex size-12 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-medium whitespace-nowrap text-slate-600 ring-1 ring-slate-200 hover:text-rose-700 sm:w-auto sm:px-4"
          >
            <LogOut className="size-5 sm:size-4" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </div>

      {/* Ícono arriba y número grande debajo: cada métrica se lee de un vistazo aunque la tarjeta sea angosta */}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, className }) => (
          <div key={label} className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
            <span className={clsx('flex size-11 items-center justify-center rounded-xl', className)}>
              <Icon className="size-5" />
            </span>
            <div className="flex flex-col-reverse gap-1">
              <dt className="text-sm text-slate-500">{label}</dt>
              <dd className="text-3xl leading-none font-semibold tracking-tight text-slate-900 tabular-nums">
                {loading ? <span className="inline-block h-8 w-10 animate-pulse rounded-lg bg-slate-100" /> : value}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </header>
  )
}

function CalendarSyncBadge({ calendar }: { calendar: CalendarStatus | null }) {
  if (!calendar) {
    return (
      <span className="inline-flex h-12 items-center gap-1.5 rounded-full bg-slate-100 px-4 text-xs font-medium text-slate-600">
        <LoaderCircle className="size-3.5 animate-spin" /> Verificando Google Calendar…
      </span>
    )
  }
  if (calendar.connected) {
    return (
      <span
        title={`Sincronizado con ${calendar.calendar_id}`}
        className="inline-flex h-12 items-center gap-1.5 rounded-full bg-emerald-50 px-4 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200"
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <CalendarCheck className="size-3.5" /> Google Calendar sincronizado
      </span>
    )
  }
  return (
    <span
      title={calendar.error ?? undefined}
      className="inline-flex h-12 items-center gap-1.5 rounded-full bg-rose-50 px-4 text-xs font-medium text-rose-700 ring-1 ring-rose-200"
    >
      <CalendarOff className="size-3.5" /> Sin conexión con Google Calendar
    </span>
  )
}
