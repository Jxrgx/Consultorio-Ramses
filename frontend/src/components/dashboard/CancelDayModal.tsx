import clsx from 'clsx'
import { CircleAlert, CircleCheck, LoaderCircle, MessageCircleOff, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { Appointment, CancelDayResponse } from '../../services/api'
import { formatLongDate, formatTime12 } from '../../utils/dates'
import { Modal } from './Modal'

// Igual que el límite del backend (CancelDayRequest.reason)
const REASON_MAX_LENGTH = 200

interface CancelDayModalProps {
  date: string
  timeZone: string
  // Citas pendientes y confirmadas que aún no terminan
  affected: Appointment[]
  onSubmit: (reason: string | null) => Promise<CancelDayResponse>
  onClose: () => void
}

export function CancelDayModal({ date, timeZone, affected, onSubmit, onClose }: CancelDayModalProps) {
  const [reason, setReason] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CancelDayResponse | null>(null)

  const count = affected.length
  const dayLabel = formatLongDate(date)

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      setResult(await onSubmit(reason.trim() || null))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error inesperado.')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    const failed = result.items.filter((i) => !i.cancelled)
    return (
      <Modal
        title="Agenda del día cancelada"
        onClose={onClose}
        footer={
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800"
          >
            Cerrar
          </button>
        }
      >
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-900">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <span>
            {dayLabel} quedó bloqueado: los pacientes ya no pueden reservar ese día.{' '}
            {result.total === 0
              ? 'No había citas activas.'
              : `Se cancelaron ${result.cancelled} de ${result.total} citas y se avisó por WhatsApp a ${result.notified}.`}
          </span>
        </p>
        {result.items.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {result.items.map((item) => (
              <li key={item.appointment_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                <span className="w-20 font-medium text-slate-900">{formatTime12(item.start_time, timeZone)}</span>
                <span className="min-w-0 flex-1 truncate">{item.patient_name}</span>
                {!item.cancelled ? (
                  <span className="flex items-center gap-1 text-rose-700">
                    <CircleAlert className="size-4" /> No cancelada
                  </span>
                ) : item.notified ? (
                  <span className="flex items-center gap-1 text-emerald-700">
                    <CircleCheck className="size-4" /> Avisado
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-700">
                    <MessageCircleOff className="size-4" /> Sin aviso
                  </span>
                )}
                {item.error && <p className="w-full text-xs text-rose-700">{item.error}</p>}
              </li>
            ))}
          </ul>
        )}
        {failed.length > 0 && (
          <p className="text-rose-800">
            Las citas no canceladas siguen activas. Puedes volver a usar "Cancelar agenda del día" para reintentarlas.
          </p>
        )}
        {result.items.some((i) => i.cancelled && !i.notified) && (
          <p className="text-amber-800">
            A los pacientes marcados "Sin aviso" no les llegó el WhatsApp: avísales desde el botón de WhatsApp de cada cita.
          </p>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      title="Cancelar agenda del día"
      onClose={onClose}
      locked={submitting}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl px-4 py-2 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!acknowledged || submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting && <LoaderCircle className="size-4 animate-spin" />}
            {count === 0 ? 'Bloquear día' : `Cancelar ${count === 1 ? '1 cita' : `${count} citas`} y bloquear día`}
          </button>
        </>
      }
    >
      <p className="font-medium text-slate-900">{dayLabel}</p>

      <div className={clsx('flex items-start gap-2 rounded-xl p-3', count > 0 ? 'bg-rose-50 text-rose-900' : 'bg-slate-50')}>
        <TriangleAlert className={clsx('mt-0.5 size-4 shrink-0', count > 0 ? 'text-rose-600' : 'text-slate-500')} />
        <span>
          {count === 0
            ? 'No hay citas activas este día. '
            : `Se ${count === 1 ? 'cancelará 1 cita' : `cancelarán ${count} citas`}, se borrarán de Google Calendar y cada paciente recibirá un aviso por WhatsApp. `}
          El día quedará bloqueado en el portal hasta que lo desbloquees.
        </span>
      </div>

      {count > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {affected.map((a) => (
            <li key={a.id} className="flex gap-3 p-3">
              <span className="w-20 font-medium text-slate-900">{formatTime12(a.start_time, timeZone)}</span>
              <span className="min-w-0 flex-1 truncate">{a.patient.full_name}</span>
            </li>
          ))}
        </ul>
      )}

      <label className="block">
        <span className="mb-1 flex justify-between font-medium text-slate-800">
          Motivo <span className="font-normal text-slate-500">opcional</span>
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX_LENGTH))}
          maxLength={REASON_MAX_LENGTH}
          rows={2}
          disabled={submitting}
          placeholder="Ej. asistiré a un congreso"
          className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 focus:outline-none"
        />
        <span className="mt-1 flex justify-between text-xs text-slate-500">
          <span>{count > 0 ? 'Se incluye en el WhatsApp a los pacientes.' : 'Queda como nota del día bloqueado.'}</span>
          <span>
            {reason.length}/{REASON_MAX_LENGTH}
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          disabled={submitting}
          className="mt-0.5 size-4 accent-rose-600"
        />
        <span>
          {count === 0
            ? 'Entiendo que los pacientes no podrán reservar este día.'
            : `Entiendo que se ${count === 1 ? 'cancelará 1 cita' : `cancelarán ${count} citas`} y que esto no se puede deshacer.`}
        </span>
      </label>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-rose-800">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-500" /> {error}
        </p>
      )}
    </Modal>
  )
}
