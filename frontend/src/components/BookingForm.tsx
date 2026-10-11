import clsx from 'clsx'
import { ArrowLeft, LoaderCircle, Mail, MessageSquareText, Phone, User, type LucideIcon } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { normalizePhone, type BookingFormValues } from '../utils/booking'

type Errors = Partial<Record<keyof BookingFormValues, string>>
function validate(values: BookingFormValues): Errors {
  const errors: Errors = {}
  if (values.fullName.trim().length < 3) errors.fullName = 'Escribe tu nombre completo.'
  if (!/^\+?\d{8,15}$/.test(normalizePhone(values.phone))) {
    errors.phone = 'Escribe un teléfono válido, idealmente con lada internacional (ej. +52 55 1234 5678).'
  }
  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Escribe un correo válido o deja el campo vacío.'
  }
  return errors
}

interface BookingFormProps {
  values: BookingFormValues
  onChange: (values: BookingFormValues) => void
  onSubmit: () => void
  onBack: () => void
  submitting: boolean
  summary: ReactNode
}

export function BookingForm({ values, onChange, onSubmit, onBack, submitting, summary }: BookingFormProps) {
  const [errors, setErrors] = useState<Errors>({})

  function update(field: keyof BookingFormValues, value: string) {
    onChange({ ...values, [field]: value })
    if (errors[field]) setErrors({ ...errors, [field]: undefined })
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length === 0) onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {summary}

      <Field label="Nombre completo" icon={User} error={errors.fullName} htmlFor="fullName">
        <input
          id="fullName"
          autoComplete="name"
          value={values.fullName}
          onChange={(e) => update('fullName', e.target.value)}
          placeholder="Ej. María González López"
          className={inputClass(errors.fullName)}
        />
      </Field>

      <Field
        label="Teléfono (WhatsApp)"
        icon={Phone}
        error={errors.phone}
        hint="Te escribiremos a este número para confirmar tu cita."
        htmlFor="phone"
      >
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={values.phone}
          onChange={(e) => update('phone', e.target.value)}
          placeholder="+52 55 1234 5678"
          className={inputClass(errors.phone)}
        />
      </Field>

      <Field label="Correo electrónico" optional icon={Mail} error={errors.email} htmlFor="email">
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => update('email', e.target.value)}
          placeholder="tucorreo@ejemplo.com"
          className={inputClass(errors.email)}
        />
      </Field>

      <Field label="Motivo de la consulta" optional icon={MessageSquareText} htmlFor="notes">
        <textarea
          id="notes"
          rows={3}
          value={values.notes}
          onChange={(e) => update('notes', e.target.value)}
          placeholder="Cuéntanos brevemente qué te gustaría trabajar (opcional)."
          className={clsx(inputClass(), 'resize-y')}
        />
      </Field>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          <ArrowLeft className="size-4" /> Cambiar horario
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-wait disabled:opacity-70"
        >
          {submitting ? (
            <>
              <LoaderCircle className="size-5 animate-spin" /> Reservando…
            </>
          ) : (
            'Confirmar reserva'
          )}
        </button>
      </div>
    </form>
  )
}

function inputClass(error?: string) {
  return clsx(
    'w-full rounded-xl border bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 transition',
    'focus:outline-none focus:ring-4',
    error ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-300 focus:border-teal-500 focus:ring-teal-100',
  )
}

interface FieldProps {
  label: string
  icon: LucideIcon
  htmlFor: string
  children: ReactNode
  error?: string
  hint?: string
  optional?: boolean
}

function Field({ label, icon: Icon, htmlFor, children, error, hint, optional }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
        <Icon className="size-4 text-slate-400" />
        {label}
        {optional && <span className="font-normal text-slate-400">(opcional)</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-rose-600">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-sm text-slate-500">{hint}</p>
      )}
    </div>
  )
}
