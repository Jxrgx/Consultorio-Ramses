import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays } from '../../utils/dates'

interface DateNavigatorProps {
  value: string
  today: string
  onChange: (isoDate: string) => void
}

export function DateNavigator({ value, today, onChange }: DateNavigatorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <button
          type="button"
          onClick={() => onChange(addDays(value, -1))}
          aria-label="Día anterior"
          className="rounded-l-xl p-2.5 text-slate-600 hover:bg-slate-50"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => onChange(today)}
          disabled={value === today}
          className="border-x border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-teal-700"
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={() => onChange(addDays(value, 1))}
          aria-label="Día siguiente"
          className="rounded-r-xl p-2.5 text-slate-600 hover:bg-slate-50"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <input
        type="date"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label="Elegir fecha"
        className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-teal-500 focus:outline-none"
      />
    </div>
  )
}
