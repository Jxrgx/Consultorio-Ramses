import clsx from 'clsx'
import { Ban, ChevronDown, CircleCheckBig, LoaderCircle, MessageCircle } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PSYCHOLOGIST } from '../../config'
import type { AdminStatus, Appointment } from '../../services/api'
import { dateInZone, formatLongDate, formatTime } from '../../utils/dates'
import { STATUS_STYLES } from './statusStyles'

const MENU_STATUSES: AdminStatus[] = ['confirmed', 'completed', 'no_show', 'cancelled']

function whatsappUrl(appointment: Appointment, timeZone: string): string {
  const name = appointment.patient.full_name.split(' ')[0]
  const day = formatLongDate(dateInZone(appointment.start_time, timeZone)).toLowerCase()
  const time = formatTime(appointment.start_time, timeZone)
  const mode = appointment.type === 'online' ? 'en línea' : 'presencial'
  const messages: Record<Appointment['status'], string> = {
    pending: `Hola ${name}, te escribo del consultorio del ${PSYCHOLOGIST.name} para confirmar tu cita ${mode} del ${day} a las ${time}, ¿nos confirmas tu asistencia?`,
    confirmed: `Hola ${name}, te recordamos tu cita ${mode} con el ${PSYCHOLOGIST.name} el ${day} a las ${time}, ¡te esperamos!`,
    completed: `Hola ${name}, gracias por tu sesión. Si quieres agendar la siguiente, con gusto te ayudamos.`,
    no_show: `Hola ${name}, te esperábamos en tu cita de las ${time}, ¿todo bien? Si quieres reagendar, avísanos.`,
    cancelled: `Hola ${name}, tu cita del ${day} a las ${time} quedó cancelada. ¿Te gustaría reagendarla?`,
  }
  // wa.me espera el número con código de país y sin "+" ni espacios
  const phone = appointment.patient.phone.replace(/\D/g, '')
  return `https://wa.me/${phone}?text=${encodeURIComponent(messages[appointment.status])}`
}

interface AppointmentActionsProps {
  appointment: Appointment
  timeZone: string
  busy: boolean
  onChangeStatus: (status: AdminStatus) => void
}

export function AppointmentActions({ appointment, timeZone, busy, onChangeStatus }: AppointmentActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const isCancelled = appointment.status === 'cancelled'
  const isActive = appointment.status === 'pending' || appointment.status === 'confirmed'

  function choose(status: AdminStatus) {
    setMenuOpen(false)
    if (status === 'cancelled') setConfirmingCancel(true)
    else onChangeStatus(status)
  }

  if (confirmingCancel) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-rose-50 p-4 text-sm ring-1 ring-rose-200 sm:flex-row sm:items-center">
        <span className="flex-1 leading-relaxed text-rose-800">¿Cancelar esta cita? Se eliminará de Google Calendar y el horario quedará libre.</span>
        <button
          type="button"
          onClick={() => setConfirmingCancel(false)}
          className="h-12 rounded-xl px-5 font-medium text-slate-600 hover:bg-white"
        >
          No
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirmingCancel(false)
            onChangeStatus('cancelled')
          }}
          className="h-12 rounded-xl bg-rose-600 px-5 font-medium text-white hover:bg-rose-700"
        >
          Sí, cancelar
        </button>
      </div>
    )
  }

  return (
    // Cuadrícula de 2 columnas en móvil: botones anchos y fáciles de tocar con el pulgar
    <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
      <a
        href={whatsappUrl(appointment, timeZone)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-4 text-sm font-medium text-white hover:bg-[#1ebe5a]"
      >
        <MessageCircle className="size-4" /> WhatsApp
      </a>

      {isActive && (
        <>
          <ActionButton onClick={() => onChangeStatus('completed')} disabled={busy} className="text-sky-700 ring-sky-200 hover:bg-sky-50">
            <CircleCheckBig className="size-4" /> Completada
          </ActionButton>
          <ActionButton onClick={() => setConfirmingCancel(true)} disabled={busy} className="text-rose-700 ring-rose-200 hover:bg-rose-50">
            <Ban className="size-4" /> Cancelar
          </ActionButton>
        </>
      )}

      {!isCancelled && (
        <div ref={menuRef} className="relative">
          <ActionButton
            onClick={() => setMenuOpen((open) => !open)}
            disabled={busy}
            className="text-slate-700 ring-slate-200 hover:bg-slate-50"
            ariaExpanded={menuOpen}
          >
            Cambiar estado <ChevronDown className="size-4" />
          </ActionButton>
          {menuOpen && (
            <ul
              role="menu"
              className="absolute right-0 z-10 mt-2 w-64 rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200 sm:right-auto sm:left-0"
            >
              {MENU_STATUSES.filter((s) => s !== appointment.status).map((status) => {
                const { label, icon: Icon } = STATUS_STYLES[status]
                return (
                  <li key={status}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => choose(status)}
                      className={clsx(
                        'flex h-12 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-slate-50',
                        status === 'cancelled' ? 'text-rose-700' : 'text-slate-700',
                      )}
                    >
                      <Icon className="size-4" /> {label}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {busy && <LoaderCircle className="col-span-2 mx-auto size-5 animate-spin text-slate-400 sm:col-span-1" aria-label="Actualizando" />}
    </div>
  )
}

interface ActionButtonProps {
  children: ReactNode
  onClick: () => void
  disabled: boolean
  className: string
  ariaExpanded?: boolean
}

function ActionButton({ children, onClick, disabled, className, ariaExpanded }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={ariaExpanded}
      className={clsx(
        'inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-sm font-medium whitespace-nowrap ring-1 transition disabled:opacity-50 sm:w-auto',
        className,
      )}
    >
      {children}
    </button>
  )
}
