import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  // Botones del pie
  footer: ReactNode
  onClose: () => void
  // Mientras se procesa algo no se puede cerrar con Escape ni con el fondo
  locked?: boolean
}

export function Modal({ title, children, footer, onClose, locked = false }: ModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !locked && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [locked, onClose])

  return (
    // En móvil se abre como hoja inferior a todo el ancho; en escritorio, centrado
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-6">
      <div className="absolute inset-0" onClick={() => !locked && onClose()} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl ring-1 ring-slate-200 focus:outline-none sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 pr-3 pl-6">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Cerrar"
            className="flex size-12 items-center justify-center rounded-full text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-40"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto p-6 text-sm leading-relaxed text-slate-700">{children}</div>
        {/* En móvil, botones a todo el ancho con la acción principal arriba (igual que el formulario de reserva) */}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:pb-4 [&>*]:h-12 [&>*]:justify-center">
          {footer}
        </div>
      </div>
    </div>
  )
}
