import { describe, expect, it } from "vitest";
import legacy from "../../../../fixtures/caso-prueba-legacy.json";
import {
  datosDe,
  evento,
  fila,
  materia,
  planBase,
  planLcd,
  redondear4,
} from "../pruebas/auxiliares";
import {
  alEditarNota,
  alertaAnioCompleto,
  conteoPorEstado,
  cumpleCondicion,
  datosAlumnoDesdeImportacion,
  dieces,
  distribucionNotas,
  estadoCorrelativas,
  estadoDe,
  importarLegacy,
  listaAplazos,
  materiasPorEstado,
  notasDeEscala,
  parsearAplazos,
  podesCursar,
  progresoCarrera,
  progresoDe,
  promedio,
  promedioEnElTiempo,
  promedioPorArea,
  promedioPorCuatrimestre,
  promocionadas,
  sugerirEstado,
} from "../index";

function datosDelCaso() {
  const plan = planLcd();
  const resultado = importarLegacy(legacy, plan);
  if (!resultado.ok) throw new Error(resultado.error);
  return datosAlumnoDesdeImportacion(plan, resultado.datos);
}

describe("estados y progreso", () => {
  it("toma como pendiente a la materia sin fila de progreso", () => {
    const datos = datosDe({ materias: [materia("A")] });
    expect(estadoDe(datos, "A")).toBe("pendiente");
    expect(progresoDe(datos, "A")).toBeNull();
    expect(materiasPorEstado(datos, "pendiente")).toHaveLength(1);
  });

  it("redondea los porcentajes como la referencia", () => {
    const datos = datosDe({
      materias: [materia("A"), materia("B"), materia("C")],
      progreso: [fila("A", { estado: "aprobada" }), fila("B", { estado: "final" })],
    });
    const progreso = progresoCarrera(datos);
    expect(progreso.porcentajeAprobado).toBe(33);
    expect(progreso.porcentajeCursado).toBe(67);
  });

  it("no cuenta filas de materias que no están en el plan", () => {
    const datos = datosDe({
      materias: [materia("A")],
      progreso: [fila("OTRA", { estado: "aprobada" })],
    });
    expect(conteoPorEstado(datos)).toEqual({ pendiente: 1, cursando: 0, final: 0, aprobada: 0 });
  });

  it("cuenta las materias propias en el total", () => {
    const datos = datosDe({
      materias: [materia("A"), materia("P", { ownerId: "alumno", codigo: null })],
      progreso: [fila("P", { estado: "aprobada" })],
    });
    expect(progresoCarrera(datos).porcentajeAprobado).toBe(50);
  });
});

describe("plan vacío y alumno sin notas", () => {
  it("no rompe con un plan vacío", () => {
    const datos = datosDe();
    expect(progresoCarrera(datos)).toEqual({
      total: 0,
      porEstado: { pendiente: 0, cursando: 0, final: 0, aprobada: 0 },
      porcentajeAprobado: 0,
      porcentajeCursado: 0,
    });
    expect(promedio(datos, false)).toEqual({ promedio: null, n: 0 });
    expect(promedio(datos, true)).toEqual({ promedio: null, n: 0 });
    expect(promedioPorCuatrimestre(datos, false)).toEqual([]);
    expect(promedioPorArea(datos, false)).toEqual([]);
    expect(promedioEnElTiempo(datos, true)).toEqual([]);
    expect(listaAplazos(datos)).toEqual([]);
    expect(podesCursar(datos)).toEqual([]);
    expect(alertaAnioCompleto(datos)).toBeNull();
  });

  it("da promedio null sin notas, aunque haya materias", () => {
    const datos = datosDe({
      materias: [materia("A", { area: "Matemática" })],
      progreso: [fila("A", { estado: "aprobada", nota: null })],
    });
    expect(promedio(datos, false)).toEqual({ promedio: null, n: 0 });
    expect(promedioPorCuatrimestre(datos, false)).toEqual([]);
    expect(promedioPorArea(datos, false)).toEqual([]);
  });
});

