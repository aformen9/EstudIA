import { describe, expect, it } from "vitest";
import legacyCaso from "../../../../fixtures/caso-prueba-legacy.json";
import { fila, materia, planBase, planLcd, evento } from "../pruebas/auxiliares";
import {
  datosAlumnoDesdeImportacion,
  estadoCorrelativas,
  materiasPropiasConservadas,
  progresoCarrera,
  promedio,
  type DatosAlumno,
  type DatosImportados,
  type Material,
  type MateriaPropiaImportada,
  type PlanCompleto,
  type TipoAviso,
} from "../index";
import {
  crearRespaldo,
  detectarFormatoRespaldo,
  FORMATO_RESPALDO,
  importarArchivo,
  importarLegacy,
  leerRespaldo,
  parsearArchivo,
} from "../importacion";

const ANCLA = { id: "ancla", codigo: "AAA", nombre: "Con match" };

const planChico: PlanCompleto = {
  plan: planBase(),
  universidadSigla: "UCA",
  carreraSigla: "LCD",
  carreraNombre: "Ciencias de Datos",
  materias: [
    materia("uuid-a", { codigo: "AAA" }),
    materia("uuid-b", { codigo: "BBB" }),
    materia("uuid-p", { codigo: "PRO", ownerId: "alumno" }),
  ],
  correlativas: [],
};

function legacy(materias: unknown[], extra: object = {}) {
  return { version: 2, materias, ...extra };
}

function importarOk(json: unknown, plan: PlanCompleto = planChico) {
  const resultado = importarLegacy(json, plan);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado;
}

function avisosDe(resultado: { reporte: { avisos: { tipo: TipoAviso }[] } }, tipo: TipoAviso) {
  return resultado.reporte.avisos.filter((a) => a.tipo === tipo);
}

describe("importarLegacy: archivos inválidos", () => {
  it.each([[null], ["texto"], [42], [[]], [{}], [{ materias: "no" }]])(
    "rechaza %j con un mensaje en español, sin lanzar",
    (json) => {
      expect(importarLegacy(json, planChico)).toEqual({
        ok: false,
        error: "El respaldo no es válido: no tiene una lista de materias.",
      });
    },
  );

  it("dice qué materia no tiene nombre o id", () => {
    expect(importarLegacy(legacy([{ id: "x", nombre: "Bien" }, { id: "y" }]), planChico)).toEqual({
      ok: false,
      error: "El respaldo no es válido: la materia número 2 no tiene nombre.",
    });
    expect(importarLegacy(legacy([{ nombre: "Sin id" }]), planChico)).toEqual({
      ok: false,
      error: "El respaldo no es válido: la materia número 1 no tiene id.",
    });
  });

  it("bloquea un respaldo sin ningún código en común con el plan", () => {
    expect(
      importarLegacy(
        legacy([
          { id: "x", codigo: "ZZZ", nombre: "X", estado: "aprobada", nota: 8 },
          { id: "y", nombre: "Sin código", estado: "cursando" },
        ]),
        planChico,
      ),
    ).toEqual({
      ok: false,
      error:
        "Este respaldo es de otra carrera: ninguna de sus materias está en el plan 7023. Elegí la carrera correcta y probá de nuevo.",
    });
  });

  it("bloquea una lista vacía de materias", () => {
    expect(importarLegacy(legacy([]), planChico).ok).toBe(false);
  });

  it("una materia propia del alumno con ese código no cuenta como coincidencia", () => {
    expect(importarLegacy(legacy([{ id: "x", codigo: "PRO", nombre: "X" }]), planChico).ok).toBe(
      false,
    );
  });

  it("bloquea un respaldo contra un plan sin catálogo", () => {
    const planVacio: PlanCompleto = { ...planChico, materias: [] };
    const json = legacy([{ id: "x", codigo: "AAA", nombre: "X", estado: "aprobada", nota: 8 }]);
    expect(importarLegacy(json, planVacio).ok).toBe(false);
  });

  it("con una sola coincidencia alcanza: el resto pasa a materias propias", () => {
    const resultado = importarOk(legacy([ANCLA, { id: "x", codigo: "ZZZ", nombre: "X" }]));
    expect(resultado.resumen).toMatchObject({ materiasConMatch: 1, materiasPropias: 1 });
  });
});

