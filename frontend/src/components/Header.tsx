import { Clock, HeartHandshake, LockKeyhole, Video } from 'lucide-react'
import { Link } from 'react-router'
import { PSYCHOLOGIST } from '../config'

export function Header() {
  return (
    <header className="bg-gradient-to-br from-teal-700 to-teal-900 text-white">
      {/* En móvil solo avatar, nombre y especialidad: la tarjeta de reserva queda a la vista sin scroll */}
      <div className="mx-auto max-w-3xl px-5 pt-4 pb-16 sm:px-6 md:pb-20">
        <div className="flex items-center justify-between gap-3 md:mb-6 md:justify-end">
          <div className="flex min-w-0 items-center gap-3 md:hidden">
            <Avatar className="size-12 text-base" />
            <PsychologistName />
          </div>
          <Link
            to="/admin"
            aria-label="Acceso psicólogo"
            className="inline-flex size-12 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm text-teal-100 hover:bg-white/10 hover:text-white md:h-10 md:w-auto md:px-4 md:text-xs"
          >
            <LockKeyhole className="size-5 md:size-3.5" />
            <span className="hidden md:inline">Acceso psicólogo</span>
          </Link>
        </div>

        <div className="hidden items-center gap-5 md:flex">
          <Avatar className="size-16 text-xl" />
          <PsychologistName />
        </div>

        <p className="mt-6 hidden max-w-xl leading-relaxed text-teal-50 md:block">
          Bienvenido/a. Agenda tu sesión en unos pasos: elige la modalidad, el día y la hora que mejor te
          acomoden.
        </p>

        <ul className="mt-5 hidden flex-wrap gap-2 text-sm md:flex">
          <li className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <Clock className="size-4" /> Sesiones de 50 min
          </li>
          <li className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <Video className="size-4" /> Presencial o en línea
          </li>
          <li className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <HeartHandshake className="size-4" /> Espacio confidencial
          </li>
        </ul>
      </div>
    </header>
  )
}

function Avatar({ className }: { className: string }) {
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-white/15 font-semibold ring-2 ring-white/30 ${className}`}
    >
      {PSYCHOLOGIST.initials}
    </div>
  )
}

function PsychologistName() {
  return (
    <div className="min-w-0">
      <h1 className="truncate text-xl font-semibold tracking-tight md:text-3xl">{PSYCHOLOGIST.name}</h1>
      <p className="truncate text-sm text-teal-100 md:text-base">{PSYCHOLOGIST.specialty}</p>
    </div>
  )
}