describe("promedios", () => {
  it("con aplazos suma también los de materias no aprobadas; sin aplazos, no", () => {
    const datos = datosDe({
      materias: [materia("A"), materia("B")],
      progreso: [
        fila("A", { estado: "aprobada", nota: 8 }),
        fila("B", { estado: "final", nota: 9, aplazos: [2] }),
      ],
    });
    expect(promedio(datos, false)).toEqual({ promedio: 8, n: 1 });
    expect(promedio(datos, true)).toEqual({ promedio: 5, n: 2 });
  });

  it("deja afuera del promedio por cuatrimestre a extras y anuales", () => {
    const datos = datosDe({
      materias: [
        materia("A", { anio: 2, cuatrimestre: 1 }),
        materia("E", { anio: 0, cuatrimestre: null }),
        materia("Z", { anio: 2, cuatrimestre: null }),
        materia("B", { anio: 1, cuatrimestre: 3 }),
      ],
      progreso: ["A", "E", "Z", "B"].map((id) => fila(id, { estado: "aprobada", nota: 7 })),
    });
    expect(promedioPorCuatrimestre(datos, false)).toEqual([
      { anio: 1, cuatrimestre: 3, conAplazos: false, promedio: 7, n: 1 },
      { anio: 2, cuatrimestre: 1, conAplazos: false, promedio: 7, n: 1 },
    ]);
  });

  it("deja afuera del promedio por área a las materias sin área y ordena de mayor a menor", () => {
    const datos = datosDe({
      materias: [
        materia("A", { area: "Baja" }),
        materia("B", { area: "Alta" }),
        materia("C", { area: null }),
      ],
      progreso: [
        fila("A", { estado: "aprobada", nota: 5 }),
        fila("B", { estado: "aprobada", nota: 9 }),
        fila("C", { estado: "aprobada", nota: 10 }),
      ],
    });
    expect(promedioPorArea(datos, false).map((a) => a.area)).toEqual(["Alta", "Baja"]);
  });
});

describe("promedio en el tiempo", () => {
  it("acumula a mano: ordena por fecha e ignora ausentes y cursadas desaprobadas", () => {
    const datos = datosDe({
      materias: [materia("A"), materia("B")],
      historial: [
        evento("A", "2024-03-01", "Examen", "Aprobado", 8),
        evento("B", "2024-01-01", "Examen", "Aprobado", 6),
        evento("B", "2023-12-01", "Regularidad", "Reprobado", 2),
        evento("B", "2023-12-02", "Regularidad", "Aprobado", 9),
        evento("A", "2023-12-15", "Examen", "Ausente", null),
        evento("A", "2023-12-20", "Examen", "Reprobado", 2),
        evento("B", "2024-05-01", "Promocion", "Promocionado", 10),
      ],
    });
    // Sin aplazos: 6 → (6+8)/2 = 7 → (6+8+10)/3 = 8.
    expect(promedioEnElTiempo(datos, false).map((p) => [p.fecha, p.nota, p.promedio])).toEqual([
      ["2024-01-01", 6, 6],
      ["2024-03-01", 8, 7],
      ["2024-05-01", 10, 8],
    ]);
    // Con aplazos: 2 → (2+6)/2 = 4 → (2+6+8)/3 = 5,3333 → (2+6+8+10)/4 = 6,5.
    const con = promedioEnElTiempo(datos, true);
    expect(con.map((p) => [p.nota, p.esAplazo, redondear4(p.promedio)])).toEqual([
      [2, true, 2],
      [6, false, 4],
      [8, false, 5.3333],
      [10, false, 6.5],
    ]);
  });

  it("no cuenta exámenes reprobados sin nota ni eventos de materias fuera del plan", () => {
    const datos = datosDe({
      materias: [materia("A")],
      historial: [
        evento("A", "2024-01-01", "Examen", "Reprobado", null),
        evento("OTRA", "2024-01-01", "Examen", "Aprobado", 9),
      ],
    });
    expect(promedioEnElTiempo(datos, true)).toEqual([]);
  });

  // Serie calculada aparte con un script que replica `vPromedio` sobre el JSON crudo del respaldo.
  it("coincide con la serie de vPromedio sobre el caso de prueba, sin aplazos", () => {
    const serie = promedioEnElTiempo(datosDelCaso(), false);
    expect(serie.map((p) => [p.fecha, p.materia.codigo, redondear4(p.promedio)])).toEqual([
      ["2023-07-11", "GMA0136", 9],
      ["2023-07-11", "GES0132", 8.5],
      ["2023-07-11", "GCO0137", 8],
      ["2023-07-11", "GTC0134", 8.25],
      ["2023-07-11", "GFF0881", 8.2],
      ["2023-11-23", "GFF0882", 8.3333],
      ["2023-12-12", "GMA0126", 8.5714],
      ["2023-12-12", "GTC0120", 8.25],
      ["2024-02-12", "GMA1234", 8],
      ["2024-02-12", "GCO0119", 7.8],
      ["2024-04-15", "GWA6801", 7.8182],
      ["2024-05-15", "GWA6802", 7.75],
      ["2024-07-12", "GMA0327", 7.6154],
      ["2024-07-12", "GCO0331", 7.7857],
      ["2024-07-12", "GES0235", 7.8],
      ["2024-07-12", "GFF0883", 7.6875],
      ["2024-11-24", "GFF0884", 7.7059],
      ["2024-12-14", "GCO0411", 7.8333],
      ["2024-12-14", "GCO0213", 7.7895],
      ["2024-12-14", "GES0215", 7.85],
      ["2025-02-14", "GCO0406", 7.7619],
      ["2025-07-13", "GMA0230", 7.7273],
      ["2025-07-13", "GES0310", 7.7826],
      ["2025-07-13", "GTC0312", 7.7917],
      ["2025-07-13", "GAP0314", 7.8],
      ["2025-07-13", "GFF0885", 7.7308],
    ]);
  });

  it("coincide con la serie de vPromedio sobre el caso de prueba, con aplazos", () => {
    const serie = promedioEnElTiempo(datosDelCaso(), true);
    expect(serie).toHaveLength(28);
    const aplazos = serie.filter((p) => p.esAplazo);
    expect(aplazos.map((p) => [p.fecha, p.materia.codigo, p.nota, redondear4(p.promedio)])).toEqual(
      [
        ["2023-12-12", "GMA1234", 2, 7.75],
        ["2024-12-14", "GCO0406", 3, 7.1579],
      ],
    );
    expect(serie.map((p) => redondear4(p.promedio))).toEqual([
      9, 8.5, 8, 8.25, 8.2, 8.3333, 8.5714, 7.75, 7.5556, 7.4, 7.2727, 7.3333, 7.3077, 7.2143, 7.4,
      7.4375, 7.3529, 7.3889, 7.1579, 7.3, 7.2857, 7.3636, 7.3043, 7.2917, 7.36, 7.3846, 7.4074,
      7.3571,
    ]);
  });
});

