import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface VariablesSupabase {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface Conexion {
  cliente: SupabaseClient;
  url: string;
}

function urlValida(url: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Null si faltan variables o la URL no sirve: la app avisa en vez de romperse al arrancar. */
export function crearConexion(variables: VariablesSupabase): Conexion | null {
  const url = variables.VITE_SUPABASE_URL?.trim();
  const clave = variables.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !clave || !urlValida(url)) return null;
  return {
    url,
    cliente: createClient(url, clave, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Con PKCE, Google vuelve con `?code=` y no toca el hash, que es de la navegación.
        flowType: "pkce",
      },
    }),
  };
}
