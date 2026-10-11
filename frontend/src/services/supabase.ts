import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// null si falta la configuración: el login muestra un aviso en lugar de romper toda la app
// (el portal del paciente no necesita Supabase Auth).
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

export const SUPABASE_CONFIG_ERROR =
  'Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en frontend/.env'

/** Access token vigente de la sesión (supabase-js lo renueva si está por expirar). */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
