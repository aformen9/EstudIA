import { describe, expect, it } from "vitest";
import type { Instancia, TipoInstancia } from "../tipos";
import {
  enGrupo,
  etiquetasDeInstancias,
  instanciasProgramadas,
  motivoParaNoAgregar,
  motivoParaNoQuitar,
  ordenarInstancias,
  proximoOrden,
  resumirMateria,
  situacionDeInstancia,
  sugerirAprobada,
} from "./instancias";

const plan = { notaAprobacion: 4 };
let siguiente = 0;
function inst(
  tipo: TipoInstancia,
  fecha: string,
  nota: number | null,
  orden = siguiente++,
): Instancia {
  return { id: `${tipo}-${fecha}-${orden}`, tipo, fecha, nota, orden, fuente: "manual" };
}
const etiquetas = (lista: Instancia[]) => {
  const mapa = etiquetasDeInstancias(lista);
  return ordenarInstancias(lista).map((i) => mapa.get(i.id));
};

describe("orden y nombres", () => {
  it("ordena por fecha y, con la misma fecha, por orden de carga", () => {
    const a = inst("final", "2024-02-12", 6, 2);
    const b = inst("final", "2023-12-12", 2, 5);
    const c = inst("cursada", "2023-12-12", 9, 1);
    expect(ordenarInstancias([a, b, c]).map((i) => i.id)).toEqual([c.id, b.id, a.id]);
  });

  it("uno solo no lleva número; con varios, se numeran por fecha", () => {
    expect(etiquetas([inst("parcial", "2025-05-01", 7)])).toEqual(["Parcial"]);
    expect(
      etiquetas([
        inst("parcial", "2025-06-01", 7),
        inst("parcial", "2025-04-01", 8),
        inst("recuperatorio", "2025-06-20", 6),
      ]),
    ).toEqual(["Parcial 1", "Parcial 2", "Recuperatorio"]);
  });

  it("también numera cursadas y finales, y nunca la promoción", () => {
    expect(
      etiquetas([
        inst("cursada", "2024-06-23", 2),
        inst("cursada", "2025-06-24", 8),
        inst("final", "2025-07-13", 3),
        inst("final", "2025-08-01", 7),
        inst("promocion", "2025-09-01", 9),
      ]),
    ).toEqual(["Cursada 1", "Cursada 2", "Final 1", "Final 2", "Promoción"]);
  });
});

describe("lo que se deduce", () => {
  it("aprobada: el último final con nota es el aprobado y los anteriores son aplazos", () => {
    const aplazo = inst("final", "2023-12-12", 2);
    const aprobado = inst("final", "2024-02-12", 6);
    const resumen = resumirMateria({ estado: "aprobada", instancias: [aprobado, aplazo] }, plan);
    expect(resumen.nota).toBe(6);
    expect(resumen.finalAprobado?.id).toBe(aprobado.id);
    expect(resumen.aplazos.map((a) => a.nota)).toEqual([2]);
  });

  it("no aprobada: todos los finales con nota son aplazos y no hay nota de materia", () => {
    const resumen = resumirMateria(
      {
        estado: "final",
        instancias: [inst("final", "2023-12-12", 2), inst("final", "2024-02-12", 6)],
      },
      plan,
    );
    expect(resumen.nota).toBeNull();
    expect(resumen.aplazos.map((a) => a.nota)).toEqual([2, 6]);
  });

  it("un final sin nota no cuenta como aplazo ni como aprobado", () => {
    const resumen = resumirMateria(
      {
        estado: "aprobada",
        instancias: [inst("final", "2023-12-12", null), inst("final", "2024-02-12", 6)],
      },
      plan,
    );
    expect(resumen.nota).toBe(6);
    expect(resumen.aplazos).toEqual([]);
  });

  it("con promoción, la nota es la de la promoción y los finales con nota son aplazos", () => {
    const resumen = resumirMateria(
      {
        estado: "aprobada",
        instancias: [inst("final", "2023-07-01", 3), inst("promocion", "2023-11-23", 9)],
      },
      plan,
    );
    expect(resumen.nota).toBe(9);
    expect(resumen.finalAprobado).toBeNull();
    expect(resumen.aplazos.map((a) => a.nota)).toEqual([3]);
  });

  it("aprobada con una nota menor a la de aprobación: se toma igual, con aviso", () => {
    const resumen = resumirMateria(
      { estado: "aprobada", instancias: [inst("final", "2024-02-12", 3)] },
      plan,
    );
    expect(resumen.nota).toBe(3);
    expect(resumen.notaPorDebajoDeAprobacion).toBe(true);
  });

  it("aprobada sin finales ni promoción no tiene nota", () => {
    expect(resumirMateria({ estado: "aprobada", instancias: [] }, plan).nota).toBeNull();
  });

  it("la última cursada es la vigente y las anteriores, desaprobadas (recursar)", () => {
    const vieja = inst("cursada", "2024-06-23", 2);
    const nueva = inst("cursada", "2025-06-24", 8);
    const resumen = resumirMateria({ estado: "aprobada", instancias: [nueva, vieja] }, plan);
    expect(resumen.cursadaVigente?.id).toBe(nueva.id);
    expect(resumen.cursadasDesaprobadas.map((c) => c.id)).toEqual([vieja.id]);
  });
});

