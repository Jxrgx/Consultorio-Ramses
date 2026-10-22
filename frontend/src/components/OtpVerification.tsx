import clsx from 'clsx'
import { ArrowLeft, CircleAlert, Clock, LoaderCircle, MessageCircle, RotateCw } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { OTP_LENGTH } from '../config'
import { ApiError, resendOtp, verifyOtp, type Appointment, type HoldResponse } from '../services/api'

interface OtpVerificationProps {
  hold: HoldResponse
  summary: ReactNode
  onVerified: (appointment: Appointment) => void
  // El apartado venció o se agotaron los intentos: hay que elegir horario de nuevo
  onExpired: (message: string) => void
  onBack: () => void
}

function secondsUntil(iso: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000))
}

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function OtpVerification({ hold: initialHold, summary, onVerified, onExpired, onBack }: OtpVerificationProps) {
  const [hold, setHold] = useState(initialHold)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const holdLeft = secondsUntil(hold.hold_expires_at, now)
  const resendLeft = secondsUntil(hold.resend_available_at, now)
  const codeExpired = secondsUntil(hold.otp_expires_at, now) === 0

  useEffect(() => {
    if (holdLeft === 0) onExpired('Se acabó el tiempo para verificar tu número. Elige tu horario de nuevo.')
  }, [holdLeft, onExpired])

  function handleError(err: unknown) {
    if (err instanceof ApiError && err.status === 410) return onExpired(err.message)
    setInfo(null)
    setError(err instanceof ApiError ? err.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (code.length !== OTP_LENGTH) {
      setError(`El código tiene ${OTP_LENGTH} dígitos.`)
      return
    }
    setVerifying(true)
    setError(null)
    try {
      onVerified(await verifyOtp(hold.appointment_id, code))
    } catch (err) {
      setCode('')
      handleError(err)
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    setResending(true)
    setError(null)
    try {
      setHold(await resendOtp(hold.appointment_id))
      setCode('')
      setInfo('Te enviamos un código nuevo. El anterior ya no funciona.')
    } catch (err) {
      handleError(err)
    } finally {
      setResending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {summary}

      <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
        <MessageCircle className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <p>
          Te enviamos un código de {OTP_LENGTH} dígitos por WhatsApp al número <strong>{hold.phone_hint}</strong>.
          Escríbelo aquí para confirmar que el número es tuyo.
        </p>
      </div>

      <div>
        <label htmlFor="otp" className="mb-1.5 block text-sm font-medium text-slate-700">
          Código de verificación
        </label>
        <input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))
            setError(null)
          }}
          placeholder={'•'.repeat(OTP_LENGTH)}
          autoFocus
          className={clsx(
            'w-full rounded-xl border bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-slate-900 transition',
            'focus:ring-4 focus:outline-none',
            error ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-300 focus:border-teal-500 focus:ring-teal-100',
          )}
        />
        {error && (
          <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-rose-600">
            <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}
        {!error && info && <p className="mt-2 text-sm text-emerald-700">{info}</p>}
        {!error && !info && codeExpired && (
          <p className="mt-2 text-sm text-amber-700">El código expiró. Pide uno nuevo.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span
          className={clsx('flex items-center gap-1.5', holdLeft <= 60 ? 'font-medium text-amber-700' : 'text-slate-500')}
        >
          <Clock className="size-4" /> Tu horario está apartado por {formatCountdown(holdLeft)}
        </span>
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || resendLeft > 0}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-teal-700 hover:bg-teal-50 disabled:text-slate-400 disabled:hover:bg-transparent"
        >
          <RotateCw className={clsx('size-4', resending && 'animate-spin')} />
          {resendLeft > 0 ? `Reenviar código en ${resendLeft} s` : 'Reenviar código'}
        </button>
      </div>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={verifying}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          <ArrowLeft className="size-4" /> Corregir mis datos
        </button>
        <button
          type="submit"
          disabled={verifying || code.length !== OTP_LENGTH}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying ? (
            <>
              <LoaderCircle className="size-5 animate-spin" /> Verificando…
            </>
          ) : (
            'Verificar y reservar'
          )}
        </button>
      </div>
    </form>
  )
}
