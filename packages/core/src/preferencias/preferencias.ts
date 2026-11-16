/**
 * Acento y modo claro/oscuro del alumno. Viven en el dispositivo (para pintar sin parpadeo) y en el
 * perfil (para que viajen entre dispositivos). Los mismos valores valida la base: migración
 * 20261116190000_preferencias_en_perfil.sql.
 */
export const ACENTOS = ["azul", "rosa", "violeta", "verde", "naranja"] as const;
export type Acento = (typeof ACENTOS)[number];

export const TEMAS = ["light", "dark"] as const;
export type Tema = (typeof TEMAS)[number];

/** Lo que se ve en la primera visita, sin nada guardado. */
export const PREFERENCIAS_POR_DEFECTO: Preferencias = { acento: "azul", tema: "dark" };

export interface Preferencias {
  acento: Acento;
  tema: Tema;
}

/** Lo que tiene el perfil: `null` si el alumno todavía no eligió nada. */
export interface PreferenciasGuardadas {
  acento: Acento | null;
  tema: Tema | null;
}

export function esAcento(valor: unknown): valor is Acento {
  return typeof valor === "string" && (ACENTOS as readonly string[]).includes(valor);
}

export function esTema(valor: unknown): valor is Tema {
  return typeof valor === "string" && (TEMAS as readonly string[]).includes(valor);
}

/**
 * Al entrar con sesión: lo guardado en el perfil gana y se aplica en el dispositivo; lo que el perfil
 * no tiene se sube desde el dispositivo. Cada preferencia se decide por separado.
 */
export function resolverPreferencias(
  local: Preferencias,
  perfil: PreferenciasGuardadas,
): { aplicar: Partial<Preferencias>; subir: Partial<Preferencias> } {
  const aplicar: Partial<Preferencias> = {};
  const subir: Partial<Preferencias> = {};

  if (perfil.acento === null) subir.acento = local.acento;
  else if (perfil.acento !== local.acento) aplicar.acento = perfil.acento;

  if (perfil.tema === null) subir.tema = local.tema;
  else if (perfil.tema !== local.tema) aplicar.tema = perfil.tema;

  return { aplicar, subir };
}
