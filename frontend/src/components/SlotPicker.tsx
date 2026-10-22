import clsx from 'clsx'
import { CalendarOff, CalendarX2, CircleAlert, RotateCw } from 'lucide-react'
import type { Slot } from '../services/api'
import { formatTime } from '../utils/dates'

interface SlotPickerProps {
  slots: Slot[]
  // El consultorio no atiende ese día
  blocked?: boolean
  loading: boolean
  error: string | null
  selected: Slot | null
  timeZone: string
  onSelect: (slot: Slot) => void
  onRetry: () => void
}

export function SlotPicker({ slots, blocked, loading, error, selected, timeZone, onSelect, onRetry }: SlotPickerProps) {
  if (blocked) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <CalendarOff className="size-8 text-slate-400" />
        <p className="font-medium text-slate-700">El consultorio no atenderá este día</p>
        <p className="text-sm text-slate-500">Elige otra fecha en el calendario.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-busy="true" aria-label="Cargando horarios">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <CircleAlert className="size-8 text-rose-500" />
        <p className="text-sm text-rose-800">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
        >
          <RotateCw className="size-4" /> Reintentar
        </button>
      </div>
    )
  }

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
        <CalendarX2 className="size-8 text-slate-400" />
        <p className="font-medium text-slate-700">No hay horarios disponibles este día</p>
        <p className="text-sm text-slate-500">Prueba con otra fecha.</p>
      </div>
    )
  }

  return (
    <div role="radiogroup" aria-label="Horarios disponibles" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {slots.map((slot) => {
        const isSelected = selected?.start === slot.start
        return (
          <button
            key={slot.start}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(slot)}
            className={clsx(
              'flex h-14 flex-col items-center justify-center rounded-xl border text-sm transition',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100',
              isSelected
                ? 'border-teal-600 bg-teal-600 text-white'
                : 'border-slate-200 bg-white text-slate-800 hover:border-teal-400 hover:bg-teal-50',
            )}
          >
            <span className="font-semibold">{formatTime(slot.start, timeZone)}</span>
            <span className={clsx('text-xs', isSelected ? 'text-teal-100' : 'text-slate-500')}>
              hasta {formatTime(slot.end, timeZone)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
