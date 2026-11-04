import type { PlanCompleto } from "../tipos";
import { importarLegacy } from "./legacy";
import { FORMATO_RESPALDO, leerRespaldo } from "./respaldo";
import type { ErrorImportacion, RespaldoLeido } from "./tipos";

export type FormatoRespaldo = "legacy" | "nuevo";

/** Reconoce el formato de un archivo ya parseado. Null si no es ningún respaldo conocido. */
export function detectarFormatoRespaldo(json: unknown): FormatoRespaldo | null {
  if (typeof json !== "object" || json === null) return null;
  if ("formato" in json) return json.formato === FORMATO_RESPALDO ? "nuevo" : null;
  return "materias" in json && Array.isArray(json.materias) ? "legacy" : null;
}

/** Pasa el texto del archivo a JSON, con un mensaje claro si no se puede. */
export function parsearArchivo(texto: string): { ok: true; json: unknown } | ErrorImportacion {
  try {
    return { ok: true, json: JSON.parse(texto) };
  } catch {
    return { ok: false, error: "El archivo no es un JSON válido." };
  }
}

export type ResultadoArchivo =
  | (RespaldoLeido & {
      formato: FormatoRespaldo;
    })
  | ErrorImportacion;

/** Entrada única de la UI: detecta el formato y lo lee. En legacy, `materiales` queda vacío. */
export function importarArchivo(json: unknown, plan: PlanCompleto): ResultadoArchivo {
  const formato = detectarFormatoRespaldo(json);
  if (formato === null) {
    return {
      ok: false,
      error: "El archivo no parece un respaldo de EstudIA ni de Mi Plan de Estudio.",
    };
  }
  if (formato === "nuevo") {
    const resultado = leerRespaldo(json, plan);
    return resultado.ok ? { ...resultado, formato } : resultado;
  }
  const resultado = importarLegacy(json, plan);
  return resultado.ok ? { ...resultado, materiales: [], formato } : resultado;
}