describe("importarLegacy: match y materias propias", () => {
  it("usa uuid del catálogo para las materias con match, sin tocar materias propias del plan", () => {
    const resultado = importarOk(
      legacy([
        { id: "AAA", codigo: "AAA", nombre: "A", estado: "aprobada", nota: 8, final: 8 },
        { id: "PRO", codigo: "PRO", nombre: "Propia vieja", anio: 1, sem: 1, estado: "cursando" },
      ]),
    );
    expect(resultado.datos.progreso.map((p) => [p.materiaId, p.estado, p.notaFinalExamen])).toEqual(
      [
        ["uuid-a", "aprobada", 8],
        ["PRO", "cursando", null],
      ],
    );
    expect(resultado.datos.materiasPropias.map((m) => m.clave)).toEqual(["PRO"]);
  });

  it("no guarda filas de materias sin ningún dato", () => {
    const resultado = importarOk(
      legacy([
        { id: "AAA", codigo: "AAA", nombre: "A", estado: "pendiente", p1: null, aplazos: [] },
      ]),
    );
    expect(resultado.datos.progreso).toEqual([]);
  });

  it("pasa a propia a la materia sin match, con sus datos y su clave", () => {
    const resultado = importarOk(
      legacy([
        {
          id: "m123",
          nombre: "Optativa",
          anio: 3,
          sem: 2,
          tipo: "Seminario",
          reqModuloCursar: 2,
          estado: "cursando",
          p1: 7,
        },
        ANCLA,
      ]),
    );
    expect(resultado.datos.materiasPropias).toEqual([
      {
        clave: "m123",
        codigo: null,
        nombre: "Optativa",
        anio: 3,
        cuatrimestre: 2,
        tipo: "Seminario",
        area: null,
        requiereAnioCompletoParaCursar: 2,
        correlativas: [],
      },
    ]);
    expect(resultado.datos.progreso[0]).toMatchObject({ materiaId: "m123", p1: 7 });
    expect(avisosDe(resultado, "materia-sin-match")[0]).toMatchObject({ materia: "m123" });
    // 2 del catálogo, la del archivo y PRO, la propia que ya tenía y se conserva.
    expect(resultado.resumen).toMatchObject({ materiasPropias: 1, totalMaterias: 4 });
  });

  it("resuelve correlativas de propias contra uuid o clave y reporta el resto", () => {
    const resultado = importarOk(
      legacy([
        { id: "AAA", codigo: "AAA", nombre: "A", estado: "aprobada" },
        {
          id: "p1",
          nombre: "Propia 1",
          anio: 1,
          sem: 1,
          estado: "pendiente",
          reqCursar: ["AAA", { id: "p2", cond: "regular" }, { id: "FANTASMA", cond: "regular" }],
          reqRendir: ["BBB", { cond: "aprobada" }, { id: "p1" }],
        },
        { id: "p2", codigo: "ZZZ", nombre: "Propia 2", anio: 1, sem: 1, estado: "pendiente" },
      ]),
    );
    const propia = resultado.datos.materiasPropias.find((m) => m.clave === "p1");
    expect(propia?.correlativas).toEqual([
      { requiere: "uuid-a", para: "cursar", condicion: "aprobada" },
      { requiere: "p2", para: "cursar", condicion: "regular" },
      { requiere: "uuid-b", para: "rendir", condicion: "aprobada" },
    ]);
    expect(avisosDe(resultado, "correlativa-sin-resolver")).toHaveLength(3);
  });

  it("toma una sola vez a dos materias del respaldo con el mismo código", () => {
    const resultado = importarOk(
      legacy([
        { id: "x1", codigo: "AAA", nombre: "A", estado: "aprobada", nota: 8 },
        { id: "x2", codigo: "AAA", nombre: "A otra", estado: "cursando" },
        { id: "x1", nombre: "Id repetido", estado: "cursando" },
      ]),
    );
    expect(resultado.datos.progreso).toHaveLength(1);
    expect(resultado.datos.materiasPropias).toHaveLength(0);
    expect(avisosDe(resultado, "materia-descartada")).toHaveLength(2);
  });

  it("descarta la materia cuyo id choca con un uuid del catálogo", () => {
    const resultado = importarOk(
      legacy([{ id: "uuid-a", nombre: "Trampa", anio: 1, estado: "cursando" }, ANCLA]),
    );
    expect(resultado.datos.materiasPropias).toEqual([]);
    expect(resultado.datos.progreso).toEqual([]);
    expect(avisosDe(resultado, "materia-descartada")).toHaveLength(1);
  });

  it("reporta el año inválido de una propia", () => {
    const resultado = importarOk(legacy([{ id: "p", nombre: "P", anio: "dos", sem: 2 }, ANCLA]));
    expect(resultado.datos.materiasPropias[0]).toMatchObject({ anio: 0, cuatrimestre: null });
    expect(avisosDe(resultado, "dato-invalido")).toHaveLength(1);
  });

  it("lleva el caso de prueba con una materia extra sin match a 51 materias", () => {
    const conExtra = {
      ...legacyCaso,
      materias: [
        ...legacyCaso.materias,
        { id: "m1", nombre: "Optativa", anio: 1, sem: 1, estado: "aprobada", nota: 9 },
      ],
    };
    const plan = planLcd();
    const resultado = importarOk(conExtra, plan);
    const datos = datosAlumnoDesdeImportacion(plan, resultado.datos);
    expect(progresoCarrera(datos).total).toBe(51);
    expect(progresoCarrera(datos).porEstado.aprobada).toBe(27);
    expect(promedio(datos, false).n).toBe(27);
  });
});

describe("vista previa con materias propias que ya existían", () => {
  const planConPropias: PlanCompleto = {
    ...planChico,
    materias: [
      materia("uuid-a", { codigo: "AAA" }),
      materia("uuid-p", { codigo: "PRO", ownerId: "alumno" }),
      materia("uuid-s", { codigo: null, nombre: "Sin código", ownerId: "alumno" }),
    ],
    correlativas: [
      { materiaId: "uuid-p", requiereId: "uuid-a", para: "cursar", condicion: "aprobada" },
      { materiaId: "uuid-s", requiereId: "uuid-a", para: "cursar", condicion: "aprobada" },
    ],
  };

  it("conserva las que no vienen en el archivo y cuentan en el total, como hace la RPC", () => {
    const resultado = importarOk(legacy([ANCLA]), planConPropias);
    expect(resultado.resumen.totalMaterias).toBe(3);
    expect(resultado.resumen.porEstado.pendiente).toBe(3);
    const datos = datosAlumnoDesdeImportacion(planConPropias, resultado.datos);
    expect(datos.materias.map((m) => m.id)).toEqual(["uuid-a", "uuid-p", "uuid-s"]);
    expect(datos.correlativas).toHaveLength(2);
    expect(progresoCarrera(datos).total).toBe(3);
  });

  it("no cuenta dos veces a la que viene en el archivo: mismo código", () => {
    const resultado = importarOk(
      legacy([ANCLA, { id: "x", codigo: "PRO", nombre: "Otro nombre" }]),
      planConPropias,
    );
    expect(resultado.resumen.totalMaterias).toBe(3);
    const datos = datosAlumnoDesdeImportacion(planConPropias, resultado.datos);
    expect(datos.materias.map((m) => m.id)).toEqual(["uuid-a", "uuid-s", "x"]);
    expect(datos.correlativas.some((c) => c.materiaId === "uuid-p")).toBe(false);
  });

  it("no cuenta dos veces a la que viene en el archivo: sin código y mismo nombre", () => {
    const resultado = importarOk(
      legacy([ANCLA, { id: "y", nombre: "Sin código" }]),
      planConPropias,
    );
    expect(resultado.resumen.totalMaterias).toBe(3);
  });
});

