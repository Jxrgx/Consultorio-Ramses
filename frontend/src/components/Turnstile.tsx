import { useEffect, useRef } from 'react'
import { TURNSTILE_SITE_KEY } from '../config'

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string
      action?: string
      language?: string
      size?: 'normal' | 'flexible' | 'compact'
      theme?: 'light' | 'dark' | 'auto'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile no cargó')))
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('No se pudo cargar Turnstile'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

interface TurnstileProps {
  // null cuando el token vence o falla: el formulario no debe enviarse sin token
  onToken: (token: string | null) => void
  // Cambiarlo vuelve a montar el widget (cada token sirve una sola vez)
  resetKey: number
}

/** Verificación anti-bots de Cloudflare. Solo se usa si VITE_TURNSTILE_SITE_KEY está configurada. */
export function Turnstile({ onToken, resetKey }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onTokenRef = useRef(onToken)
  useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

  useEffect(() => {
    let widgetId: string | null = null
    let cancelled = false
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return
        widgetId = turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action: 'book',
          language: 'es',
          size: 'flexible',
          // El portal es claro: sin esto Cloudflare usa el tema oscuro del sistema
          theme: 'light',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(() => onTokenRef.current(null))
    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [resetKey])

  return <div ref={containerRef} className="min-h-[65px]" />
}
