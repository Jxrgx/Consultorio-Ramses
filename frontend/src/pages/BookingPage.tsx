import { ArrowLeft, ArrowRight, Building2, CalendarDays, CircleAlert, Clock, Video, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AppointmentTypeSelector } from '../components/AppointmentTypeSelector'
import { BookingForm } from '../components/BookingForm'
import { DatePicker } from '../components/DatePicker'
import { Header } from '../components/Header'
import { OtpVerification } from '../components/OtpVerification'
import { SlotPicker } from '../components/SlotPicker'
import { Stepper } from '../components/Stepper'
import { SuccessCard } from '../components/SuccessCard'
import { Turnstile } from '../components/Turnstile'
import { BOOKING_WINDOW_DAYS, TIMEZONE, TURNSTILE_SITE_KEY } from '../config'
import {
  ApiError,
  bookAppointment,
  getAvailability,
  getBlockedDays,
  type Appointment,
  type AppointmentType,
  type HoldResponse,
  type Slot,
} from '../services/api'
import { EMPTY_FORM, type BookingFormValues } from '../utils/booking'
import { addDays, formatLongDate, formatTime, todayIn } from '../utils/dates'
import { collapseSpaces } from '../utils/validation'

// 1 modalidad · 2 fecha y hora · 3 datos · 4 verificación por WhatsApp · 5 confirmación
type Step = 1 | 2 | 3 | 4 | 5

const SLOT_TAKEN = 'El horario solicitado no está disponible'
const AGENDA_UNAVAILABLE = 'No pudimos consultar la agenda del consultorio en este momento. Inténtalo en unos minutos.'

interface AvailabilityResult {
  // Identifica la consulta que produjo este resultado (fecha + recarga)
  key: string
  slots: Slot[]
  timeZone: string
  error: string | null
}

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Ocurrió un error inesperado. Inténtalo de nuevo.'
  switch (err.status) {
    case 0:
      return err.message
    case 409:
      return err.message === SLOT_TAKEN ? 'Ese horario acaba de ser reservado. Por favor elige otro.' : err.message
    // Mensajes del backend pensados para el paciente: límites, captcha, código vencido
    case 400:
    case 410:
    case 429:
      return err.message
    case 422:
      return `Revisa tus datos: ${err.message}`
    case 502:
      // Falla al enviar el código por WhatsApp; los errores de Google Calendar son técnicos
      return err.message.startsWith('Google Calendar') ? AGENDA_UNAVAILABLE : err.message
    case 503:
      return AGENDA_UNAVAILABLE
    default:
      return `Ocurrió un error (código ${err.status}). Inténtalo de nuevo.`
  }
}

