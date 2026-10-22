export const PSYCHOLOGIST = {
  name: 'Lic. Jorge Castro',
  specialty: 'Psicología clínica',
  initials: 'JC',
}

// Zona horaria del consultorio: los horarios se muestran siempre en esta zona
export const TIMEZONE = 'America/Mexico_City'

// Cuántos días hacia adelante se puede reservar
export const BOOKING_WINDOW_DAYS = 60

// Dígitos del código de verificación por WhatsApp (OTP_LENGTH en el backend)
export const OTP_LENGTH = 6

// Cloudflare Turnstile (site key pública). Vacía = el formulario no muestra captcha
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
