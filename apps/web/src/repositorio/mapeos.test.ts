import type { ProgresoMateria } from "@estudia/core";
import { describe, expect, it } from "vitest";
import {
  borradorAFila,
  carreraDesdeFila,
  correlativaAFila,
  correlativaDesdeFila,
  inscripcionDesdeFila,
  materiaDesdeFila,
  materialDesdeFila,
  borradorAParametros,
  nuevoDocumentoAParametros,
  nuevoMaterialAFila,
  perfilDesdeFila,
  planDesdeFila,
  progresoAParametros,
  progresoDesdeFila,
  siglasDesdeFila,
  universidadDesdeFila,
  type FilaMaterial,
  type FilaPlanConSiglas,
} from "./mapeos";

const filaPlan: FilaPlanConSiglas = {
  id: "p",
  carrera_id: "c",
  version: "7023",
  estado: "publicado",
  nota_min: 1,
  nota_max: 10,
  nota_aprobacion: 4,
  nota_paso: 0.1,
  created_at: "2026-01-01T00:00:00Z",
  cuatrimestres_por_anio: 2,
  cierre_cuatrimestres: [{ cuatrimestre: 1, mes: 7 }],
  carreras: { sigla: "LCD", nombre: "Ciencias de Datos", universidades: { sigla: "UCA" } },
};

const baseMaterial: FilaMaterial = {
  id: "m",
  materia_id: "ma",
  tipo: "nota",
  titulo: "Título",
  url: null,
  texto: "texto",
  drive_file_id: null,
  visibilidad: "privado",
  anonimo: false,
  periodo: "2025-2C",
  oculto: false,
  created_at: "2026-01-01T00:00:00+00:00",
  documentos: null,
};

describe("catálogo", () => {
  it("universidad", () => {
    const fila = {
      id: "u",
      nombre: "N",
      sigla: "UCA",
      sede: "Rosario",
      estado: "publicado",
    } as const;
    expect(universidadDesdeFila(fila)).toEqual(fila);
  });

  it("carrera", () => {
    expect(
      carreraDesdeFila({
        id: "c",
        universidad_id: "u",
        nombre: "N",
        sigla: "LCD",
        estado: "pendiente",
      }),
    ).toEqual({ id: "c", universidadId: "u", nombre: "N", sigla: "LCD", estado: "pendiente" });
  });

  it("plan, sin arrastrar el embed de siglas", () => {
    expect(planDesdeFila(filaPlan)).toEqual({
      id: "p",
      carreraId: "c",
      version: "7023",
      estado: "publicado",
      notaMin: 1,
      notaMax: 10,
      notaAprobacion: 4,
      notaPaso: 0.1,
      cuatrimestresPorAnio: 2,
      cierreCuatrimestres: [{ cuatrimestre: 1, mes: 7 }],
      creadoEn: "2026-01-01T00:00:00Z",
    });
  });

  it("siglas, también cuando la RLS oculta la carrera o la universidad", () => {
    expect(siglasDesdeFila(filaPlan)).toEqual({
      universidadSigla: "UCA",
      carreraSigla: "LCD",
      carreraNombre: "Ciencias de Datos",
    });
    expect(siglasDesdeFila({ ...filaPlan, carreras: null })).toEqual({
      universidadSigla: null,
      carreraSigla: null,
      carreraNombre: null,
    });
    expect(
      siglasDesdeFila({
        ...filaPlan,
        carreras: { sigla: "LCD", nombre: "Datos", universidades: null },
      }),
    ).toEqual({ universidadSigla: null, carreraSigla: "LCD", carreraNombre: "Datos" });
  });

  it("materia", () => {
    expect(
      materiaDesdeFila({
        id: "m",
        plan_id: "p",
        codigo: null,
        nombre: "N",
        anio: 0,
        cuatrimestre: null,
        tipo: "Materia",
        area: null,
        requiere_anio_completo_para_cursar: 2,
        owner_id: "o",
        orden: 3,
      }),
    ).toEqual({
      id: "m",
      planId: "p",
      codigo: null,
      nombre: "N",
      anio: 0,
      cuatrimestre: null,
      tipo: "Materia",
      area: null,
      requiereAnioCompletoParaCursar: 2,
      ownerId: "o",
      orden: 3,
    });
  });

  it("borrador de materia propia, sin correlativas", () => {
    expect(
      borradorAFila({
        codigo: "X",
        nombre: "N",
        anio: 1,
        cuatrimestre: 2,
        tipo: "Materia",
        area: "A",
        requiereAnioCompletoParaCursar: null,
        correlativas: [{ requiereId: "r", para: "cursar", condicion: "regular" }],
      }),
    ).toEqual({
      codigo: "X",
      nombre: "N",
      anio: 1,
      cuatrimestre: 2,
      tipo: "Materia",
      area: "A",
      requiere_anio_completo_para_cursar: null,
    });
  });

  it("correlativa, de ida y de vuelta", () => {
    const fila = correlativaAFila("m", { requiereId: "r", para: "rendir", condicion: "aprobada" });
    expect(fila).toEqual({
      materia_id: "m",
      requiere_id: "r",
      para: "rendir",
      condicion: "aprobada",
    });
    expect(correlativaDesdeFila(fila)).toEqual({
      materiaId: "m",
      requiereId: "r",
      para: "rendir",
      condicion: "aprobada",
    });
  });
});

