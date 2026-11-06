import { describe, expect, it } from "vitest";
import { materia } from "../pruebas/auxiliares";
import {
  copiaLocalEnUso,
  materiasParaAgregar,
  materiasParaMover,
  nuevoMaterialDesde,
  type Material,
  type MaterialArchivo,
  type MaterialLink,
  type MaterialNota,
} from "../index";

const base = {
  visibilidad: "privado",
  anonimo: false,
  periodo: "2025-2C",
  oculto: false,
  createdAt: "2025-08-01T00:00:00.000Z",
} as const;

function archivo(id: string, materiaId: string | null, documentoId = "doc-1"): MaterialArchivo {
  return {
    ...base,
    id,
    materiaId,
    tipo: "archivo",
    titulo: `Apunte ${id}`,
    driveFileId: null,
    documento: { id: documentoId, sha256: "a".repeat(64), mime: null, bytes: null, paginas: null },
  };
}

function link(id: string, materiaId: string | null, cambios: Partial<MaterialLink> = {}) {
  const material: MaterialLink = {
    ...base,
    id,
    materiaId,
    tipo: "link",
    titulo: "Guía",
    url: "https://ejemplo.com",
    ...cambios,
  };
  return material;
}

function nota(id: string, materiaId: string | null, cambios: Partial<MaterialNota> = {}) {
  const material: MaterialNota = {
    ...base,
    id,
    materiaId,
    tipo: "nota",
    titulo: "Resumen",
    texto: "Hola",
    ...cambios,
  };
  return material;
}

const A = materia("A");
const B = materia("B");
const C = materia("C");
const MATERIAS = [A, B, C];

const ids = (materias: { id: string }[]) => materias.map((m) => m.id);

describe("materiasParaAgregar", () => {
  it("ofrece todas menos la actual si no hay otra copia, en el orden de `materias`", () => {
    const original = nota("1", "B");
    expect(ids(materiasParaAgregar(original, [original], MATERIAS))).toEqual(["A", "C"]);
  });

  it("ofrece todas si el material no tiene materia", () => {
    const original = nota("1", null);
    expect(ids(materiasParaAgregar(original, [original], MATERIAS))).toEqual(["A", "B", "C"]);
  });

  it("no ofrece la actual aunque la lista de materiales esté desactualizada", () => {
    expect(ids(materiasParaAgregar(nota("1", "B"), [], MATERIAS))).toEqual(["A", "C"]);
  });

  it("archivos: compara por documento, aunque cambie el título", () => {
    const original = archivo("1", "A", "doc-1");
    const otraCopia = { ...archivo("2", "B", "doc-1"), titulo: "Otro título" };
    const otroDocumento = archivo("3", "C", "doc-2");
    const materiales = [original, otraCopia, otroDocumento];
    expect(ids(materiasParaAgregar(original, materiales, MATERIAS))).toEqual(["C"]);
  });

  it("links: bloquea solo con la misma url y el mismo título", () => {
    const original = link("1", "A");
    const materiales: Material[] = [
      original,
      link("2", "B"),
      link("3", "C", { titulo: "Otra guía" }),
    ];
    expect(ids(materiasParaAgregar(original, materiales, MATERIAS))).toEqual(["C"]);
    expect(
      ids(
        materiasParaAgregar(
          original,
          [original, link("4", "C", { url: "https://x.org" })],
          MATERIAS,
        ),
      ),
    ).toEqual(["B", "C"]);
  });

  it("notas: bloquea solo con el mismo texto y el mismo título", () => {
    const original = nota("1", "A");
    const materiales: Material[] = [original, nota("2", "B"), nota("3", "C", { texto: "Chau" })];
    expect(ids(materiasParaAgregar(original, materiales, MATERIAS))).toEqual(["C"]);
    expect(
      ids(materiasParaAgregar(original, [original, nota("4", "C", { titulo: "Otro" })], MATERIAS)),
    ).toEqual(["B", "C"]);
  });

  it("no confunde tipos con los mismos valores", () => {
    const original = link("1", "A", { titulo: "T", url: "https://x.org" });
    const parecida = nota("2", "B", { titulo: "T", texto: "https://x.org" });
    expect(ids(materiasParaAgregar(original, [original, parecida], MATERIAS))).toEqual(["B", "C"]);
  });

  it("una copia sin materia o en otro plan no bloquea ninguna materia de este", () => {
    const original = nota("1", "A");
    const materiales = [original, nota("2", null), nota("3", "de-otro-plan")];
    expect(ids(materiasParaAgregar(original, materiales, MATERIAS))).toEqual(["B", "C"]);
  });
});

