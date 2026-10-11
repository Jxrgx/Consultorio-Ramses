import clsx from 'clsx'
import { Building2, Video } from 'lucide-react'
import type { AppointmentStatus, AppointmentType } from '../../services/api'
import { STATUS_STYLES } from './statusStyles'

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, className, icon: Icon } = STATUS_STYLES[status]
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1', className)}>
      <Icon className="size-3.5" />
      {label}
    </span>
  )
}

export function TypeBadge({ type }: { type: AppointmentType }) {
  const online = type === 'online'
  const Icon = online ? Video : Building2
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
        online ? 'bg-violet-50 text-violet-800 ring-violet-200' : 'bg-teal-50 text-teal-800 ring-teal-200',
      )}
    >
      <Icon className="size-3.5" />
      {online ? 'En Línea' : 'Presencial'}
    </span>
  )
}