describe("importarLegacy: datos que no se confían", () => {
  it("deja pendiente un estado desconocido y lo reporta", () => {
    const resultado = importarOk(
      legacy([{ id: "AAA", codigo: "AAA", nombre: "A", estado: "recursando", p1: 5 }]),
    );
    expect(resultado.datos.progreso[0]?.estado).toBe("pendiente");
    expect(avisosDe(resultado, "estado-desconocido")[0]).toMatchObject({
      materia: "AAA",
      valor: "recursando",
    });
  });

  it("descarta y reporta notas fuera de escala o que no son números", () => {
    const resultado = importarOk(
      legacy([
        {
          id: "AAA",
          codigo: "AAA",
          nombre: "A",
          estado: "aprobada",
          nota: 11,
          final: "9",
          p1: 0,
          p2: 7,
          aplazos: [2, 40, "x"],
        },
      ]),
    );
    expect(resultado.datos.progreso[0]).toMatchObject({
      nota: null,
      notaFinalExamen: null,
      p1: null,
      p2: 7,
      aplazos: [2],
    });
    expect(avisosDe(resultado, "nota-fuera-de-escala")).toHaveLength(5);
  });

  it("valida contra la escala del plan, no contra 1-10", () => {
    const plan: PlanCompleto = {
      ...planChico,
      plan: planBase({ notaMin: 1, notaMax: 7, notaAprobacion: 4 }),
    };
    const crudo = legacy([
      { id: "AAA", codigo: "AAA", nombre: "A", estado: "aprobada", nota: 9, aplazos: [8, 3] },
    ]);
    const resultado = importarOk(crudo, plan);
    expect(resultado.datos.progreso[0]).toMatchObject({ nota: null, aplazos: [3] });
    expect(importarOk(crudo).datos.progreso[0]).toMatchObject({ nota: 9, aplazos: [8, 3] });
  });

  it("limpia el historial: descarta eventos inválidos y notas fuera de escala", () => {
    const historial = [
      { fecha: "2024-01-01T10:00:00Z", tipo: "Examen", nota: 7, resultado: "Aprobado" },
      { fecha: "2024-13-45", tipo: "Examen", nota: 7, resultado: "Aprobado" },
      { fecha: "2024-01-02", tipo: "Otro", nota: 7, resultado: "Aprobado" },
      { fecha: "2024-01-03", tipo: "Examen", nota: 7, resultado: "Quizás" },
      "basura",
      { fecha: "2024-01-04", tipo: "Examen", nota: 99, resultado: "Reprobado" },
    ];
    const resultado = importarOk(
      legacy([{ id: "AAA", codigo: "AAA", nombre: "A", estado: "final", historial }]),
    );
    expect(resultado.datos.historial).toEqual([
      evento("uuid-a", "2024-01-01", "Examen", "Aprobado", 7),
      evento("uuid-a", "2024-01-04", "Examen", "Reprobado", null),
    ]);
    expect(avisosDe(resultado, "evento-descartado")).toHaveLength(4);
    expect(avisosDe(resultado, "nota-fuera-de-escala")).toHaveLength(1);
    expect(resultado.resumen.eventos).toBe(2);
  });

  it("reporta campos que no son listas sin romper", () => {
    const resultado = importarOk(
      legacy([
        { id: "AAA", codigo: "AAA", nombre: "A", estado: "final", aplazos: 2, historial: "no" },
        { id: "p", nombre: "P", anio: 1, reqCursar: "AAA" },
      ]),
    );
    expect(avisosDe(resultado, "dato-invalido")).toHaveLength(2);
    expect(avisosDe(resultado, "correlativa-sin-resolver")).toHaveLength(1);
  });
});

describe("importarLegacy: fuente del historial", () => {
  const conEvento = (fuente: unknown) =>
    legacy(
      [
        {
          id: "AAA",
          codigo: "AAA",
          nombre: "A",
          estado: "final",
          historial: [{ fecha: "2024-01-01", tipo: "Regularidad", nota: 7, resultado: "Aprobado" }],
        },
      ],
      { fuente },
    );

  it.each([
    ["SIU Guaraní", "siu"],
    ["SIU", "siu"],
    ["siu guaraní", "manual"],
    ["Importado de SIU", "manual"],
    [undefined, "manual"],
    [3, "manual"],
  ])("con fuente %j usa %s", (fuente, esperada) => {
    expect(importarOk(conEvento(fuente)).datos.historial[0]?.fuente).toBe(esperada);
  });
});

/* ---------- Respaldo nuevo ---------- */

const planOrigen = planLcd(1);
const planDestino = planLcd(2);
const uuid = (plan: PlanCompleto, codigo: string) =>
  plan.materias.find((m) => m.codigo === codigo)?.id as string;

const ID_A = uuid(planOrigen, "GMA0136");
const ID_B = uuid(planOrigen, "GES0132");
const SHA = "a".repeat(64);

function datosOrigen(): DatosAlumno {
  return {
    ...planOrigen,
    materias: [
      ...planOrigen.materias,
      materia("propia-1", { codigo: null, nombre: "Optativa", area: "Libre", ownerId: "alumno" }),
      materia("propia-2", { codigo: "OPT2", nombre: "Otra", ownerId: "alumno", anio: 0 }),
    ],
    correlativas: [
      ...planOrigen.correlativas,
      { materiaId: "propia-1", requiereId: ID_A, para: "cursar", condicion: "regular" },
      { materiaId: "propia-1", requiereId: "propia-2", para: "rendir", condicion: "aprobada" },
    ],
    progreso: [
      fila(ID_A, { estado: "aprobada", nota: 8, notaFinalExamen: 8, aplazos: [2] }),
      fila(ID_B, { estado: "cursando", p1: 6 }),
      fila("propia-1", { estado: "aprobada", nota: 10 }),
    ],
    historial: [
      { ...evento(ID_A, "2024-01-01", "Examen", "Reprobado", 2), fuente: "siu" },
      { ...evento(ID_A, "2024-03-01", "Examen", "Aprobado", 8), fuente: "ia" },
      evento("propia-1", "2024-04-01", "Promocion", "Promocionado", 10),
    ],
  };
}

const baseMaterial = {
  visibilidad: "compartido" as const,
  anonimo: true,
  oculto: true,
  periodo: "2025-2C",
  createdAt: "2025-01-01T00:00:00.000Z",
};

const materialesOrigen: Material[] = [
  {
    ...baseMaterial,
    id: "l",
    tipo: "link",
    materiaId: ID_A,
    titulo: "Clase",
    url: "https://x.org",
  },
  { ...baseMaterial, id: "n", tipo: "nota", materiaId: "propia-1", titulo: "Nota", texto: "Hola" },
  {
    ...baseMaterial,
    id: "a",
    tipo: "archivo",
    materiaId: null,
    titulo: "Apunte.pdf",
    driveFileId: "drive",
    documento: { id: "doc", sha256: SHA, mime: "application/pdf", bytes: 10, paginas: 2 },
  },
];

