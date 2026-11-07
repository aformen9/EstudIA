/**
 * Los límites de `registrar_documento` (arquitectura §7). Cada SQLSTATE dice qué pasó y este texto le
 * explica al alumno qué puede hacer. Reintentar no cambia el resultado: quien lo recibe no ofrece
 * reintentar, y no es un problema de conexión.
 */
const MENSAJES = {
  EQ001:
    "tiene demasiado texto para guardarlo (el máximo es de unos 2 MB de texto). Probá dividirlo en archivos más chicos y subirlos por separado.",
  EQ002:
    "no se guardó porque llegaste al límite de espacio de tu cuenta (unos 50 MB). Borrar material no libera ese espacio. Todo lo que ya tenés sigue guardado, y podés seguir agregando links y notas.",
  EQ003:
    "pesa más de 50 MB, que es el máximo por archivo. Probá comprimirlo o dividirlo en partes más chicas.",
  // Los topes de `materiales`: se leen después del título.
  materiales_titulo_largo: "tiene un título demasiado largo (el máximo es de 200 caracteres).",
  materiales_url_largo: "tiene un link demasiado largo (el máximo es de 2048 caracteres).",
  materiales_texto_largo:
    "es una nota demasiado larga (el máximo es de unos 50 KB de texto). Probá dividirla en notas más cortas.",
  EQ004:
    "no se guardó porque su tipo de archivo tiene un nombre demasiado largo. Probá guardarlo en otro formato, como PDF.",
} as const;

export type CodigoDeLimite = keyof typeof MENSAJES;

/** Su `message` se lee después del nombre del archivo: `"apunte.pdf" pesa más de 50 MB…`. */
export class LimiteDeDocumento extends Error {
  readonly codigo: CodigoDeLimite;

  constructor(codigo: CodigoDeLimite) {
    super(MENSAJES[codigo]);
    this.name = "LimiteDeDocumento";
    this.codigo = codigo;
  }
}

export function errorDeLimite(
  error: { code?: string; message?: string } | null,
): LimiteDeDocumento | null {
  // Un CHECK viola siempre con 23514: lo que dice cuál fue es el nombre, en el mensaje.
  const tope =
    error?.code === "23514"
      ? Object.keys(MENSAJES).find((clave) => error.message?.includes(clave))
      : undefined;
  const codigo = tope ?? error?.code;
  return codigo !== undefined && codigo in MENSAJES
    ? new LimiteDeDocumento(codigo as CodigoDeLimite)
    : null;
}
