// Mismas reglas que backend/app/schemas/appointment.py. À-ÖØ-öø-ÿ son las letras latinas
// con acento, ü y ñ (excluye × y ÷).
const LETTERS = 'A-Za-zÀ-ÖØ-öø-ÿ'

export const LIMITS = { name: 100, phoneMin: 10, phoneMax: 13, email: 254, notes: 250 }

export const NAME_RE = new RegExp(`^[${LETTERS}. ]+$`)
const NAME_LETTER_RE = new RegExp(`[${LETTERS}]`, 'g')
export const PHONE_RE = /^\d{10,13}$/
export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/
export const NOTES_RE = new RegExp(`^[${LETTERS}0-9\\s.,?!¿¡]*$`)

/** Quita espacios repetidos y en los extremos. */
export function collapseSpaces(value: string): string {
  return value.replace(/[ \t]+/g, ' ').trim()
}

/** Para el input de teléfono: descarta todo lo que no sea dígito y limita la longitud. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').slice(0, LIMITS.phoneMax)
}

export function validateName(value: string): string | null {
  const name = collapseSpaces(value)
  if (!name) return 'Escribe tu nombre completo.'
  if (name.length > LIMITS.name) return `Máximo ${LIMITS.name} caracteres.`
  if (!NAME_RE.test(name)) return 'Usa solo letras, espacios y puntos (sin números ni símbolos).'
  if ((name.match(NAME_LETTER_RE) ?? []).length < 3) return 'Escribe tu nombre completo.'
  return null
}

export function validatePhone(value: string): string | null {
  if (!PHONE_RE.test(value)) return 'Escribe entre 10 y 13 dígitos, solo números.'
  return null
}

export function validateEmail(value: string): string | null {
  const email = value.trim()
  if (!email) return null // opcional
  if (email.length > LIMITS.email || !EMAIL_RE.test(email)) return 'Escribe un correo válido, como usuario@dominio.com.'
  return null
}

export function validateNotes(value: string): string | null {
  const notes = value.trim()
  if (notes.length > LIMITS.notes) return `Máximo ${LIMITS.notes} caracteres.`
  if (!NOTES_RE.test(notes)) return 'Usa solo letras, números y los signos . , ? ! ¿ ¡'
  return null
}
