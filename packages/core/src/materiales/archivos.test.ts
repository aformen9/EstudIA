import { describe, expect, it } from "vitest";
import { clasificarArchivo, etiquetaDeArchivo, extensionDe } from "./archivos";

describe("clasificarArchivo", () => {
  it("reconoce los tipos con vista previa por la extensión", () => {
    expect(clasificarArchivo("Apunte.PDF", null)).toBe("pdf");
    expect(clasificarArchivo("foto.jpeg", "image/jpeg")).toBe("imagen");
    expect(clasificarArchivo("IMG_1.HEIC", "")).toBe("heic");
    for (const nombre of ["a.txt", "b.md", "c.csv", "d.py"]) {
      expect(clasificarArchivo(nombre, null)).toBe("texto");
    }
  });

  it("deja SVG, HTML y lo desconocido como otro, aunque digan ser imagen o texto", () => {
    expect(clasificarArchivo("dibujo.svg", "image/svg+xml")).toBe("otro");
    expect(clasificarArchivo("pagina.html", "text/html")).toBe("otro");
    expect(clasificarArchivo("tp.docx", "application/pdf")).toBe("otro");
    expect(clasificarArchivo("instalar.exe", null)).toBe("otro");
  });

  it("la extensión manda sobre el tipo: un .txt con tipo HTML es texto plano", () => {
    expect(clasificarArchivo("nota.txt", "text/html")).toBe("texto");
  });

  it("sin extensión usa el tipo, salvo SVG", () => {
    expect(clasificarArchivo("archivo", "application/pdf")).toBe("pdf");
    expect(clasificarArchivo("archivo", "image/png")).toBe("imagen");
    expect(clasificarArchivo("archivo", "image/svg+xml")).toBe("otro");
    expect(clasificarArchivo("archivo", null)).toBe("otro");
  });
});

describe("etiquetaDeArchivo", () => {
  it("usa la extensión en mayúsculas", () => {
    expect(etiquetaDeArchivo("TP 2.docx")).toBe("DOCX");
    expect(extensionDe("sin-extension")).toBe("");
    expect(etiquetaDeArchivo("sin-extension")).toBe("Archivo");
    expect(etiquetaDeArchivo("raro.extensionlarga")).toBe("Archivo");
  });
});
