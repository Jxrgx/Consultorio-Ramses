import { getAccessToken } from './supabase'

// En desarrollo VITE_API_URL=/api/v1 pasa por el proxy de Vite hacia http://localhost:8000
const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export type AppointmentType = 'presencial' | 'online'
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
// Estados que el psicólogo puede asignar desde el panel ("pending" es solo el estado inicial)
export type AdminStatus = Exclude<AppointmentStatus, 'pending'>

export interface Slot {
  start: string
  end: string
}

export interface AvailabilityResponse {
  date: string
  timezone: string
  slot_duration_minutes: number
  slots: Slot[]
}

export interface BookAppointmentRequest {
  patient_name: string
  phone: string
  email: string | null
  start_time: string
  type: AppointmentType
  notes: string | null
  // Token de Cloudflare Turnstile (si el captcha está activo)
  captcha_token: string | null
}

/** Horario apartado mientras el paciente escribe el código que le llegó por WhatsApp. */
export interface HoldResponse {
  appointment_id: string
  hold_expires_at: string
  otp_expires_at: string
  resend_available_at: string
  phone_hint: string
}

export interface Patient {
  id: string
  full_name: string
  phone: string
  email: string | null
}

export interface Appointment {
  id: string
  psychologist_id: string
  patient: Patient
  start_time: string
  end_time: string
  type: AppointmentType
  status: AppointmentStatus
  google_event_id: string | null
  meeting_link: string | null
  notes: string | null
  created_at: string
  // Solo en el panel (/admin/appointments)
  reminder_sent?: boolean
  // Sigue pendiente y falta 1 h o menos para la cita (UNCONFIRMED_ALERT_MINUTES en el backend)
  unconfirmed_alert?: boolean
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type FastApiDetail = string | { msg: string }[] | undefined

function detailToMessage(detail: FastApiDetail, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    // Errores de validación de FastAPI (422): "Value error, Teléfono inválido" -> "Teléfono inválido"
    return detail.map((d) => d.msg.replace(/^Value error, /, '')).join('. ')
  }
  return fallback
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.')
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: FastApiDetail } | null
    throw new ApiError(res.status, detailToMessage(body?.detail, `Error ${res.status}`))
  }
  return res.json() as Promise<T>
}

export function getAvailability(date: string, signal?: AbortSignal): Promise<AvailabilityResponse> {
  return request(`/availability?date=${encodeURIComponent(date)}`, { signal })
}

/** Aparta el horario y envía el código de verificación por WhatsApp. */
export function bookAppointment(data: BookAppointmentRequest): Promise<HoldResponse> {
  return request('/appointments/book', { method: 'POST', body: JSON.stringify(data) })
}

/** Con el código correcto la cita queda registrada (status "pending"). */
export function verifyOtp(appointmentId: string, code: string): Promise<Appointment> {
  return request('/appointments/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ appointment_id: appointmentId, code }),
  })
}

export function resendOtp(appointmentId: string): Promise<HoldResponse> {
  return request('/appointments/resend-otp', { method: 'POST', body: JSON.stringify({ appointment_id: appointmentId }) })
}

// --- Panel del psicólogo: envían el access token de la sesión de Supabase Auth ---

export interface CalendarStatus {
  connected: boolean
  calendar_id: string
  error: string | null
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  if (!token) throw new ApiError(401, 'Inicia sesión para continuar')
  return request(path, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } })
}

export function getAdminMe(): Promise<{ email: string }> {
  return adminRequest('/admin/me')
}

export function getAdminAppointments(date: string, signal?: AbortSignal): Promise<Appointment[]> {
  return adminRequest(`/admin/appointments?date=${encodeURIComponent(date)}`, { signal })
}

export function updateAppointmentStatus(id: string, status: AdminStatus): Promise<Appointment> {
  return adminRequest(`/admin/appointments/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function getCalendarStatus(signal?: AbortSignal): Promise<CalendarStatus> {
  return adminRequest('/admin/calendar/status', { signal })
}
