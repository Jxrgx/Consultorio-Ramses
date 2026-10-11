export interface BookingFormValues {
  fullName: string
  phone: string
  email: string
  notes: string
}

export const EMPTY_FORM: BookingFormValues = { fullName: '', phone: '', email: '', notes: '' }
