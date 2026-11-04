import { useState } from "react";
import { flushSync } from "react-dom";
import { prefiereMenosMovimiento } from "./efectos";

export type Tema = "light" | "dark";

/** El script de `index.html` lee esta misma clave antes de pintar, para que el tema no parpadee. */
const CLAVE_TEMA = "estudia.theme";

function aplicarTema(tema: Tema) {
  document.documentElement.dataset.theme = tema;
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin localStorage (modo privado) el tema dura hasta recargar.
  }
  document
    .getElementById("themeColor")
    ?.setAttribute("content", tema === "dark" ? "#130c13" : "#fff7fb");
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
