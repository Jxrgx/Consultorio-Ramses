// Las fechas de calendario se manejan como strings "YYYY-MM-DD" para no depender
// de la zona horaria del navegador.

export function todayIn(timeZone: string): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())
}

export function toIsoDate(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatLongDate(isoDate: string): string {
  const text = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${isoDate}T12:00:00Z`))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatMonth(year: number, monthIndex: number): string {
  const text = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, monthIndex, 1)),
  )
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatTime(isoDateTime: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    new Date(isoDateTime),
  )
}

export function dateInZone(isoDateTime: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(isoDateTime))
}
