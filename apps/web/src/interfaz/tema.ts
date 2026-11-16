import { useState } from "react";
import { flushSync } from "react-dom";
import { prefiereMenosMovimiento } from "./efectos";

export type Tema = "light" | "dark";

/**
 * El script de `index.html` lee esta misma clave antes de pintar, para que el tema no parpadee. Sin
 * nada guardado (primera visita) el tema es oscuro: `<html data-theme="dark">`.
 */
const CLAVE_TEMA = "estudia.theme";

/** Color de la barra del navegador, igual a `--bg` de cada tema en styles.css. */
export const COLOR_BARRA: Record<Tema, string> = { dark: "#0f1115", light: "#f6f7f9" };

function aplicarTema(tema: Tema) {
  document.documentElement.dataset.theme = tema;
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin localStorage (modo privado) el tema dura hasta recargar.
  }
  document.getElementById("themeColor")?.setAttribute("content", COLOR_BARRA[tema]);
}

export function useTema(): { tema: Tema; alternar: () => void } {
  const [tema, setTema] = useState<Tema>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  function alternar() {
    const siguiente: Tema = tema === "dark" ? "light" : "dark";
    const cambiar = () => {
      aplicarTema(siguiente);
      flushSync(() => setTema(siguiente));
    };
    if (typeof document.startViewTransition === "function" && !prefiereMenosMovimiento()) {
      document.startViewTransition(cambiar);
    } else {
      cambiar();
    }
  }

  return { tema, alternar };
}
