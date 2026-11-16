import { esAcento, type Acento } from "@estudia/core";
import { useSyncExternalStore } from "react";
import { avisarCambio, suscribirPreferencias, useGuardarPreferencia } from "./preferencias";

export { ACENTOS, esAcento, type Acento } from "@estudia/core";

/** El script de `index.html` lee esta misma clave antes de pintar, para que el acento no parpadee. */
const CLAVE_ACENTO = "estudia.acento";

export function acentoActual(): Acento {
  const valor = document.documentElement.dataset.accent;
  return esAcento(valor) ? valor : "azul";
}

/** En el dispositivo: azul es el de `:root`; los demás, `[data-accent]` en styles.css. */
export function aplicarAcento(acento: Acento) {
  if (acento === "azul") delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = acento;
  try {
    localStorage.setItem(CLAVE_ACENTO, acento);
  } catch {
    // Sin localStorage (modo privado) el acento dura hasta recargar.
  }
  avisarCambio();
}

export function useAcento(): { acento: Acento; elegir: (acento: Acento) => void } {
  const acento = useSyncExternalStore(suscribirPreferencias, acentoActual);
  const guardar = useGuardarPreferencia();
  function elegir(siguiente: Acento) {
    aplicarAcento(siguiente);
    guardar({ acento: siguiente });
  }
  return { acento, elegir };
}