function respaldoJson(cambios: object = {}) {
  const { respaldo } = crearRespaldo(datosOrigen(), materialesOrigen, "2026-11-03T00:00:00.000Z");
  return { ...JSON.parse(JSON.stringify(respaldo)), ...cambios };
}

function leerOk(json: unknown, plan: PlanCompleto = planDestino) {
  const resultado = leerRespaldo(json, plan);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado;
}

describe("crearRespaldo", () => {
  it("referencia al catálogo por código y a lo propio por clave, sin uuids del catálogo", () => {
    const json = respaldoJson();
    expect(json).toMatchObject({
      formato: FORMATO_RESPALDO,
      version: 1,
      creadoEn: "2026-11-03T00:00:00.000Z",
      plan: { universidad: "UCA", carrera: "LCD", version: "7023" },
    });
    expect(json.progreso[0].materia).toEqual({ codigo: "GMA0136" });
    expect(json.progreso[2].materia).toEqual({ clave: "propia-1" });
    expect(JSON.stringify(json)).not.toContain(ID_A);
  });

  it("guarda los archivos solo como metadatos", () => {
    const archivo = respaldoJson().materiales[2];
    expect(archivo).toEqual({
      materia: null,
      titulo: "Apunte.pdf",
      periodo: "2025-2C",
      createdAt: "2025-01-01T00:00:00.000Z",
      tipo: "archivo",
      sha256: SHA,
      mime: "application/pdf",
      bytes: 10,
      paginas: 2,
    });
  });

  it("no guarda visibilidad, anonimato ni ocultamiento", () => {
    const texto = JSON.stringify(respaldoJson());
    expect(texto).not.toContain("visibilidad");
    expect(texto).not.toContain("oculto");
    expect(texto).not.toContain("anonimo");
  });

  it("devuelve los materiales de otro plan como omitidos", () => {
    const ajeno: Material = {
      ...baseMaterial,
      id: "z",
      tipo: "nota",
      materiaId: "otro-plan",
      titulo: "Z",
      texto: "z",
    };
    const { respaldo, materialesOmitidos } = crearRespaldo(datosOrigen(), [ajeno], "2026");
    expect(respaldo.materiales).toEqual([]);
    expect(materialesOmitidos).toEqual([ajeno]);
  });
});

describe("leerRespaldo: ida y vuelta", () => {
  it("recupera lo mismo en otro entorno, con otros uuids", () => {
    const resultado = leerOk(respaldoJson());
    const idA = uuid(planDestino, "GMA0136");
    const idB = uuid(planDestino, "GES0132");
    expect(idA).not.toBe(ID_A);
    expect(resultado.reporte.avisos).toEqual([]);

    const original = datosOrigen();
    const traducir = (id: string) => (id === ID_A ? idA : id === ID_B ? idB : id);
    expect(resultado.datos.progreso).toEqual(
      original.progreso.map((p) => ({ ...p, materiaId: traducir(p.materiaId) })),
    );
    expect(resultado.datos.historial).toEqual(
      original.historial.map((h) => ({ ...h, materiaId: traducir(h.materiaId) })),
    );
    expect(resultado.datos.materiasPropias).toEqual([
      {
        clave: "propia-1",
        codigo: null,
        nombre: "Optativa",
        anio: 1,
        cuatrimestre: 1,
        tipo: "Materia",
        area: "Libre",
        requiereAnioCompletoParaCursar: null,
        correlativas: [
          { requiere: idA, para: "cursar", condicion: "regular" },
          { requiere: "propia-2", para: "rendir", condicion: "aprobada" },
        ],
      },
      {
        clave: "propia-2",
        codigo: "OPT2",
        nombre: "Otra",
        anio: 0,
        cuatrimestre: 1,
        tipo: "Materia",
        area: null,
        requiereAnioCompletoParaCursar: null,
        correlativas: [],
      },
    ]);
    expect(resultado.materiales).toEqual([
      { ...materialComun(idA), tipo: "link", titulo: "Clase", url: "https://x.org" },
      { ...materialComun("propia-1"), tipo: "nota", titulo: "Nota", texto: "Hola" },
      {
        ...materialComun(null),
        tipo: "archivo",
        titulo: "Apunte.pdf",
        sha256: SHA,
        mime: "application/pdf",
        bytes: 10,
        paginas: 2,
      },
    ]);
    expect(resultado.resumen).toEqual({
      totalMaterias: 52,
      porEstado: { aprobada: 2, cursando: 1, final: 0, pendiente: 49 },
      materiasConMatch: 2,
      materiasPropias: 2,
      eventos: 3,
      materiales: 3,
      avisos: 0,
    });
  });

  it("da los mismos cálculos después de la ida y vuelta", () => {
    const original = datosOrigen();
    const resultado = leerOk(respaldoJson());
    const restaurados = datosAlumnoDesdeImportacion(planDestino, resultado.datos);
    expect(progresoCarrera(restaurados)).toEqual(progresoCarrera(original));
    expect(promedio(restaurados, true)).toEqual(promedio(original, true));
    const propia = restaurados.materias.find((m) => m.id === "propia-1")!;
    expect(estadoCorrelativas(restaurados, propia, "cursar").ok).toBe(true);
    expect(estadoCorrelativas(restaurados, propia, "rendir").faltan[0]?.materia.id).toBe(
      "propia-2",
    );
  });

  it("un respaldo creado sobre lo restaurado es igual al original", () => {
    const original = respaldoJson();
    const resultado = leerOk(original);
    const restaurados = datosAlumnoDesdeImportacion(planDestino, resultado.datos);
    const segundo = crearRespaldo(restaurados, [], "2026-11-03T00:00:00.000Z").respaldo;
    expect(JSON.parse(JSON.stringify(segundo))).toEqual({ ...original, materiales: [] });
  });
});

function materialComun(materiaId: string | null) {
  return { materiaId, periodo: "2025-2C", createdAt: "2025-01-01T00:00:00.000Z" };
}

