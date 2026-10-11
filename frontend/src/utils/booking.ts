export interface BookingFormValues {
  fullName: string
  phone: string
  email: string
  notes: string
}

export const EMPTY_FORM: BookingFormValues = { fullName: '', phone: '', email: '', notes: '' }

// Mismas reglas que el backend: se ignoran espacios, guiones y paréntesis
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}
