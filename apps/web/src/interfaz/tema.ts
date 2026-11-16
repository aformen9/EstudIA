import type { Tema } from "@estudia/core";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { prefiereMenosMovimiento } from "./efectos";
import { avisarCambio, suscribirPreferencias, useGuardarPreferencia } from "./preferencias";

export type { Tema };

/**
 * El script de `index.html` lee esta misma clave antes de pintar, para que el tema no parpadee. Sin
 * nada guardado (primera visita) el tema es oscuro: `<html data-theme="dark">`.
 */
const CLAVE_TEMA = "estudia.theme";

/** Color de la barra del navegador, igual a `--bg` de cada tema en styles.css. */
export const COLOR_BARRA: Record<Tema, string> = { dark: "#0f1115", light: "#f6f7f9" };

export function temaActual(): Tema {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** En el dispositivo: lo pinta y guarda la copia local. Subirlo al perfil es aparte. */
export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.theme = tema;
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin localStorage (modo privado) el tema dura hasta recargar.
  }
  document.getElementById("themeColor")?.setAttribute("content", COLOR_BARRA[tema]);
  avisarCambio();
}

export function useTema(): { tema: Tema; alternar: () => void } {
  const tema = useSyncExternalStore(suscribirPreferencias, temaActual);
  const guardar = useGuardarPreferencia();

  function alternar() {
    const siguiente: Tema = tema === "dark" ? "light" : "dark";
    const cambiar = () => flushSync(() => aplicarTema(siguiente));
    if (typeof document.startViewTransition === "function" && !prefiereMenosMovimiento()) {
      document.startViewTransition(cambiar);
    } else {
      cambiar();
    }
    guardar({ tema: siguiente });
  }

  return { tema, alternar };
}
