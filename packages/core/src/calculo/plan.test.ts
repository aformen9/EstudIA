import { describe, expect, it } from "vitest";
import { datosDe, evento, fila, materia, planBase, planLcd } from "../pruebas/auxiliares";
import type { Correlativa, Material } from "../tipos";
import { materiasBloqueadas, podesCursar, situacionCorrelativas } from "./correlativas";
import { progresoInicial } from "./estados";
import { borradorDeMateria, CONDICION_PREDETERMINADA, normalizarBorrador } from "./materiasPropias";
import {
  agruparMaterias,
  aniosDelPlan,
  buscarMaterias,
  cuatrimestresDelAnio,
  esAnual,
  esMateriaPropia,
  historialDeMateria,
  materialesDeMateria,
  materialesDelPlan,
  materialesRecientes,
  materiasDePestania,
  opcionesDeCorrelativa,
  resumenFinal,
  sinDatosCargados,
} from "./plan";

function nota(id: string, materiaId: string | null, createdAt = "2026-01-01T00:00:00Z"): Material {
  return {
    id,
    materiaId,
    titulo: id,
    visibilidad: "privado",
    anonimo: false,
    periodo: null,
    oculto: false,
    createdAt,
    tipo: "nota",
    texto: "",
  };
}

const ids = (lista: { id: string }[]) => lista.map((x) => x.id);