describe("situación de cada instancia", () => {
  const hoy = "2026-11-07";

  it("sin nota y con fecha de hoy o futura es programada, también un final", () => {
    const futuro = inst("final", "2026-12-10", null);
    const deHoy = inst("parcial", hoy, null);
    const resumen = resumirMateria({ estado: "final", instancias: [futuro, deHoy] }, plan);
    expect(situacionDeInstancia(futuro, resumen, hoy)).toBe("programada");
    expect(situacionDeInstancia(deHoy, resumen, hoy)).toBe("programada");
  });

  it("un final sin nota pasa a ausente recién cuando la fecha ya pasó", () => {
    const pasado = inst("final", "2026-11-06", null);
    const resumen = resumirMateria({ estado: "final", instancias: [pasado] }, plan);
    expect(situacionDeInstancia(pasado, resumen, hoy)).toBe("ausente");
    expect(situacionDeInstancia(pasado, resumen, "2026-11-06")).toBe("programada");
  });

  it("finales aprobado y aplazo, cursadas vigente y desaprobada", () => {
    const lista = [
      inst("cursada", "2024-06-23", 2),
      inst("cursada", "2025-06-24", 8),
      inst("final", "2025-07-01", 2),
      inst("final", "2025-07-13", 7),
    ];
    const resumen = resumirMateria({ estado: "aprobada", instancias: lista }, plan);
    expect(lista.map((i) => situacionDeInstancia(i, resumen, hoy))).toEqual([
      "desaprobada",
      "vigente",
      "aplazo",
      "aprobado",
    ]);
  });

  it("lista las programadas de todas las materias, de la más cercana a la más lejana", () => {
    const lejos = inst("final", "2027-02-10", null);
    const cerca = inst("parcial", "2026-11-20", null);
    const progreso = [
      {
        materiaId: "A",
        estado: "final" as const,
        instancias: [lejos, inst("final", "2026-01-01", null)],
      },
      {
        materiaId: "B",
        estado: "cursando" as const,
        instancias: [cerca, inst("parcial", "2026-12-01", 8)],
      },
    ];
    expect(instanciasProgramadas(progreso, hoy).map((p) => [p.materiaId, p.instancia.id])).toEqual([
      ["B", cerca.id],
      ["A", lejos.id],
    ]);
  });
});

describe("topes al agregar y quitar", () => {
  const muchas = (tipo: TipoInstancia, n: number) =>
    Array.from({ length: n }, (_, i) => inst(tipo, `2025-0${(i % 9) + 1}-01`, 7));

  it("hasta 6 parciales y 6 recuperatorios, nunca más recuperatorios que parciales", () => {
    expect(motivoParaNoAgregar([], "recuperatorio")).toMatch(/más recuperatorios que parciales/);
    expect(motivoParaNoAgregar(muchas("parcial", 1), "recuperatorio")).toBeNull();
    expect(motivoParaNoAgregar(muchas("parcial", 6), "parcial")).toMatch(/6 parciales/);
    expect(
      motivoParaNoAgregar(
        [...muchas("parcial", 6), ...muchas("recuperatorio", 6)],
        "recuperatorio",
      ),
    ).toMatch(/6 recuperatorios/);
  });

  it("una sola promoción; finales y cursadas sin tope", () => {
    expect(motivoParaNoAgregar([inst("promocion", "2025-01-01", 9)], "promocion")).toMatch(
      /promoción/,
    );
    expect(motivoParaNoAgregar(muchas("final", 9), "final")).toBeNull();
    expect(motivoParaNoAgregar(muchas("cursada", 9), "cursada")).toBeNull();
  });

  it("no deja quitar un parcial si quedarían más recuperatorios que parciales", () => {
    const parcial = inst("parcial", "2025-04-01", 3);
    const recuperatorio = inst("recuperatorio", "2025-05-01", 6);
    expect(motivoParaNoQuitar([parcial, recuperatorio], parcial.id)).toMatch(/recuperatorio/);
    expect(motivoParaNoQuitar([parcial, recuperatorio], recuperatorio.id)).toBeNull();
    expect(motivoParaNoQuitar([parcial], parcial.id)).toBeNull();
  });

  it("el orden de una nueva va después de todas", () => {
    expect(proximoOrden([])).toBe(0);
    expect(proximoOrden([inst("final", "2025-01-01", 7, 4)])).toBe(5);
  });
});

describe("sugerencia", () => {
  it("en Falta final, un final con nota que aprueba sugiere Aprobada", () => {
    expect(sugerirAprobada("final", [inst("final", "2025-07-13", 7)], plan)).toBe(true);
    expect(sugerirAprobada("final", [inst("final", "2025-07-13", 2)], plan)).toBe(false);
    expect(sugerirAprobada("final", [inst("final", "2025-07-13", null)], plan)).toBe(false);
    expect(sugerirAprobada("cursando", [inst("final", "2025-07-13", 7)], plan)).toBe(false);
    expect(sugerirAprobada("aprobada", [inst("final", "2025-07-13", 7)], plan)).toBe(false);
  });
});

describe("grupos", () => {
  it("recuperatorios con parciales y promoción con finales", () => {
    expect(enGrupo("recuperatorio", "parciales")).toBe(true);
    expect(enGrupo("promocion", "finales")).toBe(true);
    expect(enGrupo("cursada", "finales")).toBe(false);
    expect(enGrupo("final", "todas")).toBe(true);
  });
});
