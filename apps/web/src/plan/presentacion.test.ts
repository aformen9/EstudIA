import { describe, expect, it } from "vitest";
import { enumerar, formatoFecha, formatoPeso, saludoDeHora } from "./presentacion";

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

  it("formatea el peso de un archivo", () => {
    expect(formatoPeso(null)).toBe("");
    expect(formatoPeso(100)).toBe("1 KB");
    expect(formatoPeso(2048)).toBe("2 KB");
    expect(formatoPeso(3.5 * 1048576)).toBe("3,5 MB");
  });
});
