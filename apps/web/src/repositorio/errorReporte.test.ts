import { describe, expect, it } from "vitest";
import { errorDeReporte } from "./errorReporte";

describe("errorDeReporte", () => {
  it("explica el tope del día y el texto fuera de rango", () => {
    expect(errorDeReporte({ code: "EQ005", message: "x" })?.message).toContain("máximo de 5");
    expect(
      errorDeReporte({ code: "23514", message: 'violates check constraint "reportes_texto_largo"' })
        ?.message,
    ).toContain("entre 1 y 1000");
  });

  it("lo demás no es un rechazo de reporte", () => {
    expect(errorDeReporte(null)).toBeNull();
    expect(errorDeReporte({ code: "42501", message: "permission denied" })).toBeNull();
    expect(errorDeReporte({ code: "23514", message: "otro_check" })).toBeNull();
  });
});
