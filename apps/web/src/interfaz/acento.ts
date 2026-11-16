import { useState } from "react";

/** Colores de acento para elegir en Ajustes. Azul es el de `:root` en styles.css; los demás, `[data-accent]`. */
export const ACENTOS = ["azul", "rosa", "violeta", "verde", "naranja"] as const;
export type Acento = (typeof ACENTOS)[number];

/** El script de `index.html` lee esta misma clave antes de pintar, para que el acento no parpadee. */
const CLAVE_ACENTO = "estudia.acento";

export function esAcento(valor: unknown): valor is Acento {
  return typeof valor === "string" && (ACENTOS as readonly string[]).includes(valor);
}

export function acentoActual(): Acento {
  const valor = document.documentElement.dataset.accent;
  return esAcento(valor) ? valor : "azul";
}

export function aplicarAcento(acento: Acento) {
  if (acento === "azul") delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = acento;
  try {
    localStorage.setItem(CLAVE_ACENTO, acento);
  } catch {
    // Sin localStorage (modo privado) el acento dura hasta recargar.
  }
}

export function useAcento(): { acento: Acento; elegir: (acento: Acento) => void } {
  const [acento, setAcento] = useState<Acento>(acentoActual);
  function elegir(siguiente: Acento) {
    aplicarAcento(siguiente);
    setAcento(siguiente);
  }
  return { acento, elegir };
}