describe("leerRespaldo: rechazos", () => {
  it("rechaza un respaldo de otro plan por versión", () => {
    const plan = { universidad: "UCA", carrera: "LCD", version: "9999" };
    expect(leerRespaldo(respaldoJson({ plan }), planDestino)).toEqual({
      ok: false,
      error:
        "Este respaldo es de UCA LCD plan 9999 y estás en UCA LCD plan 7023. Cambiá de plan para restaurarlo.",
    });
  });

  it("rechaza un respaldo de otra carrera con la misma versión y los mismos códigos", () => {
    const plan = { universidad: "UCA", carrera: "OTRA", version: "7023" };
    expect(leerRespaldo(respaldoJson({ plan }), planDestino)).toEqual({
      ok: false,
      error:
        "Este respaldo es de UCA OTRA plan 7023 y estás en UCA LCD plan 7023. Cambiá de plan para restaurarlo.",
    });
  });

  it("rechaza un respaldo de otra universidad con la misma carrera y versión", () => {
    const plan = { universidad: "UBA", carrera: "LCD", version: "7023" };
    expect(leerRespaldo(respaldoJson({ plan }), planDestino).ok).toBe(false);
  });

  it("una sigla vacía solo coincide con otra vacía", () => {
    const plan = { universidad: null, carrera: "LCD", version: "7023" };
    expect(leerRespaldo(respaldoJson({ plan }), planDestino).ok).toBe(false);
    const sinSigla: PlanCompleto = { ...planDestino, universidadSigla: null };
    expect(leerRespaldo(respaldoJson({ plan }), sinSigla).ok).toBe(true);
    expect(leerRespaldo(respaldoJson(), sinSigla).ok).toBe(false);
  });

  it("rechaza un respaldo sin las siglas del plan", () => {
    const resultado = leerRespaldo(respaldoJson({ plan: { version: "7023" } }), planDestino);
    expect(resultado.ok).toBe(false);
  });

  it("rechaza un respaldo de otro plan con la misma versión y otros códigos", () => {
    const otroPlan: PlanCompleto = { ...planChico, plan: planBase({ version: "7023" }) };
    const resultado = leerRespaldo(respaldoJson(), otroPlan);
    expect(resultado).toEqual({
      ok: false,
      error: "Este respaldo es de otro plan: ninguna de sus materias está en el plan 7023.",
    });
  });

  it("rechaza una versión de formato más nueva", () => {
    const resultado = leerRespaldo(respaldoJson({ version: 2 }), planDestino);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toContain("más nueva");
  });

  it.each([
    [null],
    [{ materias: [] }],
    [{ formato: "otra-app", version: 1 }],
    [{ formato: FORMATO_RESPALDO }],
    [{ formato: FORMATO_RESPALDO, version: 1 }],
  ])("rechaza %j sin lanzar", (json) => {
    const resultado = leerRespaldo(json, planDestino);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/respaldo/i);
  });

  it("indica el dato inválido", () => {
    const resultado = leerRespaldo(respaldoJson({ historial: "no" }), planDestino);
    expect(resultado).toEqual({
      ok: false,
      error: 'El respaldo no es válido: revisá el dato en "historial".',
    });
  });
});

describe("leerRespaldo: datos que no se confían", () => {
  it("reporta y descarta lo que no se puede mapear, sin perder el resto", () => {
    const base = respaldoJson();
    const json = {
      ...base,
      progreso: [
        ...base.progreso,
        { materia: { codigo: "NOEXISTE" }, estado: "aprobada", nota: 9 },
        { materia: { codigo: "GCO0137" }, estado: "volando", nota: 15, aplazos: [99] },
        { materia: { codigo: "GCO0137" }, estado: "aprobada" },
      ],
      historial: [
        ...base.historial,
        {
          materia: { clave: "fantasma" },
          fecha: "2024-01-01",
          tipo: "Examen",
          resultado: "Ausente",
        },
        {
          materia: { codigo: "GCO0137" },
          fecha: "2024-01-01",
          tipo: "Examen",
          resultado: "Ausente",
          nota: null,
          fuente: "chat",
        },
      ],
    };
    const resultado = leerOk(json);
    const fila = resultado.datos.progreso.find((p) => p.materiaId === uuid(planDestino, "GCO0137"));
    expect(fila).toMatchObject({ estado: "pendiente", nota: null, aplazos: [] });
    expect(avisosDe(resultado, "referencia-sin-resolver")).toHaveLength(2);
    expect(avisosDe(resultado, "estado-desconocido")).toHaveLength(1);
    expect(avisosDe(resultado, "nota-fuera-de-escala")).toHaveLength(2);
    expect(avisosDe(resultado, "dato-invalido")).toHaveLength(2);
    expect(resultado.datos.historial.at(-1)?.fuente).toBe("manual");
  });

  it("descarta links que no son http(s) y sha256 inválidos", () => {
    const comun = { materia: null, titulo: "M", periodo: null, createdAt: "2025" };
    const resultado = leerOk(
      respaldoJson({
        materiales: [
          { ...comun, tipo: "link", url: "javascript:alert(1)" },
          { ...comun, tipo: "archivo", sha256: "corto", mime: null, bytes: null, paginas: null },
          { ...comun, tipo: "link", url: "HTTPS://ok.org" },
        ],
      }),
    );
    expect(resultado.materiales.map((m) => m.tipo)).toEqual(["link"]);
    expect(avisosDe(resultado, "material-descartado")).toHaveLength(2);
  });

  it("acepta un link solo si empieza con http:// o https://, sin distinguir mayúsculas", () => {
    const aceptados = [
      "http://x.org",
      "https://x.org",
      "HTTP://x.org",
      "HTTPS://x.org",
      "hTtPs://x.org",
      "https://",
    ];
    const rechazados = [
      "",
      "x.org",
      "//x.org",
      "ftp://x.org",
      "javascript:alert(1)",
      "http:/x.org",
      "https:x.org",
      "httpss://x.org",
      " https://x.org",
      "\nhttps://x.org",
      "javascript:alert(1)//\nhttps://x.org",
      "ht\u017Ftp://x.org",
      "http\u017F://x.org",
    ];
    const comun = { materia: null, periodo: null, createdAt: "2025", tipo: "link" };
    const resultado = leerOk(
      respaldoJson({
        materiales: [...aceptados, ...rechazados].map((url) => ({
          ...comun,
          titulo: `Link ${url}`,
          url,
        })),
      }),
    );
    expect(resultado.materiales.map((m) => m.titulo)).toEqual(aceptados.map((u) => `Link ${u}`));
    expect(avisosDe(resultado, "material-descartado")).toHaveLength(rechazados.length);
  });

  it("deja sin materia un material cuya materia no está en el plan", () => {
    const comun = { titulo: "M", periodo: null, createdAt: "2025" };
    const resultado = leerOk(
      respaldoJson({
        materiales: [{ ...comun, materia: { codigo: "NOEXISTE" }, tipo: "nota", texto: "t" }],
      }),
    );
    expect(resultado.materiales[0]?.materiaId).toBeNull();
    expect(avisosDe(resultado, "referencia-sin-resolver")).toHaveLength(1);
  });

  it("reporta correlativas sin resolver y claves repetidas de materias propias", () => {
    const base = respaldoJson();
    const propia = {
      ...base.materiasPropias[1],
      clave: "nueva",
      correlativas: [
        { requiere: { codigo: "NOEXISTE" }, para: "cursar", condicion: "regular" },
        { requiere: { clave: "nueva" }, para: "cursar", condicion: "regular" },
      ],
    };
    const resultado = leerOk({
      ...base,
      materiasPropias: [...base.materiasPropias, propia, base.materiasPropias[0]],
    });
    expect(avisosDe(resultado, "correlativa-sin-resolver")).toHaveLength(2);
    expect(avisosDe(resultado, "materia-descartada")).toHaveLength(1);
    expect(resultado.datos.materiasPropias).toHaveLength(3);
  });

  it("valida las notas contra la escala del plan de destino", () => {
    const plan = {
      ...planDestino,
      plan: planBase({ notaMin: 1, notaMax: 7, notaAprobacion: 6 }),
    };
    const resultado = leerOk(respaldoJson(), plan);
    const fila = resultado.datos.progreso.find((p) => p.materiaId === "propia-1");
    expect(fila?.nota).toBeNull();
    expect(avisosDe(resultado, "nota-fuera-de-escala").length).toBeGreaterThan(0);
  });
});

