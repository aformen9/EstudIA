/**
 * Login de prueba contra Supabase local (decisión de Agu, ver docs/decisiones.md). Este módulo solo
 * se carga dentro de `if (import.meta.env.DEV)` en `Login.tsx`, y `loginDePrueba.build.test.ts`
 * comprueba que no llega al build de producción. Usuario inventado: se crea con signup la primera vez.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";

export const EMAIL_DE_PRUEBA = "alumno.prueba@estudia.test";
export const PASSWORD_DE_PRUEBA = "usuario-inventado-solo-local";
export const TEXTO_DEL_BOTON = "Entrar con el usuario de prueba";
const NOMBRE_DE_PRUEBA = "Alumno de Prueba";

/** Compara el host exacto: `http://localhost.ejemplo.com` o `http://127.0.0.1.ejemplo.com` no son locales. */
export function urlEsLocal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

export async function entrarConUsuarioDePrueba(
  cliente: SupabaseClient,
  url: string,
): Promise<void> {
  if (!urlEsLocal(url)) {
    throw new Error("El login de prueba solo funciona contra Supabase local.");
  }

  const credenciales = { email: EMAIL_DE_PRUEBA, password: PASSWORD_DE_PRUEBA };
  const ingreso = await cliente.auth.signInWithPassword(credenciales);
  if (!ingreso.error) return;
  if (ingreso.error.code !== "invalid_credentials") throw new Error(ingreso.error.message);

  const alta = await cliente.auth.signUp({
    ...credenciales,
    options: { data: { full_name: NOMBRE_DE_PRUEBA } },
  });
  if (alta.error) throw new Error(alta.error.message);
  if (!alta.data.session) {
    throw new Error("Supabase local no devolvió una sesión: revisá enable_confirmations.");
  }
}

export interface PropsLoginDePrueba {
  cliente: SupabaseClient;
  url: string;
}

export default function LoginDePrueba({ cliente, url }: PropsLoginDePrueba) {
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!urlEsLocal(url)) return null;

  async function entrar() {
    setEntrando(true);
    setError(null);
    try {
      await entrarConUsuarioDePrueba(cliente, url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEntrando(false);
    }
  }

  return (
    <>
      <button className="btn" type="button" onClick={entrar} disabled={entrando}>
        {TEXTO_DEL_BOTON}
      </button>
      <p className="sub">Solo en desarrollo, contra Supabase local.</p>
      {error && (
        <div className="msg err" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
