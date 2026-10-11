// En desarrollo VITE_API_URL=/api/v1 pasa por el proxy de Vite hacia http://localhost:8000
const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export type AppointmentType = 'presencial' | 'online'
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'

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

export function bookAppointment(data: BookAppointmentRequest): Promise<Appointment> {
  return request('/appointments/book', { method: 'POST', body: JSON.stringify(data) })
}