describe("agruparMaterias", () => {
  it("ordena por año y cuatrimestre, con las anuales primero y las extras al final", () => {
    const grupos = agruparMaterias([
      materia("extra", { anio: 0, cuatrimestre: null }),
      materia("2-1", { anio: 2, cuatrimestre: 1 }),
      materia("1-2", { anio: 1, cuatrimestre: 2 }),
      materia("1-anual", { anio: 1, cuatrimestre: null }),
      materia("1-1", { anio: 1, cuatrimestre: 1 }),
    ]);
    expect(grupos.map((g) => [g.anio, g.cuatrimestre, ids(g.materias)])).toEqual([
      [1, null, ["1-anual"]],
      [1, 1, ["1-1"]],
      [1, 2, ["1-2"]],
      [2, 1, ["2-1"]],
      [0, null, ["extra"]],
    ]);
  });

  it("conserva el orden dentro del grupo y reúne todas las extras, aunque tengan cuatrimestre", () => {
    const grupos = agruparMaterias([
      materia("b", { anio: 0, cuatrimestre: 2 }),
      materia("a", { anio: 0, cuatrimestre: null }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.cuatrimestre).toBeNull();
    expect(ids(grupos[0]?.materias ?? [])).toEqual(["b", "a"]);
  });

  it("no mezcla un cuatrimestre de dos cifras con otro año", () => {
    const grupos = agruparMaterias([
      materia("a", { anio: 2, cuatrimestre: null }),
      materia("b", { anio: 1, cuatrimestre: 10 }),
    ]);
    expect(grupos.map((g) => ids(g.materias))).toEqual([["b"], ["a"]]);
  });

  it("devuelve nada sin materias, y con el catálogo LCD no pierde ninguna", () => {
    expect(agruparMaterias([])).toEqual([]);
    const { materias } = planLcd();
    const grupos = agruparMaterias(materias);
    expect(grupos.flatMap((g) => g.materias)).toHaveLength(materias.length);
    expect(grupos.at(-1)?.anio).toBe(0);
  });
});

describe("años, cuatrimestres y pestañas", () => {
  it("los años van en orden, con las extras siempre al final", () => {
    expect(aniosDelPlan([])).toEqual([0]);
    expect(aniosDelPlan([{ anio: 3 }, { anio: 0 }, { anio: 1 }, { anio: 3 }])).toEqual([1, 3, 0]);
  });

  it("los cuatrimestres son los del plan más los de las materias propias de ese año", () => {
    const datos = {
      plan: planBase({ cuatrimestresPorAnio: 2 }),
      materias: [
        materia("a", { anio: 1, cuatrimestre: 3 }),
        materia("b", { anio: 2, cuatrimestre: 5 }),
        materia("c", { anio: 1, cuatrimestre: null }),
      ],
    };
    expect(cuatrimestresDelAnio(datos, 1)).toEqual([1, 2, 3]);
    expect(cuatrimestresDelAnio(datos, 3)).toEqual([1, 2]);
  });

  it("una pestaña incluye las anuales de su año, y no las de otro", () => {
    const anual = materia("anual", { anio: 1, cuatrimestre: null });
    const otra = materia("otra", { anio: 2, cuatrimestre: null });
    const segundo = materia("segundo", { anio: 1, cuatrimestre: 2 });
    expect(materiasDePestania([anual, otra, segundo], 1, 1)).toEqual([anual]);
    expect(materiasDePestania([anual, otra, segundo], 1, 2)).toEqual([anual, segundo]);
  });

  it("la pestaña de extras muestra todas, sea cual sea el cuatrimestre", () => {
    const extra = materia("extra", { anio: 0, cuatrimestre: 2 });
    expect(materiasDePestania([extra], 0, 1)).toEqual([extra]);
  });

  it("anual es tener año y no tener cuatrimestre; una extra no es anual", () => {
    expect(esAnual({ anio: 1, cuatrimestre: null })).toBe(true);
    expect(esAnual({ anio: 1, cuatrimestre: 1 })).toBe(false);
    expect(esAnual({ anio: 0, cuatrimestre: null })).toBe(false);
  });

  it("una materia propia es la que tiene dueño", () => {
    expect(esMateriaPropia({ ownerId: "alumno" })).toBe(true);
    expect(esMateriaPropia({ ownerId: null })).toBe(false);
  });
});

describe("buscarMaterias", () => {
  const calculo = materia("x", { nombre: "Cálculo", codigo: null });
  const datos = materia("y", { nombre: "Datos", codigo: "GMA1234" });

  it("busca por nombre sin tildes ni mayúsculas, y tolera materias sin código", () => {
    expect(buscarMaterias([calculo, datos], " CALCULO ")).toEqual([calculo]);
    expect(buscarMaterias([calculo, datos], "cálc")).toEqual([calculo]);
    expect(buscarMaterias([calculo], "gma")).toEqual([]);
  });

  it("busca por código sin distinguir mayúsculas", () => {
    expect(buscarMaterias([calculo, datos], "gma12")).toEqual([datos]);
  });

  it("un texto en blanco las devuelve todas", () => {
    expect(buscarMaterias([calculo, datos], "  ")).toEqual([calculo, datos]);
  });
});

describe("sinDatosCargados", () => {
  it("es no tener progreso ni historial", () => {
    expect(sinDatosCargados({ progreso: [], historial: [] })).toBe(true);
    expect(sinDatosCargados({ progreso: [fila("a")], historial: [] })).toBe(false);
    const examen = evento("a", "2025-01-01", "Examen", "Aprobado", 8);
    expect(sinDatosCargados({ progreso: [], historial: [examen] })).toBe(false);
  });
});

describe("materiales", () => {
  it("los recientes van primero, hasta el límite y sin tocar la lista original", () => {
    const lista = [
      nota("viejo", null, "2025-01-01T00:00:00Z"),
      nota("nuevo", null, "2026-01-01T00:00:00Z"),
      nota("medio", null, "2025-06-01T00:00:00Z"),
    ];
    expect(ids(materialesRecientes(lista, 2))).toEqual(["nuevo", "medio"]);
    expect(ids(lista)).toEqual(["viejo", "nuevo", "medio"]);
  });

  it("del plan: incluye los sin materia", () => {
    expect(ids(materialesDelPlan([nota("suelto", null)], [{ id: "a" }]))).toEqual(["suelto"]);
  });

  it("del plan: incluye los de una materia de la lista", () => {
    expect(ids(materialesDelPlan([nota("m", "a")], [{ id: "a" }]))).toEqual(["m"]);
  });

  it("del plan: excluye los de una materia que no está en la lista", () => {
    expect(materialesDelPlan([nota("ajeno", "otra")], [{ id: "a" }])).toEqual([]);
  });

  it("del plan: sin materias quedan solo los sin materia, y sin materiales no queda nada", () => {
    const lista = [nota("suelto", null), nota("ajeno", "otra")];
    expect(ids(materialesDelPlan(lista, []))).toEqual(["suelto"]);
    expect(materialesDelPlan([], [{ id: "a" }])).toEqual([]);
  });

  it("de una materia: solo los suyos", () => {
    const lista = [nota("m", "a"), nota("otro", "b"), nota("suelto", null)];
    expect(ids(materialesDeMateria(lista, "a"))).toEqual(["m"]);
  });
});

describe("historial de una materia", () => {
  const historial = [
    evento("m", "2025-01-01", "Regularidad", "Aprobado", 7),
    evento("otra", "2024-12-01", "Regularidad", "Aprobado", 8),
    evento("m", "2025-03-01", "Examen", "Ausente", null),
    evento("m", "2025-02-01", "Examen", "Reprobado", 2),
  ];

  it("va del más nuevo al más viejo, sin tocar la lista original", () => {
    const original = [...historial];
    expect(historialDeMateria(historial, "m").map((h) => h.fecha)).toEqual([
      "2025-03-01",
      "2025-02-01",
      "2025-01-01",
    ]);
    expect(historial).toEqual(original);
  });

  it("a igual fecha invierte el orden de carga, como la referencia", () => {
    const mismoDia = [
      evento("m", "2025-01-01", "Regularidad", "Aprobado", 7),
      evento("m", "2025-01-01", "Examen", "Aprobado", 8),
    ];
    expect(historialDeMateria(mismoDia, "m").map((h) => h.tipo)).toEqual(["Examen", "Regularidad"]);
  });

  it("el resumen del final da datos sin formatear, en orden de fecha", () => {
    expect(resumenFinal(historial, "m")).toEqual({
      cursadaAprobada: "2025-01-01",
      intentos: [
        { nota: 2, resultado: "Reprobado" },
        { nota: null, resultado: "Ausente" },
      ],
    });
  });

  it("el resumen toma la última cursada aprobada e ignora las reprobadas", () => {
    expect(
      resumenFinal(
        [
          evento("m", "2025-08-01", "Regularidad", "Reprobado", 2),
          evento("m", "2025-07-01", "Regularidad", "Aprobado", 6),
          evento("m", "2024-07-01", "Regularidad", "Aprobado", 5),
        ],
        "m",
      ),
    ).toEqual({ cursadaAprobada: "2025-07-01", intentos: [] });
  });

  it("sin eventos no hay cursada ni intentos", () => {
    expect(resumenFinal([], "m")).toEqual({ cursadaAprobada: null, intentos: [] });
  });
});

describe("progresoInicial", () => {
  it("es pendiente y sin notas", () => {
    expect(progresoInicial("a")).toEqual(fila("a"));
  });
});

describe("materias bloqueadas y situación de correlativas", () => {
  const requiere = (para: Correlativa["para"]): Correlativa => ({
    materiaId: "m",
    requiereId: "r",
    para,
    condicion: "aprobada",
  });
  const m = materia("m");
  const r = materia("r");
  const armar = (
    estadoM: "pendiente" | "cursando" | "final" | "aprobada",
    cumplida: boolean,
    para: Correlativa["para"],
  ) =>
    datosDe({
      materias: [m, r],
      correlativas: [requiere(para)],
      progreso: [
        fila("m", { estado: estadoM }),
        fila("r", { estado: cumplida ? "aprobada" : "pendiente" }),
      ],
    });

  it("bloqueadas y podés cursar reparten las pendientes", () => {
    const datos = planLcd();
    const alumno = datosDe({ ...datos, progreso: [] });
    const pendientes = alumno.materias.length;
    expect(materiasBloqueadas(alumno).length + podesCursar(alumno).length).toBe(pendientes);
    expect(ids(materiasBloqueadas(armar("pendiente", false, "cursar")))).toEqual(["m"]);
    expect(ids(materiasBloqueadas(armar("cursando", false, "cursar")))).toEqual([]);
  });

  it("una pendiente mira las de cursar", () => {
    expect(situacionCorrelativas(armar("pendiente", true, "cursar"), m)).toEqual({
      para: "cursar",
      ok: true,
      n: 0,
    });
    expect(situacionCorrelativas(armar("pendiente", false, "cursar"), m)).toEqual({
      para: "cursar",
      ok: false,
      n: 1,
    });
  });

  it("con final pendiente mira las de rendir, cumplidas o no", () => {
    expect(situacionCorrelativas(armar("final", true, "rendir"), m)).toEqual({
      para: "rendir",
      ok: true,
      n: 0,
    });
    expect(situacionCorrelativas(armar("final", false, "rendir"), m)).toEqual({
      para: "rendir",
      ok: false,
      n: 1,
    });
  });

  it("en curso solo avisa si le falta algo para rendir", () => {
    expect(situacionCorrelativas(armar("cursando", true, "rendir"), m)).toBeNull();
    expect(situacionCorrelativas(armar("cursando", false, "rendir"), m)?.n).toBe(1);
  });

  it("no avisa si está aprobada o si no tiene requisitos de ese tipo", () => {
    expect(situacionCorrelativas(armar("aprobada", false, "rendir"), m)).toBeNull();
    expect(situacionCorrelativas(armar("pendiente", false, "rendir"), m)).toBeNull();
  });

  it("cuenta la regla de año completo para cursar", () => {
    const conRegla = materia("m", { requiereAnioCompletoParaCursar: 1, anio: 2 });
    const datos = datosDe({ materias: [conRegla, r] });
    expect(situacionCorrelativas(datos, conRegla)).toEqual({ para: "cursar", ok: false, n: 1 });
  });
});

describe("editar materias propias", () => {
  const propia = materia("p", { ownerId: "alumno", nombre: "Optativa" });
  const correlativas: Correlativa[] = [
    { materiaId: "p", requiereId: "a", para: "cursar", condicion: "aprobada" },
    { materiaId: "otra", requiereId: "a", para: "cursar", condicion: "regular" },
    { materiaId: "p", requiereId: "b", para: "rendir", condicion: "regular" },
  ];

  it("el borrador trae los datos y solo sus correlativas, con su condición", () => {
    expect(borradorDeMateria({ correlativas }, propia)).toEqual({
      codigo: "p",
      nombre: "Optativa",
      anio: 1,
      cuatrimestre: 1,
      tipo: "Materia",
      area: null,
      requiereAnioCompletoParaCursar: null,
      correlativas: [
        { requiereId: "a", para: "cursar", condicion: "aprobada" },
        { requiereId: "b", para: "rendir", condicion: "regular" },
      ],
    });
  });

  it("la condición predeterminada es la del formulario de la referencia", () => {
    expect(CONDICION_PREDETERMINADA).toEqual({ cursar: "regular", rendir: "aprobada" });
  });

  it("normalizar exige nombre y lo recorta", () => {
    const borrador = borradorDeMateria({ correlativas: [] }, propia);
    expect(normalizarBorrador({ ...borrador, nombre: "   " }, "p")).toBeNull();
    expect(normalizarBorrador({ ...borrador, nombre: " Nueva " }, "p")?.nombre).toBe("Nueva");
  });

  it("normalizar saca el cuatrimestre de las extras y lo conserva en las demás", () => {
    const borrador = borradorDeMateria({ correlativas: [] }, propia);
    expect(
      normalizarBorrador({ ...borrador, anio: 0, cuatrimestre: 2 }, "p")?.cuatrimestre,
    ).toBeNull();
    expect(normalizarBorrador({ ...borrador, anio: 3, cuatrimestre: 2 }, "p")?.cuatrimestre).toBe(
      2,
    );
  });

  it("normalizar saca la correlativa a sí misma y las repetidas, y deja la misma para el otro tipo", () => {
    const borrador = {
      ...borradorDeMateria({ correlativas: [] }, propia),
      correlativas: [
        { requiereId: "p", para: "cursar", condicion: "regular" },
        { requiereId: "a", para: "cursar", condicion: "aprobada" },
        { requiereId: "a", para: "cursar", condicion: "regular" },
        { requiereId: "a", para: "rendir", condicion: "aprobada" },
      ] as const,
    };
    const resultado = normalizarBorrador(
      { ...borrador, correlativas: [...borrador.correlativas] },
      "p",
    );
    expect(resultado?.correlativas).toEqual([
      { requiereId: "a", para: "cursar", condicion: "aprobada" },
      { requiereId: "a", para: "rendir", condicion: "aprobada" },
    ]);
  });

  it("una materia nueva no tiene id propio contra el cual comparar", () => {
    const borrador = {
      ...borradorDeMateria({ correlativas: [] }, propia),
      correlativas: [{ requiereId: "a", para: "cursar", condicion: "regular" } as const],
    };
    expect(normalizarBorrador(borrador, null)?.correlativas).toHaveLength(1);
  });

  it("las opciones excluyen a la materia y van en el orden del plan, con las extras al final", () => {
    const lista = [
      materia("extra", { anio: 0, cuatrimestre: null }),
      materia("p", { anio: 1, cuatrimestre: 1 }),
      materia("2-1", { anio: 2, cuatrimestre: 1 }),
      materia("1-2", { anio: 1, cuatrimestre: 2 }),
    ];
    expect(ids(opcionesDeCorrelativa(lista, "p"))).toEqual(["1-2", "2-1", "extra"]);
    expect(ids(opcionesDeCorrelativa(lista, null))).toEqual(["p", "1-2", "2-1", "extra"]);
    expect(lista[0]?.id).toBe("extra");
  });
});
