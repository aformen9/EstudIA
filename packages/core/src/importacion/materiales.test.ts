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
  materiaId: null,
  visibilidad: "privado",
  anonimo: false,
  periodo: null,
  oculto: false,
  createdAt: "2026-01-01T00:00:00.000Z",
} as const;

const archivoExistente: Material = {
  ...existente,
  tipo: "archivo",
  titulo: "Apunte",
  driveFileId: null,
  documento: { id: "doc-1", sha256: SHA, mime: null, bytes: null, paginas: null },
};
const linkExistente: Material = {
  ...existente,
  tipo: "link",
  titulo: "Guía",
  url: "https://ejemplo.com",
};
const notaExistente: Material = { ...existente, tipo: "nota", titulo: "Resumen", texto: "Hola" };

/** Cada tipo, como viene en el respaldo y como ya guardado, con el mismo contenido. */
const LOS_TRES_TIPOS = [
  ["archivo", archivo, archivoExistente],
  ["link", link, linkExistente],
  ["nota", nota, notaExistente],
] as const;

/** Ids predecibles, como los que inyecta quien llama. */
function generadorDeIds() {
  let n = 0;
  return () => `id-${++n}`;
}

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

  it("omite un archivo con el mismo sha256 en la misma materia, aunque cambien título y mayúsculas del hash", () => {
    const importado = { ...archivo, sha256: SHA.toUpperCase() };
    const existentes = [{ ...archivoExistente, titulo: "Otro título" }];
    expect(filtrarMaterialesARestaurar([importado], existentes, {}).omitidos).toEqual([importado]);
  });

  it("agrega un archivo con el mismo sha256 que está en otra materia", () => {
    const importado = { ...archivo, materiaId: "materia-a" };
    const existentes = [{ ...archivoExistente, materiaId: "materia-b" }];
    const { aAgregar, omitidos } = filtrarMaterialesARestaurar([importado], existentes, {});
    expect(aAgregar).toEqual([importado]);
    expect(omitidos).toEqual([]);
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

  describe.each(LOS_TRES_TIPOS)(
    "la materia es parte de la identidad: %s",
    (_, importado, guardado) => {
      const en = (materiaId: string | null) => ({ ...importado, materiaId });
      const guardadoEn = (materiaId: string | null): Material => ({ ...guardado, materiaId });

      it("lo omite en la misma materia y lo agrega en otra", () => {
        const existentes = [guardadoEn("materia-a")];
        const { aAgregar, omitidos } = filtrarMaterialesARestaurar(
          [en("materia-a"), en("materia-b")],
          existentes,
          {},
        );
        expect(omitidos).toEqual([en("materia-a")]);
        expect(aAgregar).toEqual([en("materia-b")]);
      });

      it("sin materia y con materia son distintos, en los dos sentidos", () => {
        const conMateria = filtrarMaterialesARestaurar([en("materia-a")], [guardadoEn(null)], {});
        expect(conMateria.aAgregar).toEqual([en("materia-a")]);
        const sinMateria = filtrarMaterialesARestaurar([en(null)], [guardadoEn("materia-a")], {});
        expect(sinMateria.aAgregar).toEqual([en(null)]);
      });

      it("sin materia contra sin materia es el mismo", () => {
        const { aAgregar, omitidos } = filtrarMaterialesARestaurar(
          [en(null)],
          [guardadoEn(null)],
          {},
        );
        expect(aAgregar).toEqual([]);
        expect(omitidos).toEqual([en(null)]);
      });

      it("compara con la materia ya traducida, no con la clave del respaldo", () => {
        const claves = { "clave-1": "uuid-propia" };
        const yaEsta = filtrarMaterialesARestaurar(
          [en("clave-1")],
          [guardadoEn("uuid-propia")],
          claves,
        );
        expect(yaEsta.omitidos).toEqual([en("clave-1")]);
        const soloCoincideLaClave = filtrarMaterialesARestaurar(
          [en("clave-1")],
          [guardadoEn("clave-1")],
          claves,
        );
        expect(soloCoincideLaClave.aAgregar).toEqual([en("uuid-propia")]);
      });

      it("dentro del archivo: repetido en una materia se omite, en dos materias entra dos veces", () => {
        const { aAgregar, omitidos } = filtrarMaterialesARestaurar(
          [en("materia-a"), en("materia-b"), en("materia-a")],
          [],
          {},
        );
        expect(aAgregar).toEqual([en("materia-a"), en("materia-b")]);
        expect(omitidos).toEqual([en("materia-a")]);
      });
    },
  );

  it("un material movido después del respaldo reaparece en la materia vieja: efecto aceptado", () => {
    const importado = { ...nota, materiaId: "materia-vieja" };
    const movido: Material = { ...notaExistente, materiaId: "materia-nueva" };
    expect(filtrarMaterialesARestaurar([importado], [movido], {}).aAgregar).toEqual([importado]);
  });

  it("no vuelve a traducir un material que viene de `fallidos`", () => {
    const fallido = { ...nota, id: "id-1", materiaId: "uuid-2" };
    const { aAgregar } = filtrarMaterialesARestaurar([fallido], [], { "uuid-2": "uuid-3" });
    expect(aAgregar).toEqual([fallido]);
  });
});

