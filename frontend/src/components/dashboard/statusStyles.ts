import { Ban, CircleCheckBig, CircleDashed, MessageCircleCheck, UserX, type LucideIcon } from 'lucide-react'
import type { AppointmentStatus } from '../../services/api'

export const STATUS_STYLES: Record<AppointmentStatus, { label: string; className: string; icon: LucideIcon }> = {
  pending: { label: 'Pendiente', className: 'bg-amber-50 text-amber-800 ring-amber-200', icon: CircleDashed },
  confirmed: {
    label: 'Confirmado por WhatsApp',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    icon: MessageCircleCheck,
  },
  completed: { label: 'Completada', className: 'bg-sky-50 text-sky-800 ring-sky-200', icon: CircleCheckBig },
  cancelled: { label: 'Cancelada', className: 'bg-rose-50 text-rose-700 ring-rose-200', icon: Ban },
  no_show: { label: 'No asistió', className: 'bg-slate-100 text-slate-700 ring-slate-300', icon: UserX },
}
