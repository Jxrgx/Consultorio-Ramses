import clsx from 'clsx'
import { Building2, CircleCheck, Video, type LucideIcon } from 'lucide-react'
import type { AppointmentType } from '../services/api'

const OPTIONS: { value: AppointmentType; title: string; description: string; icon: LucideIcon }[] = [
  {
    value: 'presencial',
    title: 'Presencial',
    description: 'Sesión cara a cara en el consultorio.',
    icon: Building2,
  },
  {
    value: 'online',
    title: 'En línea',
    description: 'Videollamada desde donde estés, con la misma calidad de atención.',
    icon: Video,
  },
]

interface AppointmentTypeSelectorProps {
  value: AppointmentType | null
  onChange: (value: AppointmentType) => void
}

export function AppointmentTypeSelector({ value, onChange }: AppointmentTypeSelectorProps) {
  return (
    <div role="radiogroup" aria-label="Modalidad de la consulta" className="grid gap-4 sm:grid-cols-2">
      {OPTIONS.map(({ value: optionValue, title, description, icon: Icon }) => {
        const selected = value === optionValue
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(optionValue)}
            className={clsx(
              'relative flex min-h-24 items-center gap-4 rounded-2xl border-2 p-5 pr-12 text-left transition sm:flex-col sm:items-start sm:gap-3 sm:p-6',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100',
              selected
                ? 'border-teal-600 bg-teal-50'
                : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50',
            )}
          >
            <span
              className={clsx(
                'flex size-12 shrink-0 items-center justify-center rounded-xl',
                selected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600',
              )}
            >
              <Icon className="size-6" />
            </span>
            <span>
              <span className="block text-lg font-semibold text-slate-900">{title}</span>
              <span className="mt-1 block text-sm leading-relaxed text-slate-600">{description}</span>
            </span>
            {selected && <CircleCheck className="absolute top-1/2 right-4 size-6 -translate-y-1/2 text-teal-600 sm:top-4 sm:translate-y-0" />}
          </button>
        )
      })}
    </div>
  )
}
