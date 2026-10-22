import clsx from 'clsx'
import { Check } from 'lucide-react'

const STEPS = ['Modalidad', 'Fecha y hora', 'Tus datos', 'Verificación']

interface StepperProps {
  // 1-based; un valor mayor que STEPS.length marca todos como completos
  current: number
}

export function Stepper({ current }: StepperProps) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {STEPS.map((label, i) => {
        const step = i + 1
        const done = step < current
        const active = step === current
        return (
          <li key={label} className="flex flex-1 items-center gap-2 sm:gap-3">
            <span
              className={clsx(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                done && 'bg-teal-600 text-white',
                active && 'bg-teal-600 text-white ring-4 ring-teal-100',
                !done && !active && 'bg-slate-100 text-slate-500',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {done ? <Check className="size-4" /> : step}
            </span>
            <span
              className={clsx(
                'hidden text-sm font-medium sm:block',
                active || done ? 'text-slate-900' : 'text-slate-500',
              )}
            >
              {label}
            </span>
            {step < STEPS.length && (
              <span className={clsx('h-px flex-1', done ? 'bg-teal-600' : 'bg-slate-200')} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
