import { describe, expect, it } from "vitest";
import esperado from "../../../../fixtures/caso-prueba-esperado.json";
import legacy from "../../../../fixtures/caso-prueba-legacy.json";
import {
  alertaAnioCompleto,
  datosAlumnoDesdeImportacion,
  estadoCorrelativas,
  listaAplazos,
  podesCursar,
  progresoCarrera,
  promedio,
  promedioPorArea,
  promedioPorCuatrimestre,
  type DatosAlumno,
  type EstadoCorrelativas,
  type ParaCorrelativa,
} from "../index";
import { importarLegacy } from "../importacion";
import { planLcd, redondear4 } from "./auxiliares";

function datosDelCaso(): DatosAlumno {
  const plan = planLcd();
  const resultado = importarLegacy(legacy, plan);
  if (!resultado.ok) throw new Error(resultado.error);
  return datosAlumnoDesdeImportacion(plan, resultado.datos);
}

function correlativasComoFixture(estado: EstadoCorrelativas) {
  return {
    faltan: estado.faltan.map((r) => r.materia.codigo),
    moduloPendientes: estado.modulo ? estado.modulo.pendientes.map((m) => m.codigo) : null,
    n: estado.n,
    ok: estado.ok,
    vacio: estado.vacio,
  };
}

/** Calcula con `core` cada clave de `caso-prueba-esperado.json`, con la misma forma. */
function calcularComoFixture(datos: DatosAlumno) {
  const progreso = progresoCarrera(datos);
  const sin = promedio(datos, false);
  const con = promedio(datos, true);
  const redondeado = <T extends { promedio: number }>(fila: T) => ({
    ...fila,
    promedio: redondear4(fila.promedio),
  });
  const conAplazosPrimeroFalso = (a: { conAplazos: boolean }, b: { conAplazos: boolean }) =>
    Number(a.conAplazos) - Number(b.conAplazos);
  const paras: ParaCorrelativa[] = ["cursar", "rendir"];
  return {
    totalMaterias: progreso.total,
    porEstado: progreso.porEstado,
    porcentajeAprobado: progreso.porcentajeAprobado,
    porcentajeCursado: progreso.porcentajeCursado,
    promedioSinAplazos: redondear4(sin.promedio as number),
    promedioConAplazos: redondear4(con.promedio as number),
    cantidadNotasSinAplazos: sin.n,
    cantidadNotasConAplazos: con.n,
    aplazos: listaAplazos(datos).map((a) => ({ codigo: a.materia.codigo, nota: a.nota })),
    promedioPorCuatrimestre: [
      ...promedioPorCuatrimestre(datos, false),
      ...promedioPorCuatrimestre(datos, true),
    ]
      .sort(
        (a, b) =>
          a.anio - b.anio || a.cuatrimestre - b.cuatrimestre || conAplazosPrimeroFalso(a, b),
      )
      .map(redondeado),
    promedioPorArea: [...promedioPorArea(datos, false), ...promedioPorArea(datos, true)]
      .map(redondeado)
      .sort(porAreaYAplazos),
    podesCursar: podesCursar(datos).map((m) => m.codigo),
    correlativas: Object.fromEntries(
      datos.materias.map((m) => [
        m.codigo,
        Object.fromEntries(
          paras.map((para) => [para, correlativasComoFixture(estadoCorrelativas(datos, m, para))]),
        ),
      ]),
    ),
  };
}

function porAreaYAplazos(
  a: { area: string; conAplazos: boolean },
  b: { area: string; conAplazos: boolean },
): number {
  return a.area.localeCompare(b.area) || Number(a.conAplazos) - Number(b.conAplazos);
}

describe("criterio 2 de la fase 0: caso de prueba legacy contra el catálogo", () => {
  const datos = datosDelCaso();
  const calculado = calcularComoFixture(datos);

  it("da exactamente caso-prueba-esperado.json en todas sus claves", () => {
    const claves: Omit<typeof esperado, "_explicacion"> & { _explicacion?: string } = {
      ...esperado,
    };
    delete claves._explicacion;
    // promedioPorArea se devuelve de mayor a menor (como la vista); el fixture va en otro orden.
    const fixture = {
      ...claves,
      promedioPorArea: [...claves.promedioPorArea].sort(porAreaYAplazos),
    };
    expect(calculado).toEqual(fixture);
  });

  it("compara correlativas materia por materia", () => {
    expect(Object.keys(esperado.correlativas)).toHaveLength(50);
    for (const [codigo, valor] of Object.entries(esperado.correlativas)) {
      expect(calculado.correlativas[codigo as string], codigo).toEqual(valor);
    }
  });

  it("cuenta 26/5/2/17 sobre 50 materias, con 52 % y 56 %", () => {
    expect(calculado.totalMaterias).toBe(50);
    expect(calculado.porEstado).toEqual({ aprobada: 26, cursando: 5, final: 2, pendiente: 17 });
    expect(calculado.porcentajeAprobado).toBe(52);
    expect(calculado.porcentajeCursado).toBe(56);
  });

  it("da 7,7308 sin aplazos y 7,3571 con aplazos", () => {
    expect(calculado.promedioSinAplazos).toBe(7.7308);
    expect(calculado.promedioConAplazos).toBe(7.3571);
  });

  it("lista los aplazos GMA1234 (2) y GCO0406 (3)", () => {
    expect(calculado.aplazos).toEqual([
      { codigo: "GMA1234", nota: 2 },
      { codigo: "GCO0406", nota: 3 },
    ]);
  });

  it("deja cursar GES0314 y GWA6803", () => {
    expect(calculado.podesCursar).toEqual(["GES0314", "GWA6803"]);
  });

  it("no deja rendir GES0315 porque falta GMA0212", () => {
    const ges0315 = datos.materias.find((m) => m.codigo === "GES0315");
    const rendir = estadoCorrelativas(datos, ges0315!, "rendir");
    expect(rendir.ok).toBe(false);
    expect(rendir.faltan.map((r) => r.materia.codigo)).toEqual(["GMA0212"]);
  });

  it("bloquea 4° año por GMA0212", () => {
    const alerta = alertaAnioCompleto(datos);
    expect(alerta?.anioBloqueado).toBe(4);
    expect(alerta?.anioRequerido).toBe(2);
    expect(alerta?.pendientes.map((m) => m.codigo)).toEqual(["GMA0212"]);
  });
});

describe("importación del caso de prueba", () => {
  it("mapea todo sin avisos y resume para la pantalla de confirmación", () => {
    const resultado = importarLegacy(legacy, planLcd());
    if (!resultado.ok) throw new Error(resultado.error);
    expect(resultado.reporte.avisos).toEqual([]);
    expect(resultado.resumen).toEqual({
      totalMaterias: 50,
      porEstado: { aprobada: 26, cursando: 5, final: 2, pendiente: 17 },
      materiasConMatch: 50,
      materiasPropias: 0,
      eventos: 59,
      materiales: 0,
      avisos: 0,
    });
    expect(resultado.datos.historial.every((h) => h.fuente === "manual")).toBe(true);
  });
});