export function BookingPage() {
  const today = todayIn(TIMEZONE)
  const maxDate = addDays(today, BOOKING_WINDOW_DAYS)

  const [step, setStep] = useState<Step>(1)
  const [type, setType] = useState<AppointmentType | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [form, setForm] = useState<BookingFormValues>(EMPTY_FORM)
  // Incrementarlo vuelve a consultar la disponibilidad del día seleccionado
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<AvailabilityResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [hold, setHold] = useState<HoldResponse | null>(null)
  // Turnstile: cada token sirve para un solo envío; cambiar la key vuelve a montar el widget
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const [blockedDates, setBlockedDates] = useState<ReadonlySet<string>>(new Set())

  const requestKey = date ? `${date}#${reloadKey}` : null
  // Está cargando mientras el último resultado no corresponda a la consulta actual
  const availabilityLoading = requestKey !== null && result?.key !== requestKey
  const timeZone = result?.timeZone ?? TIMEZONE

  // Días no laborales de toda la ventana de reserva; si falla, el calendario sigue funcionando
  // y el backend igual responde sin horarios para esos días
  useEffect(() => {
    const controller = new AbortController()
    getBlockedDays(today, maxDate, controller.signal)
      .then((dates) => setBlockedDates(new Set(dates)))
      .catch(() => {})
    return () => controller.abort()
  }, [today, maxDate])

  useEffect(() => {
    if (!date) return
    const key = `${date}#${reloadKey}`
    const controller = new AbortController()
    getAvailability(date, controller.signal)
      .then((data) => {
        setResult({ key, slots: data.slots, timeZone: data.timezone, error: null })
        // Se bloqueó después de cargar el calendario: se marca en gris desde ya
        if (data.blocked) setBlockedDates((prev) => new Set(prev).add(date))
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setResult({ key, slots: [], timeZone: TIMEZONE, error: errorMessage(err) })
      })
    return () => controller.abort()
  }, [date, reloadKey])

  // Vuelve a elegir horario con la disponibilidad actualizada
  const backToSlots = useCallback((message: string) => {
    setHold(null)
    setSlot(null)
    setReloadKey((k) => k + 1)
    setStep(2)
    setBannerError(message)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  function goTo(next: Step) {
    setBannerError(null)
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function selectDate(iso: string) {
    setDate(iso)
    setSlot(null)
  }

  async function submit() {
    if (!type || !slot) return
    setSubmitting(true)
    setBannerError(null)
    try {
      const held = await bookAppointment({
        patient_name: collapseSpaces(form.fullName),
        phone: form.phone,
        email: form.email.trim().toLowerCase() || null,
        // Se envía tal cual lo devolvió /availability: el backend compara el inicio exacto del slot
        start_time: slot.start,
        type,
        notes: form.notes.trim() || null,
        captcha_token: captchaToken,
      })
      setHold(held)
      goTo(4)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.message === SLOT_TAKEN) {
        backToSlots(errorMessage(err))
      } else {
        setBannerError(errorMessage(err))
      }
    } finally {
      setSubmitting(false)
      // El token ya se usó (o caducó): pedir uno nuevo para el siguiente intento
      setCaptchaToken(null)
      setCaptchaKey((k) => k + 1)
    }
  }

  function verified(result: Appointment) {
    setAppointment(result)
    setHold(null)
    goTo(5)
  }

  function reset() {
    setType(null)
    setDate(null)
    setSlot(null)
    setForm(EMPTY_FORM)
    setAppointment(null)
    setHold(null)
    goTo(1)
  }

  const summary = type && date && slot && (
    <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-teal-50 p-4 text-sm text-teal-900">
      <span className="flex items-center gap-1.5">
        {type === 'online' ? <Video className="size-4" /> : <Building2 className="size-4" />}
        {type === 'online' ? 'En línea' : 'Presencial'}
      </span>
      <span className="flex items-center gap-1.5">
        <CalendarDays className="size-4" /> {formatLongDate(date)}
      </span>
      <span className="flex items-center gap-1.5">
        <Clock className="size-4" /> {formatTime(slot.start, timeZone)} – {formatTime(slot.end, timeZone)}
      </span>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="mx-auto -mt-12 max-w-3xl px-4 pb-16 sm:px-6">
        <div className="rounded-3xl bg-white p-5 shadow-lg shadow-slate-200/60 ring-1 ring-slate-200 sm:p-8">
          {step < 5 && (
            <div className="mb-8">
              <Stepper current={step} />
            </div>
          )}

          {bannerError && (
            <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-500" />
              <p className="flex-1 text-sm text-rose-800">{bannerError}</p>
              <button
                type="button"
                onClick={() => setBannerError(null)}
                aria-label="Cerrar aviso"
                className="text-rose-400 hover:text-rose-600"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {step === 1 && (
            <section>
              <StepTitle title="¿Cómo prefieres tu sesión?" subtitle="Elige la modalidad de la consulta." />
              <AppointmentTypeSelector value={type} onChange={setType} />
              <StepActions>
                <span />
                <PrimaryButton disabled={!type} onClick={() => goTo(2)}>
                  Continuar <ArrowRight className="size-4" />
                </PrimaryButton>
              </StepActions>
            </section>
          )}

          {step === 2 && (
            <section>
              <StepTitle title="Elige fecha y hora" subtitle="Horarios en hora de Ciudad de México." />
              <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <DatePicker
                  value={date}
                  onChange={selectDate}
                  minDate={today}
                  maxDate={maxDate}
                  blockedDates={blockedDates}
                />
                <div>
                  {date ? (
                    <>
                      <h3 className="mb-3 flex items-center gap-2 font-medium text-slate-900">
                        <CalendarDays className="size-4 text-teal-600" />
                        {formatLongDate(date)}
                      </h3>
                      <SlotPicker
                        slots={result?.slots ?? []}
                        blocked={blockedDates.has(date)}
                        loading={availabilityLoading}
                        error={result?.error ?? null}
                        selected={slot}
                        timeZone={timeZone}
                        onSelect={setSlot}
                        onRetry={() => setReloadKey((k) => k + 1)}
                      />
                    </>
                  ) : (
                    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
                      <CalendarDays className="size-8 text-slate-300" />
                      Selecciona un día en el calendario para ver los horarios disponibles.
                    </div>
                  )}
                </div>
              </div>
              <StepActions>
                <SecondaryButton onClick={() => goTo(1)}>
                  <ArrowLeft className="size-4" /> Atrás
                </SecondaryButton>
                <PrimaryButton disabled={!slot} onClick={() => goTo(3)}>
                  Continuar <ArrowRight className="size-4" />
                </PrimaryButton>
              </StepActions>
            </section>
          )}

          {step === 3 && type && date && slot && (
            <section>
              <StepTitle title="Tus datos" subtitle="Los usaremos solo para gestionar tu cita." />
              <BookingForm
                values={form}
                onChange={setForm}
                onSubmit={submit}
                onBack={() => goTo(2)}
                submitting={submitting}
                summary={summary}
                submitBlocked={Boolean(TURNSTILE_SITE_KEY) && !captchaToken}
                extra={
                  TURNSTILE_SITE_KEY && <Turnstile key={captchaKey} resetKey={captchaKey} onToken={setCaptchaToken} />
                }
              />
            </section>
          )}

          {step === 4 && hold && (
            <section>
              <StepTitle title="Verifica tu número" subtitle="Último paso para reservar tu cita." />
              <OtpVerification
                hold={hold}
                summary={summary}
                onVerified={verified}
                onExpired={backToSlots}
                onBack={() => goTo(3)}
              />
            </section>
          )}

          {step === 5 && appointment && (
            <SuccessCard appointment={appointment} timeZone={timeZone} onBookAnother={reset} />
          )}
        </div>
      </main>
    </div>
  )
}

function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-slate-600">{subtitle}</p>
    </div>
  )
}

function StepActions({ children }: { children: ReactNode }) {
  return <div className="mt-8 flex items-center justify-between gap-3">{children}</div>
}

interface ButtonProps {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}

function PrimaryButton({ children, onClick, disabled }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
    >
      {children}
    </button>
  )
}

function SecondaryButton({ children, onClick }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl px-4 py-3 font-medium text-slate-700 hover:bg-slate-100"
    >
      {children}
    </button>
  )
}
