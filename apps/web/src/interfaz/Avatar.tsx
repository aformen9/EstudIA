import type { User } from "@supabase/supabase-js";
import { useState } from "react";

function esHttps(candidata: unknown): candidata is string {
  if (typeof candidata !== "string") return false;
  try {
    return new URL(candidata).protocol === "https:";
  } catch {
    return false;
  }
}

/** Las fotos de Google, en orden y solo https: cualquier otra cosa no llega a un `src`. */
export function fotosDeUsuario(metadatos: User["user_metadata"] | undefined): string[] {
  const candidatas: unknown[] = [metadatos?.avatar_url, metadatos?.picture];
  return [...new Set(candidatas.filter(esHttps))];
}

/**
 * Decorativo: el nombre está al lado. `no-referrer` porque Google suele rechazar la imagen si recibe
 * el origen de la app. Si una foto no carga se prueba con la siguiente, y al final queda la inicial.
 */
export function Avatar({ nombre, fotos }: { nombre: string; fotos: string[] }) {
  const [fallidas, setFallidas] = useState<string[]>([]);
  const foto = fotos.find((candidata) => !fallidas.includes(candidata));
  return (
    <span className="avatar" aria-hidden="true">
      {foto ? (
        <img
          key={foto}
          src={foto}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFallidas((anteriores) => [...anteriores, foto])}
        />
      ) : (
        nombre.charAt(0).toUpperCase()
      )}
    </span>
  );
}