describe("vistas Promedio y Aprobadas", () => {
  it("arma la distribución del caso de prueba", () => {
    const datos = datosDelCaso();
    const sin = distribucionNotas(datos, false);
    expect(sin.map((b) => b.cantidad)).toEqual([0, 0, 0, 0, 0, 7, 4, 7, 5, 3]);
    const con = distribucionNotas(datos, true);
    expect(con.map((b) => b.cantidad)).toEqual([0, 1, 1, 0, 0, 7, 4, 7, 5, 3]);
    expect(con.filter((b) => b.desaprobada).map((b) => b.nota)).toEqual([1, 2, 3]);
  });

  it("redondea las notas no enteras en la distribución", () => {
    const datos = datosDe({
      materias: [materia("A"), materia("B")],
      progreso: [
        fila("A", { estado: "aprobada", nota: 7.5 }),
        fila("B", { estado: "aprobada", nota: 7.4 }),
      ],
    });
    const barras = distribucionNotas(datos, false);
    expect(barras.find((b) => b.nota === 7)?.cantidad).toBe(1);
    expect(barras.find((b) => b.nota === 8)?.cantidad).toBe(1);
  });

  it("lista aplazos con la nota con la que después se aprobó", () => {
    const aplazos = listaAplazos(datosDelCaso());
    expect(aplazos.map((a) => [a.materia.codigo, a.nota, a.notaMateria])).toEqual([
      ["GMA1234", 2, 6],
      ["GCO0406", 3, 6],
    ]);
  });

  it("cuenta dieces y promocionadas del caso de prueba", () => {
    const datos = datosDelCaso();
    expect(dieces(datos).map((m) => m.codigo)).toEqual(["GMA0126", "GCO0331", "GCO0411"]);
    expect(promocionadas(datos).map((m) => m.codigo)).toEqual(["GFF0882", "GFF0884"]);
  });

  it("no cuenta como promocionada a una materia que todavía no está aprobada", () => {
    const datos = datosDe({
      materias: [materia("A")],
      progreso: [fila("A", { estado: "cursando" })],
      historial: [evento("A", "2024-01-01", "Promocion", "Promocionado", 8)],
    });
    expect(promocionadas(datos)).toEqual([]);
  });
});

