import { describe, expect, it } from "vitest";
import { materia } from "../../../../packages/core/src/pruebas/auxiliares";
import {
  aniosDelPlan,
  buscarMaterias,
  enumerar,
  formatoFecha,
  materiasDePestania,
  resumenFinal,
  saludoDeHora,
  sinDatosCargados,
} from "./presentacion";

describe("presentación", () => {
  it("saluda con los cortes de la referencia", () => {
    expect([12, 13, 19, 20].map(saludoDeHora)).toEqual([
      "Buen día",
      "Buenas tardes",
      "Buenas tardes",
      "Buenas noches",
    ]);
  });

  it("formatea fechas y listas", () => {
    expect(formatoFecha("2026-03-09")).toBe("09/03/2026");
    expect(formatoFecha("2026-03-09T10:00:00Z")).toBe("09/03/2026");
    expect(enumerar(["A"])).toBe("A");
    expect(enumerar(["A", "B", "C"])).toBe("A, B y C");
  });

  it("sin datos es no tener progreso ni historial", () => {
    expect(sinDatosCargados({ progreso: [], historial: [] })).toBe(true);
    const evento = {
      materiaId: "a",
      fecha: "2025-01-01",
      tipo: "Examen",
      nota: 8,
      resultado: "Aprobado",
      fuente: "manual",
    } as const;
    expect(sinDatosCargados({ progreso: [], historial: [evento] })).toBe(false);
  });

  it("los años van en orden, con las extras siempre al final", () => {
    expect(aniosDelPlan([])).toEqual([0]);
    expect(
      aniosDelPlan([
        materia("a", { anio: 3 }),
        materia("b", { anio: 0 }),
        materia("c", { anio: 1 }),
      ]),
    ).toEqual([1, 3, 0]);
  });

  it("una pestaña incluye las anuales de su año, y no las de otro", () => {
    const anual = materia("anual", { anio: 1, cuatrimestre: null });
    const otra = materia("otra", { anio: 2, cuatrimestre: null });
    const segundo = materia("segundo", { anio: 1, cuatrimestre: 2 });
    expect(materiasDePestania([anual, otra, segundo], 1, 1)).toEqual([anual]);
    expect(materiasDePestania([anual, otra, segundo], 1, 2)).toEqual([anual, segundo]);
  });

  it("busca sin tildes ni mayúsculas, y tolera materias sin código", () => {
    const m = materia("x", { nombre: "Cálculo", codigo: null });
    expect(buscarMaterias([m], " CALCULO ")).toEqual([m]);
    expect(buscarMaterias([m], "gma")).toEqual([]);
  });

  it("el resumen del final ordena por fecha, sea cual sea el orden del historial", () => {
    const evento = (fecha: string, tipo: "Regularidad" | "Examen", nota: number | null) => ({
      materiaId: "m",
      fecha,
      tipo,
      nota,
      resultado: tipo === "Examen" && nota == null ? ("Ausente" as const) : ("Aprobado" as const),
      fuente: "manual" as const,
    });
    expect(
      resumenFinal(
        [
          evento("2025-03-01", "Examen", null),
          evento("2025-01-01", "Regularidad", 7),
          evento("2025-02-01", "Examen", 2),
          { ...evento("2024-12-01", "Regularidad", 8), materiaId: "otra" },
        ],
        "m",
      ),
    ).toEqual({ cursadaAprobada: "2025-01-01", intentos: ["2", "ausente"] });
  });
});
