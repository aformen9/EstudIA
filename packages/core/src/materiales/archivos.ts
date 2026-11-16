/**
 * Qué se puede mostrar de un archivo. Se decide por la extensión y, si no alcanza, por el tipo que dio
 * el navegador: un `.py` o un `.md` suelen llegar sin tipo.
 */
export type ClaseDeArchivo = "pdf" | "imagen" | "heic" | "texto" | "otro";

const IMAGENES = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp"]);
const HEIC = new Set(["heic", "heif"]);
const TEXTO = new Set(["txt", "md", "csv", "py"]);

export function extensionDe(nombre: string): string {
  const partes = nombre.toLowerCase().split(".");
  return partes.length > 1 ? (partes.pop() ?? "") : "";
}

/**
 * SVG y HTML quedan en "otro" a propósito: se abrirían en el origen de la app y sus scripts correrían
 * con la sesión del alumno.
 */
export function clasificarArchivo(nombre: string, mime: string | null): ClaseDeArchivo {
  const extension = extensionDe(nombre);
  const tipo = mime?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (extension === "pdf" || (!extension && tipo === "application/pdf")) return "pdf";
  if (HEIC.has(extension)) return "heic";
  if (IMAGENES.has(extension)) return "imagen";
  if (TEXTO.has(extension)) return "texto";
  if (extension) return "otro";
  if (tipo === "image/heic" || tipo === "image/heif") return "heic";
  if (tipo.startsWith("image/") && tipo !== "image/svg+xml" && tipo !== "image/tiff") {
    return "imagen";
  }
  if (tipo === "text/plain" || tipo === "text/markdown" || tipo === "text/csv") return "texto";
  return "otro";
}

/** La etiqueta de la tarjeta: "PDF", "DOCX". Sin extensión, "Archivo". */
export function etiquetaDeArchivo(nombre: string): string {
  const extension = extensionDe(nombre);
  return extension && extension.length <= 5 ? extension.toUpperCase() : "Archivo";
}