describe("alumno", () => {
  it("perfil", () => {
    expect(
      perfilDesdeFila({
        id: "i",
        nombre: null,
        avatar_url: "a",
        es_admin: true,
        acento: "naranja",
        tema: "light",
      }),
    ).toEqual({
      id: "i",
      nombre: null,
      avatarUrl: "a",
      esAdmin: true,
      acento: "naranja",
      tema: "light",
    });
  });

  it("perfil con preferencias vacías o que esta versión no conoce", () => {
    const fila = { id: "i", nombre: null, avatar_url: null, es_admin: false };
    expect(perfilDesdeFila({ ...fila, acento: null, tema: null })).toMatchObject({
      acento: null,
      tema: null,
    });
    expect(perfilDesdeFila({ ...fila, acento: "turquesa", tema: "sepia" })).toMatchObject({
      acento: null,
      tema: null,
    });
  });

  it("inscripción", () => {
    expect(inscripcionDesdeFila({ id: "i", plan_id: "p", activa: true })).toEqual({
      id: "i",
      planId: "p",
      activa: true,
    });
  });

  it("progreso con sus instancias, ordenadas por fecha y orden", () => {
    const fila = {
      materia_id: "m",
      estado: "final" as const,
      instancias: [
        {
          id: "2",
          tipo: "final" as const,
          fecha: "2025-03-01",
          nota: null,
          orden: 2,
          fuente: "manual" as const,
        },
        {
          id: "1",
          tipo: "final" as const,
          fecha: "2025-02-01",
          nota: 2,
          orden: 5,
          fuente: "siu" as const,
        },
        {
          id: "0",
          tipo: "cursada" as const,
          fecha: "2025-02-01",
          nota: 8,
          orden: 1,
          fuente: "manual" as const,
        },
      ],
    };
    expect(progresoDesdeFila(fila).instancias.map((i) => i.id)).toEqual(["0", "1", "2"]);
    expect(progresoDesdeFila({ ...fila, instancias: null }).instancias).toEqual([]);
  });

  it("los parámetros de guardar_materia no llevan user_id ni ids de instancias", () => {
    const progreso: ProgresoMateria = {
      materiaId: "m",
      estado: "final",
      instancias: [
        { id: "x", tipo: "parcial", fecha: "2025-05-01", nota: 7, orden: 0, fuente: "manual" },
      ],
    };
    const parametros = progresoAParametros(progreso);
    expect(parametros).toEqual({
      materia_id: "m",
      estado: "final",
      instancias: [{ tipo: "parcial", fecha: "2025-05-01", nota: 7, fuente: "manual" }],
    });
    expect(parametros).not.toHaveProperty("user_id");
  });
});

