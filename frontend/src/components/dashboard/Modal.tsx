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
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div className="absolute inset-0" onClick={() => !locked && onClose()} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto p-5 text-sm text-slate-700">{children}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 p-4">{footer}</div>
      </div>
    </div>
  )
}
