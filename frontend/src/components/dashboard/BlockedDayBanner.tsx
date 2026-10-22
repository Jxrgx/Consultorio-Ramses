import { CalendarOff, CircleAlert, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import type { BlockedDay } from '../../services/api'
import { formatLongDate } from '../../utils/dates'
import { Modal } from './Modal'

interface BlockedDayBannerProps {
  blocked: BlockedDay
  onUnblock: () => Promise<void>
}

export function BlockedDayBanner({ blocked, onUnblock }: BlockedDayBannerProps) {
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function unblock() {
    setSubmitting(true)
    setError(null)
    try {
      await onUnblock()
      setConfirming(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error inesperado.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 rounded-2xl bg-slate-100 p-5 text-sm text-slate-700 ring-1 ring-slate-200 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <CalendarOff className="mt-0.5 size-5 shrink-0 text-slate-500" />
          <div className="min-w-0 flex-1 leading-relaxed">
            <p className="font-semibold text-slate-900">Día bloqueado</p>
            <p className="break-words">
              Los pacientes no pueden reservar este día.
              {blocked.reason && <> Motivo: {blocked.reason}</>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-12 shrink-0 rounded-xl bg-white px-5 font-medium text-teal-700 ring-1 ring-slate-300 hover:bg-teal-50"
        >
          Desbloquear día
        </button>
      </div>

      {confirming && (
        <Modal
          title="Desbloquear día"
          onClose={() => setConfirming(false)}
          locked={submitting}
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className="inline-flex items-center rounded-xl px-5 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={unblock}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 font-semibold text-white hover:bg-teal-700 disabled:bg-slate-300"
              >
                {submitting && <LoaderCircle className="size-4 animate-spin" />}
                Desbloquear
              </button>
            </>
          }
        >
          <p>
            <strong className="text-slate-900">{formatLongDate(blocked.day)}</strong> volverá a aparecer en el portal
            y los pacientes podrán reservar en los horarios libres.
          </p>
          <p className="text-slate-500">Las citas que se cancelaron al bloquearlo siguen canceladas.</p>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-rose-800">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-500" /> {error}
            </p>
          )}
        </Modal>
      )}
    </>
  )
}
