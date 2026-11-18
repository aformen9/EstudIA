import type { TipoReporte } from "@estudia/core";

/**
 * Analítica con Umami Cloud (plan gratis, sin cookies; decisión del 2026-11-16). Solo en producción y
 * solo en el dominio de producción: si el dominio cambia, actualizarlo acá y en el panel de Umami
 * (README). Nunca se mandan ids, mails, nombres ni datos de materias: los eventos tienen tipos
 * cerrados y no aceptan texto libre.
 */
export const UMAMI = {
  script: "https://cloud.umami.is/script.js",
  sitio: "5148073e-39e9-406c-9b71-42fe3abb7f00",
  dominio: "estudia-liard.vercel.app",
} as const;

export type PasoOnboarding =
  | "universidad"
  | "carrera"
  | "plan"
  | "carga_elegir"
  | "carga_grilla"
  | "carga_importar"
  | "terminado";

export type Evento =
  | { nombre: "onboarding"; datos: { paso: PasoOnboarding } }
  | { nombre: "importar_respaldo"; datos: { resultado: "ok" | "error" } }
  | { nombre: "reportar"; datos: { tipo: TipoReporte } };

interface CargaUtil {
  website: string;
  url?: string;
  title?: string;
  [clave: string]: unknown;
}

interface Umami {
  track(nombre: string, datos?: Record<string, string>): void;
  track(armar: (base: CargaUtil) => CargaUtil): void;
}

declare global {
  interface Window {
    umami?: Umami;
  }
}

export interface Entorno {
  produccion: boolean;
  dominio: string;
  /** `navigator.doNotTrack` o `window.doNotTrack`: "1" (o "yes" en navegadores viejos) es que no. */
  noRastrear: string | null | undefined;
}

export function debeMedir({ produccion, dominio, noRastrear }: Entorno): boolean {
  return produccion && dominio === UMAMI.dominio && noRastrear !== "1" && noRastrear !== "yes";
}

function entornoActual(): Entorno {
  return {
    produccion: import.meta.env.PROD,
    dominio: window.location.hostname,
    noRastrear:
      navigator.doNotTrack ?? (window as Window & { doNotTrack?: string }).doNotTrack ?? null,
  };
}

/** La visita que llegó antes que el script, y la última mandada (para no repetirla). */
let pendiente: { ruta: string; titulo: string } | null = null;
let ultimaRuta: string | null = null;

/**
 * Agrega el script de Umami si corresponde. Las visitas se mandan a mano (`registrarVisita`): la app
 * navega con `location.hash`, que el script no detecta. Al cargar manda la que quedó pendiente.
 */
export function cargarAnalitica(entorno: Entorno = entornoActual()) {
  if (!debeMedir(entorno) || document.querySelector(`script[src="${UMAMI.script}"]`)) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = UMAMI.script;
  script.dataset.websiteId = UMAMI.sitio;
  // Además del chequeo de arriba: el script mismo se niega fuera del dominio o con Do Not Track.
  script.dataset.domains = UMAMI.dominio;
  script.dataset.doNotTrack = "true";
  script.dataset.autoPageview = "false";
  script.dataset.excludeSearch = "true";
  script.addEventListener("load", () => {
    if (pendiente) registrarVisita(pendiente.ruta, pendiente.titulo);
  });
  document.head.append(script);
}

/** Una página vista: la ruta es la vista ("/materias"), sin nada del alumno. */
export function registrarVisita(ruta: string, titulo: string) {
  if (!window.umami) {
    pendiente = { ruta, titulo };
    return;
  }
  pendiente = null;
  if (ruta === ultimaRuta) return;
  ultimaRuta = ruta;
  window.umami.track((base) => ({ ...base, url: `/${ruta}`, title: titulo }));
}

/** Solo para los tests. */
export function reiniciarAnalitica() {
  pendiente = null;
  ultimaRuta = null;
}

export function registrarEvento(evento: Evento) {
  window.umami?.track(evento.nombre, evento.datos);
}
