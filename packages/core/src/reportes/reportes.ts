/**
 * Reportes de problemas y sugerencias (decisión del 2026-11-16). Los topes los aplica la base
 * (migración 20261117120000_metricas_y_reportes.sql); acá están para que la pantalla avise antes.
 */
export const TIPOS_REPORTE = ["problema", "sugerencia"] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];

/** Caracteres, sin contar los espacios del principio y del final. */
export const TEXTO_REPORTE_MAX = 1000;
/** Por alumno, cada 24 horas corridas. */
export const REPORTES_POR_DIA = 5;

export interface NuevoReporte {
  tipo: TipoReporte;
  texto: string;
  /** Desde qué vista se reportó, por ejemplo "materiales". */
  vista: string | null;
  /** Si es true, el admin ve el mail de quien reportó. */
  contactable: boolean;
  navegador: string | null;
  sistema: string | null;
  versionApp: string | null;
}

/** Lo que ve el admin: sin identidad, salvo el mail si el alumno marcó que lo pueden contactar. */
export interface ReporteAdmin {
  id: string;
  createdAt: string;
  tipo: TipoReporte;
  texto: string;
  vista: string | null;
  contacto: string | null;
  navegador: string | null;
  sistema: string | null;
  versionApp: string | null;
}

export type TextoReporte =
  { valido: true; texto: string } | { valido: false; motivo: "vacio" | "largo"; largo: number };

/** Igual que el CHECK de la base: se recortan las puntas y se cuentan caracteres, no bytes. */
export function largoTextoReporte(texto: string): number {
  return [...texto.trim()].length;
}

export function validarTextoReporte(texto: string): TextoReporte {
  const largo = largoTextoReporte(texto);
  if (largo === 0) return { valido: false, motivo: "vacio", largo };
  if (largo > TEXTO_REPORTE_MAX) return { valido: false, motivo: "largo", largo };
  return { valido: true, texto: texto.trim() };
}