describe("correlativas", () => {
  it("cumple regular con final o aprobada, y aprobada solo con aprobada", () => {
    expect(cumpleCondicion("final", "regular")).toBe(true);
    expect(cumpleCondicion("aprobada", "regular")).toBe(true);
    expect(cumpleCondicion("cursando", "regular")).toBe(false);
    expect(cumpleCondicion("final", "aprobada")).toBe(false);
    expect(cumpleCondicion("aprobada", "aprobada")).toBe(true);
  });

  it("expone cada condición con su estado", () => {
    const m = materia("M");
    const datos = datosDe({
      materias: [materia("A"), materia("B"), m],
      correlativas: [
        { materiaId: "M", requiereId: "A", para: "cursar", condicion: "regular" },
        { materiaId: "M", requiereId: "B", para: "cursar", condicion: "aprobada" },
        { materiaId: "M", requiereId: "B", para: "rendir", condicion: "aprobada" },
      ],
      progreso: [fila("A", { estado: "final" }), fila("B", { estado: "final" })],
    });
    const cursar = estadoCorrelativas(datos, m, "cursar");
    expect(cursar.requisitos.map((r) => [r.materia.id, r.condicion, r.cumple])).toEqual([
      ["A", "regular", true],
      ["B", "aprobada", false],
    ]);
    expect(cursar.faltan.map((r) => r.materia.id)).toEqual(["B"]);
    expect(cursar).toMatchObject({ n: 1, ok: false, vacio: false });
  });

  it("ignora correlativas a materias inexistentes", () => {
    const m = materia("M");
    const datos = datosDe({
      materias: [m],
      correlativas: [{ materiaId: "M", requiereId: "NO", para: "cursar", condicion: "aprobada" }],
    });
    expect(estadoCorrelativas(datos, m, "cursar")).toEqual({
      requisitos: [],
      faltan: [],
      modulo: null,
      n: 0,
      ok: true,
      vacio: true,
    });
    expect(podesCursar(datos)).toEqual([m]);
  });

  it("aplica la regla de año completo solo para cursar y suma 1 requisito", () => {
    const m = materia("M", { anio: 4, requiereAnioCompletoParaCursar: 2 });
    const datos = datosDe({
      materias: [materia("A", { anio: 2 }), materia("B", { anio: 2 }), m],
      progreso: [fila("A", { estado: "final" })],
    });
    const cursar = estadoCorrelativas(datos, m, "cursar");
    expect(cursar.modulo?.anio).toBe(2);
    expect(cursar.modulo?.pendientes.map((x) => x.id)).toEqual(["A", "B"]);
    expect(cursar).toMatchObject({ n: 1, ok: false, vacio: false });
    const rendir = estadoCorrelativas(datos, m, "rendir");
    expect(rendir).toMatchObject({ modulo: null, n: 0, ok: true, vacio: true });
  });

  it("con el año completo aprobado la regla queda cumplida pero no vacía", () => {
    const m = materia("M", { anio: 4, requiereAnioCompletoParaCursar: 2 });
    const datos = datosDe({
      materias: [materia("A", { anio: 2 }), m],
      progreso: [fila("A", { estado: "aprobada" })],
    });
    expect(estadoCorrelativas(datos, m, "cursar")).toMatchObject({ n: 0, ok: true, vacio: false });
    expect(alertaAnioCompleto(datos)).toBeNull();
    expect(podesCursar(datos)).toEqual([m]);
  });

  it("podés cursar solo mira materias pendientes", () => {
    const datos = datosDe({
      materias: [materia("A"), materia("B")],
      progreso: [fila("A", { estado: "cursando" })],
    });
    expect(podesCursar(datos).map((m) => m.id)).toEqual(["B"]);
  });

  it("la alerta usa la primera materia pendiente con la regla", () => {
    const datos = datosDe({
      materias: [
        materia("A", { anio: 2 }),
        materia("C", { anio: 3, requiereAnioCompletoParaCursar: 2 }),
        materia("D", { anio: 4, requiereAnioCompletoParaCursar: 3 }),
      ],
    });
    expect(alertaAnioCompleto(datos)).toEqual({
      anioBloqueado: 3,
      anioRequerido: 2,
      pendientes: [materia("A", { anio: 2 })],
    });
  });

  it("sin materias pendientes con la regla no hay alerta", () => {
    const datos = datosDe({
      materias: [materia("A", { anio: 2 }), materia("D", { requiereAnioCompletoParaCursar: 2 })],
      progreso: [fila("D", { estado: "cursando" })],
    });
    expect(alertaAnioCompleto(datos)).toBeNull();
  });
});

