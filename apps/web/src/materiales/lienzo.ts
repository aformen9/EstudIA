/** Un lienzo como JPEG, para guardar una vista previa. */
export function lienzoAJpeg(lienzo: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rechazar) =>
    lienzo.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error("No pude dibujar la vista previa."))),
      "image/jpeg",
      0.82,
    ),
  );
}
