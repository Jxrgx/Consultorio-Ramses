import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays } from '../../utils/dates'

interface DateNavigatorProps {
  value: string
  today: string
  onChange: (isoDate: string) => void
}

export function DateNavigator({ value, today, onChange }: DateNavigatorProps) {
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <div className="flex shrink-0 items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <button
          type="button"
          onClick={() => onChange(addDays(value, -1))}
          aria-label="Día anterior"
          className="flex size-12 items-center justify-center rounded-l-xl text-slate-600 hover:bg-slate-50"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => onChange(today)}
          disabled={value === today}
          className="h-12 border-x border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-teal-700"
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={() => onChange(addDays(value, 1))}
          aria-label="Día siguiente"
          className="flex size-12 items-center justify-center rounded-r-xl text-slate-600 hover:bg-slate-50"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <input
        type="date"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label="Elegir fecha"
        className="h-12 min-w-0 flex-1 rounded-xl bg-white px-3 text-base text-slate-700 shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-teal-500 focus:outline-none sm:flex-none sm:text-sm"
      />
    </div>
  )
}
