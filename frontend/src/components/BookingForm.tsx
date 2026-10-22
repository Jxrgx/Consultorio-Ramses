import clsx from 'clsx'
import { ArrowLeft, LoaderCircle, Mail, MessageSquareText, Phone, User, type LucideIcon } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import type { BookingFormValues } from '../utils/booking'
import { LIMITS, digitsOnly, validateEmail, validateName, validateNotes, validatePhone } from '../utils/validation'

type Errors = Partial<Record<keyof BookingFormValues, string>>

const VALIDATORS: Record<keyof BookingFormValues, (value: string) => string | null> = {
  fullName: validateName,
  phone: validatePhone,
  email: validateEmail,
  notes: validateNotes,
}

function validate(values: BookingFormValues): Errors {
  const errors: Errors = {}
  for (const field of Object.keys(VALIDATORS) as (keyof BookingFormValues)[]) {
    const message = VALIDATORS[field](values[field])
    if (message) errors[field] = message
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
  // Contenido antes de los botones (p. ej. el captcha) y si el envío está bloqueado por él
  extra?: ReactNode
  submitBlocked?: boolean
}

export function BookingForm({
  values,
  onChange,
  onSubmit,
  onBack,
  submitting,
  summary,
  extra,
  submitBlocked = false,
}: BookingFormProps) {
  const [errors, setErrors] = useState<Errors>({})

  function update(field: keyof BookingFormValues, value: string) {
    onChange({ ...values, [field]: value })
    if (errors[field]) setErrors({ ...errors, [field]: undefined })
  }

  // Valida un campo al salir de él (si tiene algo escrito), para avisar antes de enviar
  function validateField(field: keyof BookingFormValues) {
    if (!values[field]) return
    setErrors((prev) => ({ ...prev, [field]: VALIDATORS[field](values[field]) ?? undefined }))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length === 0) onSubmit()
  }

  const notesLeft = LIMITS.notes - values.notes.length

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {summary}

      <Field label="Nombre completo" icon={User} error={errors.fullName} htmlFor="fullName">
        <input
          id="fullName"
          autoComplete="name"
          maxLength={LIMITS.name}
          value={values.fullName}
          onChange={(e) => update('fullName', e.target.value)}
          onBlur={() => validateField('fullName')}
          placeholder="Ej. María González López"
          className={inputClass(errors.fullName)}
        />
      </Field>

      <Field
        label="Teléfono (WhatsApp)"
        icon={Phone}
        error={errors.phone}
        hint="Solo números: 10 dígitos, o con código de país (ej. 525512345678). Te escribiremos aquí para confirmar tu cita."
        htmlFor="phone"
      >
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          inputMode="numeric"
          maxLength={LIMITS.phoneMax}
          value={values.phone}
          // Bloquea letras y símbolos: solo se conservan los dígitos (también al pegar)
          onChange={(e) => update('phone', digitsOnly(e.target.value))}
          onBlur={() => validateField('phone')}
          placeholder="5512345678"
          className={inputClass(errors.phone)}
        />
      </Field>

      <Field label="Correo electrónico" optional icon={Mail} error={errors.email} htmlFor="email">
        <input
          id="email"
          type="email"
          autoComplete="email"
          maxLength={LIMITS.email}
          value={values.email}
          onChange={(e) => update('email', e.target.value)}
          onBlur={() => validateField('email')}
          placeholder="usuario@dominio.com"
          className={inputClass(errors.email)}
        />
      </Field>

      <Field
        label="Motivo de la consulta"
        optional
        icon={MessageSquareText}
        error={errors.notes}
        htmlFor="notes"
        aside={
          <span
            aria-live="polite"
            className={clsx('text-xs tabular-nums', notesLeft <= 20 ? 'font-medium text-amber-600' : 'text-slate-400')}
          >
            {notesLeft} caracteres restantes
          </span>
        }
      >
        <textarea
          id="notes"
          rows={3}
          maxLength={LIMITS.notes}
          value={values.notes}
          onChange={(e) => update('notes', e.target.value)}
          onBlur={() => validateField('notes')}
          placeholder="Cuéntanos brevemente qué te gustaría trabajar (opcional)."
          className={clsx(inputClass(errors.notes), 'h-auto min-h-28 resize-y py-3.5 leading-relaxed')}
        />
      </Field>

      {extra}

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-5 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          <ArrowLeft className="size-4" /> Cambiar horario
        </button>
        <button
          type="submit"
          disabled={submitting || submitBlocked}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal-600 px-8 font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-wait disabled:opacity-70"
        >
          {submitting ? (
            <>
              <LoaderCircle className="size-5 animate-spin" /> Enviando código…
            </>
          ) : (
            'Enviar código por WhatsApp'
          )}
        </button>
      </div>
    </form>
  )
}

function inputClass(error?: string) {
  return clsx(
    // h-14: objetivo táctil cómodo; text-base evita el zoom automático de iOS al enfocar
    'h-14 w-full rounded-2xl border bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 transition',
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
  // Contenido bajo el campo, alineado a la derecha (p. ej. contador de caracteres)
  aside?: ReactNode
}

function Field({ label, icon: Icon, htmlFor, children, error, hint, optional, aside }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
        <Icon className="size-4 text-slate-400" />
        {label}
        {optional && <span className="font-normal text-slate-400">(opcional)</span>}
      </label>
      {children}
      {(error || hint || aside) && (
        <div className="mt-2 flex items-start justify-between gap-3">
          {error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : (
            <p className="text-sm leading-relaxed text-slate-500">{hint}</p>
          )}
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
      )}
    </div>
  )
}