describe("materiasParaMover", () => {
  it("saca la materia actual y las que ya tienen el contenido", () => {
    const original = archivo("1", "A");
    const materiales = [original, archivo("2", "B")];
    expect(ids(materiasParaMover(original, materiales, MATERIAS))).toEqual(["C"]);
  });

  it("no ofrece la actual aunque la lista de materiales esté desactualizada", () => {
    expect(ids(materiasParaMover(link("1", "C"), [], MATERIAS))).toEqual(["A", "B"]);
  });

  it("un material sin materia se puede mover a cualquiera", () => {
    const original = link("1", null);
    expect(ids(materiasParaMover(original, [original], MATERIAS))).toEqual(["A", "B", "C"]);
  });
});

describe("nuevoMaterialDesde", () => {
  const publico = { visibilidad: "compartido", anonimo: true, oculto: true } as const;

  it("archivo: apunta al mismo documento, con título y período de la original", () => {
    expect(nuevoMaterialDesde({ ...archivo("1", "A"), ...publico }, "B", "nuevo")).toEqual({
      id: "nuevo",
      materiaId: "B",
      titulo: "Apunte 1",
      periodo: "2025-2C",
      tipo: "archivo",
      documentoId: "doc-1",
    });
  });

  it("link: conserva la url", () => {
    expect(nuevoMaterialDesde({ ...link("1", "A"), ...publico }, "B", "nuevo")).toEqual({
      id: "nuevo",
      materiaId: "B",
      titulo: "Guía",
      periodo: "2025-2C",
      tipo: "link",
      url: "https://ejemplo.com",
    });
  });

  it("nota: conserva el texto y un período null", () => {
    expect(nuevoMaterialDesde({ ...nota("1", "A"), periodo: null }, "B", "nuevo")).toEqual({
      id: "nuevo",
      materiaId: "B",
      titulo: "Resumen",
      periodo: null,
      tipo: "nota",
      texto: "Hola",
    });
  });

  it("no arrastra visibilidad, anonimato, oculto, fecha ni Drive", () => {
    const copia = nuevoMaterialDesde(
      { ...archivo("1", "A"), ...publico, driveFileId: "drive" },
      "B",
      "nuevo",
    );
    for (const campo of ["visibilidad", "anonimo", "oculto", "createdAt", "driveFileId"]) {
      expect(copia).not.toHaveProperty(campo);
    }
  });
});

describe("copiaLocalEnUso", () => {
  it("es false si la única referencia es la excluida", () => {
    expect(copiaLocalEnUso("doc-1", [archivo("1", "A")], "1")).toBe(false);
  });

  it("es true si otra referencia usa el documento", () => {
    expect(copiaLocalEnUso("doc-1", [archivo("1", "A"), archivo("2", "B")], "1")).toBe(true);
  });

  it("cuenta una referencia de otro plan y una sin materia", () => {
    const materiales = [archivo("1", "A"), archivo("2", "materia-de-otro-plan")];
    expect(copiaLocalEnUso("doc-1", materiales, "1")).toBe(true);
    expect(copiaLocalEnUso("doc-1", [archivo("1", "A"), archivo("2", null)], "1")).toBe(true);
  });

  it("ignora otros documentos, links y notas", () => {
    const materiales = [
      archivo("1", "A"),
      archivo("2", "B", "doc-2"),
      link("3", "B"),
      nota("4", "B"),
    ];
    expect(copiaLocalEnUso("doc-1", materiales, "1")).toBe(false);
  });
});