describe("una sola entrada para la UI", () => {
  it("detecta el formato", () => {
    expect(detectarFormatoRespaldo(legacyCaso)).toBe("legacy");
    expect(detectarFormatoRespaldo(respaldoJson())).toBe("nuevo");
    expect(detectarFormatoRespaldo({ materias: 3 })).toBeNull();
    expect(detectarFormatoRespaldo({ formato: "otro", materias: [] })).toBeNull();
    expect(detectarFormatoRespaldo(null)).toBeNull();
    expect(detectarFormatoRespaldo([1])).toBeNull();
  });

  it("importa cada formato por la misma función", () => {
    const viejo = importarArchivo(legacyCaso, planDestino);
    expect(viejo).toMatchObject({ ok: true, formato: "legacy", materiales: [] });
    const nuevo = importarArchivo(respaldoJson(), planDestino);
    expect(nuevo).toMatchObject({ ok: true, formato: "nuevo" });
    if (nuevo.ok) expect(nuevo.materiales).toHaveLength(3);
  });

  it("rechaza lo desconocido y deja pasar el error de cada lector", () => {
    expect(importarArchivo({ hola: 1 }, planDestino)).toEqual({
      ok: false,
      error: "El archivo no parece un respaldo de EstudIA ni de Mi Plan de Estudio.",
    });
    expect(importarArchivo(legacy([{ id: "x" }]), planDestino).ok).toBe(false);
    expect(importarArchivo(respaldoJson({ plan: { version: "1" } }), planDestino).ok).toBe(false);
  });

  it("parsea el texto del archivo con un mensaje claro", () => {
    expect(parsearArchivo('{"a":1}')).toEqual({ ok: true, json: { a: 1 } });
    expect(parsearArchivo("{roto")).toEqual({
      ok: false,
      error: "El archivo no es un JSON válido.",
    });
  });
});