describe("material", () => {
  const base = {
    id: "m",
    materiaId: "ma",
    titulo: "Título",
    visibilidad: "privado",
    anonimo: false,
    periodo: "2025-2C",
    oculto: false,
    createdAt: "2026-01-01T00:00:00+00:00",
  };

  it("nota", () => {
    expect(materialDesdeFila(baseMaterial)).toEqual({ ...base, tipo: "nota", texto: "texto" });
  });

  it("link", () => {
    expect(
      materialDesdeFila({ ...baseMaterial, tipo: "link", texto: null, url: "https://a.test" }),
    ).toEqual({ ...base, tipo: "link", url: "https://a.test" });
  });

  it("archivo con su documento", () => {
    const documento = { id: "d", sha256: "h", mime: "application/pdf", bytes: 10, paginas: 2 };
    expect(
      materialDesdeFila({
        ...baseMaterial,
        tipo: "archivo",
        texto: null,
        drive_file_id: "dr",
        documentos: documento,
      }),
    ).toEqual({ ...base, tipo: "archivo", documento, driveFileId: "dr" });
  });

  it("rechaza una fila a la que le falta el contenido de su tipo", () => {
    expect(() => materialDesdeFila({ ...baseMaterial, tipo: "archivo", texto: null })).toThrow(
      Error,
    );
    expect(() => materialDesdeFila({ ...baseMaterial, tipo: "link", texto: null })).toThrow(Error);
    expect(() => materialDesdeFila({ ...baseMaterial, texto: null })).toThrow(Error);
  });

  it("material nuevo: cada tipo lleva solo su contenido", () => {
    const comun = { id: "i", materiaId: null, titulo: "T" };
    expect(nuevoMaterialAFila({ ...comun, tipo: "archivo", documentoId: "d" })).toEqual({
      id: "i",
      materia_id: null,
      tipo: "archivo",
      titulo: "T",
      periodo: null,
      documento_id: "d",
    });
    expect(nuevoMaterialAFila({ ...comun, tipo: "link", url: "u" })).toEqual({
      id: "i",
      materia_id: null,
      tipo: "link",
      titulo: "T",
      periodo: null,
      url: "u",
    });
    expect(nuevoMaterialAFila({ ...comun, tipo: "nota", texto: "x" })).toEqual({
      id: "i",
      materia_id: null,
      tipo: "nota",
      titulo: "T",
      periodo: null,
      texto: "x",
    });
  });

  it("material nuevo: respeta `periodo` y `createdAt`, y sin fecha la pone la base", () => {
    const fila = nuevoMaterialAFila({
      id: "i",
      materiaId: "ma",
      titulo: "T",
      tipo: "nota",
      texto: "x",
      periodo: "2025-2C",
      createdAt: "2025-03-01T00:00:00Z",
    });
    expect(fila).toMatchObject({ periodo: "2025-2C", created_at: "2025-03-01T00:00:00Z" });
    expect(
      nuevoMaterialAFila({ id: "i", materiaId: "ma", titulo: "T", tipo: "nota", texto: "x" }),
    ).not.toHaveProperty("created_at");
  });

  it("materia nueva: los parámetros de la RPC", () => {
    const parametros = borradorAParametros(
      "p",
      {
        codigo: null,
        nombre: "N",
        anio: 1,
        cuatrimestre: 2,
        tipo: "Materia",
        area: "A",
        requiereAnioCompletoParaCursar: 3,
        correlativas: [{ requiereId: "r", para: "cursar", condicion: "regular" }],
      },
      "i",
    );
    expect(parametros).toEqual({
      id: "i",
      plan_id: "p",
      materia: {
        codigo: null,
        nombre: "N",
        anio: 1,
        cuatrimestre: 2,
        tipo: "Materia",
        area: "A",
        requiereAnioCompletoParaCursar: 3,
      },
      correlativas: [{ requiere: "r", para: "cursar", condicion: "regular" }],
    });
  });

  it("documento nuevo: los parámetros de la RPC", () => {
    const documento = { sha256: "h", mime: "m", bytes: 1, paginas: 2, texto: null };
    expect(nuevoDocumentoAParametros(documento)).toEqual(documento);
  });
});