describe("escalas distintas", () => {
  const escala1a7Ap4 = planBase({ notaMin: 1, notaMax: 7, notaAprobacion: 4 });
  const escala1a7Ap6 = planBase({ notaMin: 1, notaMax: 7, notaAprobacion: 6 });
  const valores = { estado: "cursando" as const, p1: null, p2: null, rec: null, nota: null };

  it("arma la distribución y los dieces con la escala del plan", () => {
    const datos = datosDe({
      plan: escala1a7Ap6,
      materias: [materia("A"), materia("B")],
      progreso: [
        fila("A", { estado: "aprobada", nota: 7 }),
        fila("B", { estado: "aprobada", nota: 6 }),
      ],
    });
    const barras = distribucionNotas(datos, false);
    expect(barras.map((b) => b.nota)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(barras.filter((b) => b.desaprobada).map((b) => b.nota)).toEqual([1, 2, 3, 4, 5]);
    expect(dieces(datos).map((m) => m.id)).toEqual(["A"]);
    expect(dieces({ ...datos, plan: planBase() })).toEqual([]);
  });

  it("sugiere aprobada según la aprobación del plan", () => {
    expect(sugerirEstado({ ...valores, nota: 4 }, escala1a7Ap4)?.estado).toBe("aprobada");
    expect(sugerirEstado({ ...valores, nota: 4 }, escala1a7Ap6)).toBeNull();
    expect(sugerirEstado({ ...valores, nota: 6 }, escala1a7Ap6)?.estado).toBe("aprobada");
  });

  it("sugiere final según la aprobación del plan", () => {
    const parciales = { ...valores, p1: 5, p2: 5 };
    expect(sugerirEstado(parciales, escala1a7Ap4)?.estado).toBe("final");
    expect(sugerirEstado(parciales, escala1a7Ap6)).toBeNull();
  });

  it("parsea aplazos según la escala del plan", () => {
    expect(parsearAplazos("2, 8;3 7 0", escala1a7Ap4)).toEqual([2, 3, 7]);
    expect(parsearAplazos("2, 8;3 7 0", planBase())).toEqual([2, 8, 3, 7]);
  });

  it("devuelve los valores de la escala", () => {
    expect(notasDeEscala(escala1a7Ap4)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("sugerencias de estado", () => {
  const plan = planBase();
  const base = { estado: "cursando" as const, p1: null, p2: null, rec: null, nota: null };

  it("no sugiere aprobada si ya está aprobada", () => {
    expect(sugerirEstado({ ...base, estado: "aprobada", nota: 8 }, plan)).toBeNull();
  });

  it("sugiere final con p1 y recuperatorio aprobados", () => {
    const sugerencia = sugerirEstado({ ...base, p1: 6, p2: 2, rec: 4 }, plan);
    expect(sugerencia).toMatchObject({ estado: "final", motivo: "parciales" });
  });

  it("no sugiere final sin p1 aprobado, fuera de cursando o con nota", () => {
    expect(sugerirEstado({ ...base, p1: 2, p2: 8, rec: 8 }, plan)).toBeNull();
    expect(sugerirEstado({ ...base, estado: "pendiente", p1: 8, p2: 8 }, plan)).toBeNull();
    expect(sugerirEstado({ ...base, p1: 8, p2: 8, nota: 2 }, plan)).toBeNull();
  });

  it("incluso con aprobación 0, una nota vacía no aprueba", () => {
    const planCero = planBase({ notaMin: 0, notaAprobacion: 0 });
    expect(sugerirEstado(base, planCero)).toBeNull();
    expect(parsearAplazos("", planCero)).toEqual([]);
  });

  it("completa el estado al editar la nota final", () => {
    const valores = { estado: "cursando" as const, notaFinalExamen: null };
    expect(alEditarNota("nota", { ...valores, nota: 4 }, plan)).toEqual({
      estado: "aprobada",
      nota: 4,
    });
    expect(alEditarNota("nota", { ...valores, nota: 3 }, plan)).toEqual({
      estado: "cursando",
      nota: 3,
    });
  });

  it("copia el examen a la nota final solo si no había nota", () => {
    const estado = "final" as const;
    expect(
      alEditarNota("notaFinalExamen", { estado, nota: null, notaFinalExamen: 7 }, plan),
    ).toEqual({ estado: "aprobada", nota: 7 });
    expect(alEditarNota("notaFinalExamen", { estado, nota: 9, notaFinalExamen: 7 }, plan)).toEqual({
      estado: "final",
      nota: 9,
    });
    expect(
      alEditarNota("notaFinalExamen", { estado, nota: null, notaFinalExamen: 2 }, plan),
    ).toEqual({ estado: "final", nota: null });
  });
});