describe("M4: la vista previa cuenta igual que reemplazar_datos_del_plan", () => {
  const catalogo = [materia("uuid-a", { codigo: "AAA" }), materia("uuid-b", { codigo: "BBB" })];
  const propia = (id: string, codigo: string | null, nombre: string, orden: number) =>
    materia(id, { codigo, nombre, orden, ownerId: "alumno" });
  const planCon = (...propias: PlanCompleto["materias"]): PlanCompleto => ({
    ...planChico,
    materias: [...catalogo, ...propias],
  });
  const importada = (
    clave: string,
    codigo: string | null,
    nombre = "Optativa",
    correlativas: MateriaPropiaImportada["correlativas"] = [],
  ): MateriaPropiaImportada => ({
    clave,
    codigo,
    nombre,
    anio: 1,
    cuatrimestre: 1,
    tipo: "Materia",
    area: null,
    requiereAnioCompletoParaCursar: null,
    correlativas,
  });
  const datosCon = (...materiasPropias: MateriaPropiaImportada[]): DatosImportados => ({
    materiasPropias,
    progreso: [],
    historial: [],
  });
  const conservadas = (plan: PlanCompleto, datos: DatosImportados) =>
    materiasPropiasConservadas(plan, datos).map((m) => m.id);
  const total = (plan: PlanCompleto, datos: DatosImportados) =>
    progresoCarrera(datosAlumnoDesdeImportacion(plan, datos)).total;

  describe("dos con igual código", () => {
    const datos = datosCon(importada("k1", "PRO", "Uno"), importada("k2", "PRO", "Dos"));

    it("sin ninguna en la base, crean dos materias", () => {
      const quedaria = datosAlumnoDesdeImportacion(planCon(), datos);
      expect(quedaria.materias.map((m) => m.id)).toEqual(["uuid-a", "uuid-b", "k1", "k2"]);
    });

    it("con una en la base, la primera la reutiliza y la segunda crea otra", () => {
      const plan = planCon(propia("p1", "PRO", "Vieja", 5));
      expect(conservadas(plan, datos)).toEqual([]);
      expect(total(plan, datos)).toBe(4);
    });

    it("con dos en la base, reutilizan una cada una", () => {
      const plan = planCon(propia("p1", "PRO", "A", 5), propia("p2", "PRO", "B", 6));
      expect(conservadas(plan, datos)).toEqual([]);
      expect(total(plan, datos)).toBe(4);
    });

    it("con dos en la base y una en el archivo, se conserva la otra", () => {
      const plan = planCon(propia("p1", "PRO", "A", 5), propia("p2", "PRO", "B", 6));
      const una = datosCon(importada("k1", "PRO"));
      expect(conservadas(plan, una)).toEqual(["p2"]);
      expect(total(plan, una)).toBe(4);
    });

    it("el resumen del archivo cuenta lo mismo", () => {
      const plan = planCon(propia("p1", "AAA2", "A", 5));
      const json = legacy([
        ANCLA,
        { id: "x", codigo: "AAA2", nombre: "Uno" },
        { id: "y", codigo: "AAA2", nombre: "Dos" },
      ]);
      const { resumen, datos: leidos } = importarOk(json, { ...plan, materias: plan.materias });
      expect(leidos.materiasPropias.map((m) => m.clave)).toEqual(["x", "y"]);
      expect(resumen.materiasPropias).toBe(2);
      expect(resumen.totalMaterias).toBe(4);
    });
  });

  describe("dos sin código y con igual nombre", () => {
    const datos = datosCon(importada("k1", null), importada("k2", null));

    it("con una en la base, la primera la reutiliza y la segunda crea otra", () => {
      const plan = planCon(propia("p1", null, "Optativa", 5));
      expect(conservadas(plan, datos)).toEqual([]);
      expect(total(plan, datos)).toBe(4);
    });

    it("con tres en la base, se conserva la que sobra", () => {
      const plan = planCon(
        propia("p1", null, "Optativa", 5),
        propia("p2", null, "Optativa", 6),
        propia("p3", null, "Optativa", 7),
      );
      expect(conservadas(plan, datos)).toEqual(["p3"]);
      expect(total(plan, datos)).toBe(5);
    });

    it("no empareja con otro nombre ni con una materia con código", () => {
      const plan = planCon(propia("p1", null, "Otra", 5), propia("p2", "PRO", "Optativa", 6));
      expect(conservadas(plan, datos)).toEqual(["p1", "p2"]);
      expect(total(plan, datos)).toBe(6);
    });

    it("una materia con código no reutiliza a otra sin código de igual nombre", () => {
      const plan = planCon(propia("p1", null, "Optativa", 5));
      expect(conservadas(plan, datosCon(importada("k1", "PRO")))).toEqual(["p1"]);
    });

    it("las del archivo se reparten en su orden, sin mezclar grupos", () => {
      const plan = planCon(propia("p1", null, "Optativa", 5), propia("p2", "PRO", "X", 6));
      const mezclados = datosCon(
        importada("k1", "PRO"),
        importada("k2", null),
        importada("k3", "PRO"),
      );
      expect(conservadas(plan, mezclados)).toEqual([]);
      expect(total(plan, mezclados)).toBe(5);
    });
  });

  describe("una correlativa de la otra", () => {
    const datos = datosCon(
      importada("k1", "PRO", "Base"),
      importada("k2", "PRO", "Sigue", [{ requiere: "k1", para: "cursar", condicion: "aprobada" }]),
    );

    it("no se vuelve una correlativa de una materia a sí misma", () => {
      for (const plan of [planCon(), planCon(propia("p1", "PRO", "Vieja", 5))]) {
        const quedaria = datosAlumnoDesdeImportacion(plan, datos);
        expect(quedaria.correlativas).toEqual([
          { materiaId: "k2", requiereId: "k1", para: "cursar", condicion: "aprobada" },
        ]);
        const sigue = quedaria.materias.find((m) => m.id === "k2")!;
        expect(estadoCorrelativas(quedaria, sigue, "cursar").faltan[0]?.materia.id).toBe("k1");
      }
    });

    it("sobrevive a un respaldo y a un legacy, cada una con su clave", () => {
      const origen: DatosAlumno = {
        ...planChico,
        materias: [...catalogo, propia("p1", "PRO", "Base", 5), propia("p2", "PRO", "Sigue", 6)],
        correlativas: [
          { materiaId: "p2", requiereId: "p1", para: "cursar", condicion: "aprobada" },
        ],
        progreso: [],
        historial: [],
      };
      const { respaldo } = crearRespaldo(origen, [], "2026-11-05T00:00:00.000Z");
      const leido = leerRespaldo(JSON.parse(JSON.stringify(respaldo)), planCon());
      if (!leido.ok) throw new Error(leido.error);
      expect(leido.reporte.avisos).toEqual([]);
      expect(leido.datos.materiasPropias.find((m) => m.clave === "p2")?.correlativas).toEqual([
        { requiere: "p1", para: "cursar", condicion: "aprobada" },
      ]);

      const viejo = importarOk(
        legacy([
          ANCLA,
          { id: "x", codigo: "PRO", nombre: "Base" },
          { id: "y", codigo: "PRO", nombre: "Sigue", reqCursar: ["x"] },
        ]),
        planCon(),
      );
      expect(viejo.datos.materiasPropias[1]?.correlativas).toEqual([
        { requiere: "x", para: "cursar", condicion: "aprobada" },
      ]);
    });

    it("una conservada que requiere a una reutilizada la sigue requiriendo", () => {
      const plan: PlanCompleto = {
        ...planCon(propia("p1", "PRO", "Reutilizada", 5), propia("p2", "OTR", "Conservada", 6)),
        correlativas: [
          { materiaId: "p2", requiereId: "p1", para: "cursar", condicion: "aprobada" },
          { materiaId: "p1", requiereId: "uuid-a", para: "cursar", condicion: "aprobada" },
        ],
      };
      const quedaria = datosAlumnoDesdeImportacion(plan, datosCon(importada("k1", "PRO")));
      expect(quedaria.correlativas).toEqual([
        { materiaId: "p2", requiereId: "k1", para: "cursar", condicion: "aprobada" },
      ]);
      const conservada = quedaria.materias.find((m) => m.id === "p2")!;
      expect(estadoCorrelativas(quedaria, conservada, "cursar").ok).toBe(false);
    });
  });

  describe("código con espacios", () => {
    it("saca los espacios del archivo antes de comparar", () => {
      const plan = planCon(propia("p1", "PRO", "A", 5));
      expect(conservadas(plan, datosCon(importada("k1", "  PRO ")))).toEqual([]);
    });

    it("dos que difieren solo en espacios cuentan como iguales", () => {
      const plan = planCon(propia("p1", "PRO", "A", 5));
      const datos = datosCon(importada("k1", " PRO"), importada("k2", "PRO "));
      expect(conservadas(plan, datos)).toEqual([]);
      expect(total(plan, datos)).toBe(4);
    });

    it("un código de puros espacios cuenta como sin código y empareja por nombre", () => {
      const plan = planCon(propia("p1", null, "Optativa", 5), propia("p2", "   ", "Optativa", 6));
      expect(conservadas(plan, datosCon(importada("k1", "   ")))).toEqual(["p2"]);
    });

    it("como btrim, no saca tabs ni saltos de línea", () => {
      const plan = planCon(propia("p1", "PRO", "A", 5));
      expect(conservadas(plan, datosCon(importada("k1", "\tPRO")))).toEqual(["p1"]);
      expect(conservadas(plan, datosCon(importada("k1", "PRO\n")))).toEqual(["p1"]);
      expect(conservadas(plan, datosCon(importada("k1", "\t ")))).toEqual(["p1"]);
    });

    it("no normaliza el código que ya está en la base, como la RPC", () => {
      const plan = planCon(propia("p1", " PRO ", "A", 5));
      expect(conservadas(plan, datosCon(importada("k1", "PRO")))).toEqual(["p1"]);
    });

    it("la vista previa muestra el código como quedaría guardado", () => {
      const quedaria = datosAlumnoDesdeImportacion(
        planCon(),
        datosCon(importada("k1", " PRO "), importada("k2", "   ")),
      );
      expect(quedaria.materias.slice(-2).map((m) => m.codigo)).toEqual(["PRO", null]);
    });
  });

  it("entre varias iguales reutiliza la de menor orden, sin importar el orden de la lista", () => {
    const plan = planCon(propia("p2", "PRO", "B", 6), propia("p1", "PRO", "A", 5));
    expect(conservadas(plan, datosCon(importada("k1", "PRO")))).toEqual(["p2"]);
  });

  it("una reutilizada mantiene su orden y una nueva va al final de todo", () => {
    const plan = planCon(propia("p1", "PRO", "A", 5), propia("p2", "OTR", "B", 9));
    const quedaria = datosAlumnoDesdeImportacion(
      plan,
      datosCon(importada("k1", "PRO"), importada("k2", "NUE")),
    );
    const orden = (id: string) => quedaria.materias.find((m) => m.id === id)?.orden;
    expect(orden("k1")).toBe(5);
    expect(orden("k2")).toBe(10);
  });
});

