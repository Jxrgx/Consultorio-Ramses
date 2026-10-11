import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { ApiError, getAdminMe } from '../services/api'
import { SUPABASE_CONFIG_ERROR, supabase } from '../services/supabase'

function authErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Correo o contraseña incorrectos.'
  if (/email not confirmed/i.test(message)) return 'Confirma tu correo antes de iniciar sesión.'
  if (/rate limit|too many/i.test(message)) return 'Demasiados intentos. Espera unos minutos.'
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.'
}

export function LoginPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/admin'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(supabase ? null : SUPABASE_CONFIG_ERROR)

  // Ya hay sesión (p. ej. se volvió a /login con la pestaña abierta): directo al panel
  if (!loading && session && !submitting) return <Navigate to={from} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) {
        setError(authErrorMessage(authError.message))
        return
      }
      // La sesión es válida, pero el backend decide quién puede ver el panel
      try {
        await getAdminMe()
      } catch (err) {
        await supabase.auth.signOut()
        setError(
          err instanceof ApiError && err.status === 403
            ? 'Esta cuenta no tiene acceso al panel del psicólogo.'
            : 'No se pudo verificar el acceso con el servidor. Inténtalo de nuevo.',
        )
        return
      }
      navigate(from, { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-lg shadow-slate-200/60 ring-1 ring-slate-200"
      >
        <div className="flex size-12 items-center justify-center rounded-2xl bg-teal-600 text-white">
          <LockKeyhole className="size-6" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-slate-900">Panel del psicólogo</h1>
        <p className="mt-1 text-sm text-slate-600">Inicia sesión para ver y gestionar tu agenda.</p>

        <label htmlFor="login-email" className="mt-6 mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
          <Mail className="size-4 text-slate-400" /> Correo electrónico
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-teal-500 focus:ring-4 focus:ring-teal-100 focus:outline-none"
        />

        <label htmlFor="login-password" className="mt-4 mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
          <KeyRound className="size-4 text-slate-400" /> Contraseña
        </label>
        <div className="relative">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 py-3 pr-12 pl-4 focus:border-teal-500 focus:ring-4 focus:ring-teal-100 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 hover:text-slate-600"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !supabase || !email.trim() || !password}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {submitting && <LoaderCircle className="size-5 animate-spin" />} Iniciar sesión
        </button>
        <Link to="/" className="mt-4 block text-center text-sm text-slate-500 hover:text-slate-700">
          Volver al portal de pacientes
        </Link>
      </form>
    </div>
  )
}
