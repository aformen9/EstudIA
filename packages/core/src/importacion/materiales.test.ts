import { describe, expect, it, vi } from "vitest";
import {
  filtrarMaterialesARestaurar,
  restaurarMateriales,
  type Material,
  type MaterialImportado,
  type NuevoMaterial,
  type Repositorio,
} from "../index";

const SHA = "a".repeat(64);
const base = { materiaId: null, periodo: "2025-2C", createdAt: "2025-08-01T00:00:00.000Z" };
const archivo: MaterialImportado = {
  ...base,
  tipo: "archivo",
  titulo: "Apunte",
  sha256: SHA,
  mime: "application/pdf",
  bytes: 10,
  paginas: 2,
};
const link: MaterialImportado = {
  ...base,
  tipo: "link",
  titulo: "Guía",
  url: "https://ejemplo.com",
};
const nota: MaterialImportado = { ...base, tipo: "nota", titulo: "Resumen", texto: "Hola" };

const existente = {
  id: "m1",
  materiaId: "otra-materia",
  visibilidad: "privado",
  anonimo: false,
  periodo: null,
  oculto: false,
  createdAt: "2026-01-01T00:00:00.000Z",
} as const;

function repositorioFalso(existentes: Material[] = []) {
  const agregarMaterial = vi.fn(async (material: NuevoMaterial) => {
    if (material.titulo === "Falla") throw new Error("sin conexión");
    return {} as Material;
  });
  const registrarDocumento = vi.fn(async () => ({
    id: "doc-1",
    sha256: SHA,
    mime: null,
    bytes: null,
    paginas: null,
  }));
  const repositorio = {
    listarMateriales: async () => existentes,
    agregarMaterial,
    registrarDocumento,
  } as unknown as Repositorio;
  return { repositorio, agregarMaterial, registrarDocumento };
}

describe("filtrarMaterialesARestaurar", () => {
  it("agrega todo si no hay nada parecido", () => {
    const { aAgregar, omitidos } = filtrarMaterialesARestaurar([archivo, link, nota], [], {});
    expect(aAgregar).toEqual([archivo, link, nota]);
    expect(omitidos).toEqual([]);
  });

  it("omite un archivo con el mismo sha256, aunque cambien título y mayúsculas del hash", () => {
    const existentes: Material[] = [
      {
        ...existente,
        tipo: "archivo",
        titulo: "Otro título",
        driveFileId: null,
        documento: { id: "d", sha256: SHA, mime: null, bytes: null, paginas: null },
      },
    ];
    const importado = { ...archivo, sha256: SHA.toUpperCase() };
    expect(filtrarMaterialesARestaurar([importado], existentes, {}).omitidos).toEqual([importado]);
  });

  it("omite un link solo si coinciden título y url", () => {
    const existentes: Material[] = [
      { ...existente, tipo: "link", titulo: "Guía", url: "https://ejemplo.com" },
    ];
    const otroTitulo = { ...link, titulo: "Otra guía" };
    const otraUrl = { ...link, url: "https://otro.com" };
    const { aAgregar, omitidos } = filtrarMaterialesARestaurar(
      [link, otroTitulo, otraUrl],
      existentes,
      {},
    );
    expect(omitidos).toEqual([link]);
    expect(aAgregar).toEqual([otroTitulo, otraUrl]);
  });

  it("omite una nota solo si coinciden título y texto", () => {
    const existentes: Material[] = [
      { ...existente, tipo: "nota", titulo: "Resumen", texto: "Hola" },
    ];
    const otroTexto = { ...nota, texto: "Chau" };
    const { aAgregar, omitidos } = filtrarMaterialesARestaurar([nota, otroTexto], existentes, {});
    expect(omitidos).toEqual([nota]);
    expect(aAgregar).toEqual([otroTexto]);
  });

  it("no confunde un link con una nota de valores iguales", () => {
    const existentes: Material[] = [
      { ...existente, tipo: "nota", titulo: "Guía", texto: "https://ejemplo.com" },
    ];
    expect(filtrarMaterialesARestaurar([link], existentes, {}).aAgregar).toEqual([link]);
  });

  it("omite los repetidos dentro del mismo archivo", () => {
    const { aAgregar, omitidos } = filtrarMaterialesARestaurar([nota, { ...nota }], [], {});
    expect(aAgregar).toEqual([nota]);
    expect(omitidos).toEqual([nota]);
  });

  it("traduce las claves de materias propias y deja los uuid y el null", () => {
    const { aAgregar } = filtrarMaterialesARestaurar(
      [{ ...link, materiaId: "clave-1" }, { ...nota, materiaId: "uuid-catalogo" }, archivo],
      [],
      { "clave-1": "uuid-propia" },
    );
    expect(aAgregar.map((m) => m.materiaId)).toEqual(["uuid-propia", "uuid-catalogo", null]);
  });
});

describe("restaurarMateriales", () => {
  it("guarda cada tipo y conserva periodo y fecha de creación", async () => {
    const { repositorio, agregarMaterial, registrarDocumento } = repositorioFalso();
    const resultado = await restaurarMateriales(repositorio, [archivo, link, nota], {});
    expect(resultado).toEqual({ agregados: 3, omitidos: 0, fallidos: [] });
    expect(registrarDocumento).toHaveBeenCalledWith({
      sha256: SHA,
      mime: "application/pdf",
      bytes: 10,
      paginas: 2,
      texto: null,
    });
    expect(agregarMaterial.mock.calls.map(([m]) => m)).toEqual([
      { ...base, titulo: "Apunte", tipo: "archivo", documentoId: "doc-1" },
      { ...base, titulo: "Guía", tipo: "link", url: "https://ejemplo.com" },
      { ...base, titulo: "Resumen", tipo: "nota", texto: "Hola" },
    ]);
  });

  it("registra el hash en minúsculas, como exige la base", async () => {
    const { repositorio, registrarDocumento } = repositorioFalso();
    await restaurarMateriales(repositorio, [{ ...archivo, sha256: SHA.toUpperCase() }], {});
    expect(registrarDocumento.mock.calls[0]).toEqual([expect.objectContaining({ sha256: SHA })]);
  });

  it("si uno falla sigue con los demás y lo informa", async () => {
    const { repositorio, agregarMaterial } = repositorioFalso();
    const falla = { ...nota, titulo: "Falla" };
    const resultado = await restaurarMateriales(repositorio, [falla, link], {});
    expect(resultado).toEqual({ agregados: 1, omitidos: 0, fallidos: [falla] });
    expect(agregarMaterial).toHaveBeenCalledTimes(2);
  });

  it("no agrega lo que ya existe", async () => {
    const { repositorio, agregarMaterial } = repositorioFalso([
      { ...existente, tipo: "nota", titulo: "Resumen", texto: "Hola" },
    ]);
    const resultado = await restaurarMateriales(repositorio, [nota], {});
    expect(resultado).toEqual({ agregados: 0, omitidos: 1, fallidos: [] });
    expect(agregarMaterial).not.toHaveBeenCalled();
  });
});