describe("restaurarMateriales", () => {
  it("guarda cada tipo y conserva periodo y fecha de creación", async () => {
    const { repositorio, agregarMaterial, registrarDocumento } = repositorioFalso();
    const resultado = await restaurarMateriales(
      repositorio,
      [archivo, link, nota],
      {},
      generadorDeIds(),
    );
    expect(resultado).toEqual({ agregados: 3, omitidos: 0, fallidos: [] });
    expect(registrarDocumento).toHaveBeenCalledWith({
      sha256: SHA,
      mime: "application/pdf",
      bytes: 10,
      paginas: 2,
      texto: null,
    });
    expect(agregarMaterial.mock.calls.map(([m]) => m)).toEqual([
      { ...base, id: "id-1", titulo: "Apunte", tipo: "archivo", documentoId: "doc-1" },
      { ...base, id: "id-2", titulo: "Guía", tipo: "link", url: "https://ejemplo.com" },
      { ...base, id: "id-3", titulo: "Resumen", tipo: "nota", texto: "Hola" },
    ]);
  });

  it("registra el hash en minúsculas, como exige la base", async () => {
    const { repositorio, registrarDocumento } = repositorioFalso();
    await restaurarMateriales(
      repositorio,
      [{ ...archivo, sha256: SHA.toUpperCase() }],
      {},
      generadorDeIds(),
    );
    expect(registrarDocumento.mock.calls[0]).toEqual([expect.objectContaining({ sha256: SHA })]);
  });

  it("si uno falla sigue con los demás y lo informa", async () => {
    const { repositorio, agregarMaterial } = repositorioFalso();
    const falla = { ...nota, titulo: "Falla" };
    const resultado = await restaurarMateriales(repositorio, [falla, link], {}, generadorDeIds());
    expect(resultado).toEqual({ agregados: 1, omitidos: 0, fallidos: [{ ...falla, id: "id-1" }] });
    expect(agregarMaterial).toHaveBeenCalledTimes(2);
  });

  it("no agrega lo que ya existe", async () => {
    const { repositorio, agregarMaterial } = repositorioFalso([
      { ...existente, tipo: "nota", titulo: "Resumen", texto: "Hola" },
    ]);
    const resultado = await restaurarMateriales(repositorio, [nota], {}, generadorDeIds());
    expect(resultado).toEqual({ agregados: 0, omitidos: 1, fallidos: [] });
    expect(agregarMaterial).not.toHaveBeenCalled();
  });

  it("le da un id distinto a cada material y no genera ids para los omitidos", async () => {
    const { repositorio, agregarMaterial } = repositorioFalso([
      { ...existente, tipo: "nota", titulo: "Resumen", texto: "Hola" },
    ]);
    const generarId = vi.fn(generadorDeIds());
    await restaurarMateriales(repositorio, [nota, archivo, link], {}, generarId);
    expect(generarId).toHaveBeenCalledTimes(2);
    expect(agregarMaterial.mock.calls.map(([m]) => m.id)).toEqual(["id-1", "id-2"]);
  });

  it("un reintento usa el mismo id del intento que falló", async () => {
    const { repositorio, agregarMaterial } = repositorioFalso();
    agregarMaterial.mockRejectedValueOnce(new Error("tiempo agotado"));
    const generarId = vi.fn(generadorDeIds());
    const primero = await restaurarMateriales(repositorio, [nota], {}, generarId);
    expect(primero.fallidos).toEqual([{ ...nota, id: "id-1" }]);

    const segundo = await restaurarMateriales(repositorio, primero.fallidos, {}, generarId);
    expect(segundo).toEqual({ agregados: 1, omitidos: 0, fallidos: [] });
    expect(generarId).toHaveBeenCalledOnce();
    expect(agregarMaterial.mock.calls.map(([m]) => m.id)).toEqual(["id-1", "id-1"]);
  });

  it("conserva el id aunque falle antes, al registrar el documento", async () => {
    const { repositorio, registrarDocumento } = repositorioFalso();
    registrarDocumento.mockRejectedValueOnce(new Error("sin conexión"));
    const { fallidos } = await restaurarMateriales(repositorio, [archivo], {}, generadorDeIds());
    expect(fallidos).toEqual([{ ...archivo, id: "id-1" }]);
  });

  it("si el reintento encuentra el material ya guardado, lo omite", async () => {
    const { repositorio, agregarMaterial } = repositorioFalso([
      { ...existente, tipo: "nota", titulo: "Resumen", texto: "Hola" },
    ]);
    const resultado = await restaurarMateriales(
      repositorio,
      [{ ...nota, id: "id-viejo" }],
      {},
      generadorDeIds(),
    );
    expect(resultado).toEqual({ agregados: 0, omitidos: 1, fallidos: [] });
    expect(agregarMaterial).not.toHaveBeenCalled();
  });

  describe("restaurar dos veces con el material en dos materias", () => {
    /** Guarda de verdad lo que le agregan, para que la segunda restauración lo vea. */
    function repositorioConMemoria() {
      const guardados: Material[] = [];
      const documentos = new Map<string, string>();
      const repositorio = {
        listarMateriales: async () => [...guardados],
        registrarDocumento: async ({ sha256 }: { sha256: string }) => {
          const id = documentos.get(sha256) ?? `doc-${documentos.size + 1}`;
          documentos.set(sha256, id);
          return { id, sha256, mime: null, bytes: null, paginas: null };
        },
        agregarMaterial: async (nuevo: NuevoMaterial) => {
          const comun = {
            id: nuevo.id,
            materiaId: nuevo.materiaId,
            titulo: nuevo.titulo,
            visibilidad: "privado",
            anonimo: false,
            periodo: nuevo.periodo ?? null,
            oculto: false,
            createdAt: nuevo.createdAt ?? "2026-11-05T00:00:00.000Z",
          } as const;
          let material: Material;
          if (nuevo.tipo === "archivo") {
            const sha256 = [...documentos].find(
              ([, id]) => id === nuevo.documentoId,
            )?.[0] as string;
            material = {
              ...comun,
              tipo: "archivo",
              driveFileId: null,
              documento: { id: nuevo.documentoId, sha256, mime: null, bytes: null, paginas: null },
            };
          } else if (nuevo.tipo === "link") {
            material = { ...comun, tipo: "link", url: nuevo.url };
          } else {
            material = { ...comun, tipo: "nota", texto: nuevo.texto };
          }
          guardados.push(material);
          return material;
        },
      } as unknown as Repositorio;
      return { repositorio, guardados };
    }

    it.each(LOS_TRES_TIPOS)(
      "%s: vuelve en las dos y la segunda vez no duplica",
      async (_, importado) => {
        const { repositorio, guardados } = repositorioConMemoria();
        const generarId = generadorDeIds();
        const enLasDos = [
          { ...importado, materiaId: "uuid-a" },
          { ...importado, materiaId: "clave-b" },
        ];
        const claves = { "clave-b": "uuid-b" };

        const primera = await restaurarMateriales(repositorio, enLasDos, claves, generarId);
        expect(primera).toEqual({ agregados: 2, omitidos: 0, fallidos: [] });
        expect(guardados.map((m) => m.materiaId)).toEqual(["uuid-a", "uuid-b"]);

        const segunda = await restaurarMateriales(repositorio, enLasDos, claves, generarId);
        expect(segunda).toEqual({ agregados: 0, omitidos: 2, fallidos: [] });
        expect(guardados).toHaveLength(2);
      },
    );

    it("las dos referencias de un archivo apuntan al mismo documento", async () => {
      const { repositorio, guardados } = repositorioConMemoria();
      await restaurarMateriales(
        repositorio,
        [
          { ...archivo, materiaId: "uuid-a" },
          { ...archivo, materiaId: "uuid-b" },
        ],
        {},
        generadorDeIds(),
      );
      const documentos = guardados.map((m) => (m.tipo === "archivo" ? m.documento.id : null));
      expect(documentos).toEqual(["doc-1", "doc-1"]);
    });

    it("si falla en una materia, el reintento agrega solo esa y no toca la otra", async () => {
      const { repositorio, guardados } = repositorioConMemoria();
      const agregarDeVerdad = repositorio.agregarMaterial.bind(repositorio);
      const fallaUnaVez = vi
        .fn(agregarDeVerdad)
        .mockImplementationOnce(agregarDeVerdad)
        .mockRejectedValueOnce(new Error("tiempo agotado"));
      repositorio.agregarMaterial = fallaUnaVez;
      const generarId = generadorDeIds();
      const claves = { "clave-b": "uuid-b" };

      const primera = await restaurarMateriales(
        repositorio,
        [
          { ...nota, materiaId: "uuid-a" },
          { ...nota, materiaId: "clave-b" },
        ],
        claves,
        generarId,
      );
      expect(primera.fallidos.map((m) => m.materiaId)).toEqual(["uuid-b"]);

      const segunda = await restaurarMateriales(repositorio, primera.fallidos, claves, generarId);
      expect(segunda).toEqual({ agregados: 1, omitidos: 0, fallidos: [] });
      expect(guardados.map((m) => m.materiaId)).toEqual(["uuid-a", "uuid-b"]);
    });
  });
});
