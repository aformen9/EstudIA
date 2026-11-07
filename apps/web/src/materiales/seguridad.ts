const PROTOCOLOS_DE_LINK = new Set(["http:", "https:"]);

/**
 * La URL lista para un `href`, o null si no es http(s). Se usa también al mostrar: lo que hay en la
 * base pudo haber llegado por otra vía, y un `javascript:` en un `href` ejecutaría código.
 */
export function urlSegura(url: string): string | null {
  try {
    const leida = new URL(url);
    return PROTOCOLOS_DE_LINK.has(leida.protocol) ? leida.href : null;
  } catch {
    return null;
  }
}

/** Lo que escribe el alumno: sin protocolo se asume https, y cualquier otro protocolo se rechaza. */
export function normalizarUrlIngresada(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  // "ejemplo.com:8080" no tiene protocolo: después de los dos puntos viene un puerto.
  const tieneProtocolo = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(limpio);
  return urlSegura(tieneProtocolo ? limpio : `https://${limpio}`);
}

const TIPOS_QUE_SE_ABREN = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
]);

/**
 * El tipo con el que se puede abrir un archivo en una pestaña, o null si hay que descargarlo. Un blob
 * se abre en el origen de la app: un HTML o un SVG subido ejecutaría sus scripts con la sesión del
 * alumno. Por eso es una lista de lo permitido y no de lo prohibido.
 */
export function tipoQueSePuedeAbrir(mime: string | null): string | null {
  const tipo = mime?.split(";")[0]?.trim().toLowerCase() ?? "";
  return TIPOS_QUE_SE_ABREN.has(tipo) ? tipo : null;
}
