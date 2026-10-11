import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { formatMonth, toIsoDate } from '../utils/dates'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

interface DatePickerProps {
  value: string | null
  onChange: (isoDate: string) => void
  // Rango permitido, inclusive, como "YYYY-MM-DD"
  minDate: string
  maxDate: string
}

export function DatePicker({ value, onChange, minDate, maxDate }: DatePickerProps) {
  const initial = value ?? minDate
  const [year, setYear] = useState(Number(initial.slice(0, 4)))
  const [month, setMonth] = useState(Number(initial.slice(5, 7)) - 1)

  const firstOfMonth = toIsoDate(year, month, 1)
  const lastOfMonth = toIsoDate(year, month + 1, 0)
  const canGoBack = firstOfMonth > minDate
  const canGoForward = lastOfMonth < maxDate

  const daysInMonth = Number(lastOfMonth.slice(8, 10))
  // getUTCDay: 0 = domingo; la semana empieza en lunes
  const leadingBlanks = (new Date(`${firstOfMonth}T00:00:00Z`).getUTCDay() + 6) % 7

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1))
    setYear(d.getUTCFullYear())
    setMonth(d.getUTCMonth())
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={!canGoBack}
          aria-label="Mes anterior"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="font-semibold text-slate-900">{formatMonth(year, month)}</span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={!canGoForward}
          aria-label="Mes siguiente"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="py-1 text-xs font-medium text-slate-400">
            {d}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const iso = toIsoDate(year, month, i + 1)
          const disabled = iso < minDate || iso > maxDate
          const selected = iso === value
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onChange(iso)}
              aria-pressed={selected}
              aria-label={iso}
              className={clsx(
                'aspect-square rounded-xl text-sm transition',
                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100',
                selected && 'bg-teal-600 font-semibold text-white',
                !selected && !disabled && 'text-slate-800 hover:bg-teal-50 hover:text-teal-800',
                disabled && 'cursor-not-allowed text-slate-300',
                iso === minDate && !selected && 'font-semibold text-teal-700',
              )}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
