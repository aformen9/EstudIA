/**
 * Dibujo de la primera página de un PDF. Este módulo se importa solo de forma diferida: PDF.js y su
 * worker no entran en la carga inicial. Se usa la versión "legacy", que trae lo que le falta a los
 * navegadores que no tienen las funciones más nuevas, como Safari.
 */
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import trabajador from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

import { lienzoAJpeg } from "./lienzo";

GlobalWorkerOptions.workerSrc = trabajador;

export async function primeraPaginaDePdf(contenido: Blob, ancho: number): Promise<Blob> {
  const tarea = getDocument({
    data: new Uint8Array(await contenido.arrayBuffer()),
    // Sin formularios XFA: menos superficie para un PDF armado para atacar. Esta versión ya no usa `eval`.
    enableXfa: false,
  });
  try {
    const documento = await tarea.promise;
    const pagina = await documento.getPage(1);
    const escala = ancho / pagina.getViewport({ scale: 1 }).width;
    const vista = pagina.getViewport({ scale: escala });
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.ceil(vista.width);
    lienzo.height = Math.ceil(vista.height);
    await pagina.render({ canvas: lienzo, viewport: vista }).promise;
    return await lienzoAJpeg(lienzo);
  } finally {
    await tarea.destroy();
  }
}
