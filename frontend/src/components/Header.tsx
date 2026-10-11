import { Clock, HeartHandshake, LockKeyhole, Video } from 'lucide-react'
import { Link } from 'react-router'
import { PSYCHOLOGIST } from '../config'

export function Header() {
  return (
    <header className="bg-gradient-to-br from-teal-700 to-teal-900 text-white">
      <div className="mx-auto max-w-3xl px-4 pt-4 pb-20 sm:px-6">
        <div className="mb-6 flex justify-end">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-teal-100 hover:bg-white/10 hover:text-white"
          >
            <LockKeyhole className="size-3.5" /> Acceso psicólogo
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <div
            aria-hidden
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl font-semibold ring-2 ring-white/30"
          >
            {PSYCHOLOGIST.initials}
          </div>
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">{PSYCHOLOGIST.name}</h1>
            <p className="text-teal-100">{PSYCHOLOGIST.specialty}</p>
          </div>
        </div>

        <p className="mt-6 max-w-xl text-teal-50">
          Bienvenido/a. Agenda tu sesión en unos pasos: elige la modalidad, el día y la hora que mejor te
          acomoden.
        </p>

        <ul className="mt-5 flex flex-wrap gap-2 text-sm">
          <li className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
            <Clock className="size-4" /> Sesiones de 50 min
          </li>
          <li className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
            <Video className="size-4" /> Presencial o en línea
          </li>
          <li className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
            <HeartHandshake className="size-4" /> Espacio confidencial
          </li>
        </ul>
      </div>
    </header>
  )
}
