/**
 * Por qué la base rechazó un reporte, en palabras para el alumno. Reintentar no cambia el resultado
 * (no es un problema de conexión), así que quien lo recibe no ofrece reintentar.
 */
const MENSAJES = {
  EQ005: "Llegaste al máximo de 5 reportes por día. Probá de nuevo mañana.",
  // Los CHECK de la tabla: se reconocen por el nombre, en el mensaje.
  reportes_texto_largo: "El texto tiene que tener entre 1 y 1000 caracteres.",
} as const;

export class ErrorDeReporte extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeReporte";
  }
}

export function errorDeReporte(
  error: { code?: string; message?: string } | null,
): ErrorDeReporte | null {
  if (!error) return null;
  if (error.code === "EQ005") return new ErrorDeReporte(MENSAJES.EQ005);
  if (error.code === "23514" && error.message?.includes("reportes_texto_largo")) {
    return new ErrorDeReporte(MENSAJES.reportes_texto_largo);
  }
  return null;
}
