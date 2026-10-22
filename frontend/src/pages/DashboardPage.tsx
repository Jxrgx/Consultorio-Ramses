import clsx from 'clsx'
import { CircleAlert, CircleCheck, TriangleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AppointmentTimeline } from '../components/dashboard/AppointmentTimeline'
import { STATUS_STYLES } from '../components/dashboard/statusStyles'
import { DashboardHeader } from '../components/dashboard/DashboardHeader'
import { DateNavigator } from '../components/dashboard/DateNavigator'
import { TIMEZONE } from '../config'
import {
  ApiError,
  getAdminAppointments,
  getCalendarStatus,
  updateAppointmentStatus,
  type AdminStatus,
  type Appointment,
  type CalendarStatus,
} from '../services/api'
import { todayIn } from '../utils/dates'

// La agenda se vuelve a consultar sola cada minuto y al regresar a la pestaña
const POLL_INTERVAL_MS = 60_000

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.status === 0 ? err.message : `${err.message} (código ${err.status})`
  return 'Ocurrió un error inesperado.'
}

interface ListResult {
  // Consulta que produjo este resultado: fecha + número de recarga
  requestId: string
  date: string
  appointments: Appointment[]
  error: string | null
}

interface Toast {
  kind: 'success' | 'error'
  text: string
}

export function DashboardPage() {
  const today = todayIn(TIMEZONE)
  const { session, signOut } = useAuth()
  const userEmail = session?.user.email ?? ''

  const [date, setDate] = useState(today)
  const [refreshKey, setRefreshKey] = useState(0)
  const [result, setResult] = useState<ListResult | null>(null)
  const [calendar, setCalendar] = useState<CalendarStatus | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  const requestId = `${date}#${refreshKey}`
  // Skeleton solo al cambiar de día; las recargas del mismo día muestran el icono girando
  const loading = result?.date !== date
  const refreshing = !loading && result?.requestId !== requestId
  const appointments = loading ? [] : (result?.appointments ?? [])
  const unconfirmed = appointments.filter((a) => a.unconfirmed_alert).length

  // Sesión vencida o cuenta sin acceso: al cerrar sesión, ProtectedRoute manda a /login
  const handleAuthError = useCallback(
    (err: unknown) => {
      const authFailed = err instanceof ApiError && (err.status === 401 || err.status === 403)
      if (authFailed) void signOut()
      return authFailed
    },
    [signOut],
  )

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    getAdminAppointments(date, controller.signal)
      .then((data) => setResult({ requestId, date, appointments: data, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (handleAuthError(err)) return
        setResult({ requestId, date, appointments: [], error: errorMessage(err) })
      })
    return () => controller.abort()
  }, [date, requestId, handleAuthError])

  useEffect(() => {
    const controller = new AbortController()
    getCalendarStatus(controller.signal)
      .then(setCalendar)
      .catch((err: unknown) => {
        if (controller.signal.aborted || handleAuthError(err)) return
        setCalendar({ connected: false, calendar_id: '', error: errorMessage(err) })
      })
    return () => controller.abort()
  }, [handleAuthError])

  useEffect(() => {
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timeout)
  }, [toast])

  async function changeStatus(appointment: Appointment, status: AdminStatus) {
    setBusyId(appointment.id)
    try {
      await updateAppointmentStatus(appointment.id, status)
      setToast({
        kind: 'success',
        text: `${appointment.patient.full_name}: ${STATUS_STYLES[status].label.toLowerCase()}`,
      })
    } catch (err) {
      if (handleAuthError(err)) return
      setToast({ kind: 'error', text: errorMessage(err) })
    } finally {
      setBusyId(null)
      refresh()
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* pb-28: deja espacio para que el aviso flotante no tape las acciones de la última cita */}
      <div className="mx-auto max-w-5xl space-y-8 px-4 pt-8 pb-28 sm:px-6">
        <DashboardHeader
          date={date}
          timeZone={TIMEZONE}
          appointments={appointments}
          loading={loading}
          refreshing={refreshing}
          calendar={calendar}
          onRefresh={refresh}
          userEmail={userEmail}
          onLogout={() => void signOut()}
        />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Agenda del día</h2>
            <DateNavigator value={date} today={today} onChange={setDate} />
          </div>
          {unconfirmed > 0 && (
            <div role="status" className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
              <TriangleAlert className="size-5 shrink-0 text-amber-600" />
              {unconfirmed === 1
                ? '1 cita está por empezar y el paciente no la ha confirmado.'
                : `${unconfirmed} citas están por empezar y los pacientes no las han confirmado.`}
            </div>
          )}
          <AppointmentTimeline
            appointments={appointments}
            timeZone={TIMEZONE}
            loading={loading}
            error={loading ? null : (result?.error ?? null)}
            busyId={busyId}
            onChangeStatus={changeStatus}
            onRetry={refresh}
          />
        </section>
      </div>

      {toast && (
        <div
          role="status"
          className={clsx(
            'fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-md items-start gap-3 rounded-2xl p-4 text-sm shadow-lg ring-1 sm:inset-x-auto sm:right-6',
            toast.kind === 'success' ? 'bg-white text-slate-800 ring-slate-200' : 'bg-rose-50 text-rose-800 ring-rose-200',
          )}
        >
          {toast.kind === 'success' ? (
            <CircleCheck className="size-5 shrink-0 text-emerald-600" />
          ) : (
            <CircleAlert className="size-5 shrink-0 text-rose-500" />
          )}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