describe("M4: dos materias propias duplicadas en el respaldo", () => {
  const origen = (codigo: string | null): DatosAlumno => ({
    ...planOrigen,
    materias: [
      ...planOrigen.materias,
      materia("dup-1", { codigo, nombre: "Optativa", ownerId: "alumno", area: "Uno" }),
      materia("dup-2", { codigo, nombre: "Optativa", ownerId: "alumno", area: "Dos" }),
    ],
    correlativas: [
      ...planOrigen.correlativas,
      { materiaId: "dup-2", requiereId: "dup-1", para: "rendir", condicion: "aprobada" },
    ],
    progreso: [
      fila(ID_A, { estado: "aprobada", nota: 8 }),
      fila("dup-1", { estado: "aprobada", nota: 7 }),
      fila("dup-2", { estado: "cursando", p1: 6 }),
    ],
    historial: [
      evento("dup-1", "2024-01-01", "Promocion", "Promocionado", 7),
      evento("dup-2", "2024-02-01", "En curso", "En curso", null),
    ],
  });
  const materiales: Material[] = [
    { ...baseMaterial, id: "n1", tipo: "nota", materiaId: "dup-1", titulo: "Uno", texto: "a" },
    { ...baseMaterial, id: "n2", tipo: "nota", materiaId: "dup-2", titulo: "Dos", texto: "b" },
  ];

  for (const [caso, codigo] of [
    ["igual código", "OPT"],
    ["sin código", null],
  ] as const) {
    it(`${caso}: salen con claves distintas y sin perder datos`, () => {
      const { respaldo, materialesOmitidos } = crearRespaldo(origen(codigo), materiales, "2026");
      expect(materialesOmitidos).toEqual([]);
      expect(respaldo.materiasPropias.map((m) => m.clave)).toEqual(["dup-1", "dup-2"]);

      const resultado = leerOk(JSON.parse(JSON.stringify(respaldo)));
      expect(resultado.reporte.avisos).toEqual([]);
      expect(resultado.datos.materiasPropias.map((m) => [m.clave, m.area])).toEqual([
        ["dup-1", "Uno"],
        ["dup-2", "Dos"],
      ]);
      expect(resultado.datos.materiasPropias[1]?.correlativas).toEqual([
        { requiere: "dup-1", para: "rendir", condicion: "aprobada" },
      ]);
      const notaDe = (id: string) => resultado.datos.progreso.find((p) => p.materiaId === id);
      expect(notaDe("dup-1")).toMatchObject({ estado: "aprobada", nota: 7 });
      expect(notaDe("dup-2")).toMatchObject({ estado: "cursando", p1: 6 });
      expect(resultado.datos.historial.map((e) => e.materiaId)).toEqual(["dup-1", "dup-2"]);
      expect(resultado.materiales.map((m) => m.materiaId)).toEqual(["dup-1", "dup-2"]);
      expect(resultado.resumen.materiasPropias).toBe(2);
    });
  }

  it("legacy: dos con igual código e id distinto entran las dos, con sus datos", () => {
    const resultado = importarOk(
      legacy([
        ANCLA,
        { id: "x", codigo: "OPT", nombre: "Uno", estado: "aprobada", nota: 7 },
        { id: "y", codigo: "OPT", nombre: "Dos", estado: "cursando" },
      ]),
    );
    expect(avisosDe(resultado, "materia-descartada")).toEqual([]);
    expect(resultado.datos.materiasPropias.map((m) => m.clave)).toEqual(["x", "y"]);
    expect(resultado.datos.progreso.map((p) => [p.materiaId, p.estado])).toEqual([
      ["x", "aprobada"],
      ["y", "cursando"],
    ]);
  });

  it("legacy: dos sin código y con igual nombre entran las dos", () => {
    const resultado = importarOk(
      legacy([ANCLA, { id: "x", nombre: "Uno" }, { id: "y", nombre: "Uno" }]),
    );
    expect(avisosDe(resultado, "materia-descartada")).toEqual([]);
    expect(resultado.datos.materiasPropias.map((m) => m.clave)).toEqual(["x", "y"]);
  });
});
