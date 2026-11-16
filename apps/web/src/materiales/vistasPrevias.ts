import { clasificarArchivo } from "@estudia/core";
import type { ArchivoLocal } from "./archivosLocales";
import { lienzoAJpeg } from "./lienzo";

/** Subirla obliga a generar de nuevo las guardadas, por ejemplo si cambia el tamaño. */
export const VERSION_VISTA = 1;
/** Ancho en píxeles de la imagen guardada: alcanza para la tarjeta en pantallas de alta densidad. */
export const ANCHO_VISTA = 480;
const LINEAS_DE_TEXTO = 14;
const LARGO_DE_LINEA = 120;

export type VistaPrevia =
  | { sha256: string; version: number; tipo: "imagen"; imagen: Blob }
  | { sha256: string; version: number; tipo: "texto"; texto: string }
  /** No hay: tipo sin vista previa, PDF con contraseña o dañado, o un formato que este navegador no lee. */
  | { sha256: string; version: number; tipo: "ninguna" };

function lienzoDe(ancho: number, alto: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const contexto = lienzo.getContext("2d");
  if (!contexto) throw new Error("Este navegador no puede dibujar.");
  return [lienzo, contexto];
}

/**
 * Con un `<img>` y no con `createImageBitmap`: así un HEIC se ve donde el navegador lo sepa leer, como
 * Safari, sin sumar otra librería. Donde no, falla y queda el ícono.
 */
async function miniaturaDeImagen(contenido: Blob): Promise<Blob> {
  const url = URL.createObjectURL(contenido);
  try {
    const imagen = new Image();
    imagen.src = url;
    await imagen.decode();
    const escala = Math.min(1, ANCHO_VISTA / imagen.naturalWidth);
    const [lienzo, contexto] = lienzoDe(
      Math.max(1, Math.round(imagen.naturalWidth * escala)),
      Math.max(1, Math.round(imagen.naturalHeight * escala)),
    );
    // Un PNG transparente no queda negro al pasar a JPEG.
    contexto.fillStyle = "#fff";
    contexto.fillRect(0, 0, lienzo.width, lienzo.height);
    contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    return await lienzoAJpeg(lienzo);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Las primeras líneas, como texto plano: nunca se interpreta, ni siquiera un `.md`. */
export async function primerasLineas(contenido: Blob): Promise<string> {
  const crudo = await contenido.slice(0, 4096).text();
  return crudo
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .slice(0, LINEAS_DE_TEXTO)
    .map((linea) =>
      // Sin caracteres de control, salvo el tab.
      [...linea]
        .filter((c) => c === "\t" || c.charCodeAt(0) >= 32)
        .join("")
        .slice(0, LARGO_DE_LINEA),
    )
    .join("\n");
}

export async function generarVistaPrevia(archivo: ArchivoLocal): Promise<VistaPrevia> {
  const base = { sha256: archivo.sha256, version: VERSION_VISTA };
  const clase = clasificarArchivo(archivo.nombre, archivo.mime);
  try {
    if (clase === "texto")
      return { ...base, tipo: "texto", texto: await primerasLineas(archivo.contenido) };
    if (clase === "imagen" || clase === "heic") {
      return { ...base, tipo: "imagen", imagen: await miniaturaDeImagen(archivo.contenido) };
    }
    if (clase === "pdf") {
      const { primeraPaginaDePdf } = await import("./pdf");
      return {
        ...base,
        tipo: "imagen",
        imagen: await primeraPaginaDePdf(archivo.contenido, ANCHO_VISTA),
      };
    }
  } catch {
    // Dañado, con contraseña o ilegible en este navegador: se descarga igual, sin vista previa.
  }
  return { ...base, tipo: "ninguna" };
}

/** Una por vez: cada PDF se lee entero en memoria, y pueden ser de hasta 50 MB. */
let cola: Promise<unknown> = Promise.resolve();
export function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const resultado = cola.then(tarea, tarea);
  cola = resultado.catch(() => undefined);
  return resultado;
}
