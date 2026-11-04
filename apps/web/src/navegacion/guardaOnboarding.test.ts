import { describe, expect, it } from "vitest";
import { resolverVista } from "./guardaOnboarding";

describe("resolverVista", () => {
  it("mientras carga o falla no elige ninguna vista", () => {
    expect(resolverVista("materias", "cargando", false)).toBeNull();
    expect(resolverVista("onboarding", "cargando", false)).toBeNull();
    expect(resolverVista("materias", "error", false)).toBeNull();
  });

  it("sin inscripción activa, cualquier vista va al onboarding", () => {
    for (const vista of ["inicio", "materias", "ajustes", "onboarding"] as const) {
      expect(resolverVista(vista, "ninguna", false)).toBe("onboarding");
    }
  });

  it("con inscripción activa, el onboarding vuelve a Inicio y lo demás se respeta", () => {
    expect(resolverVista("onboarding", "activa", false)).toBe("inicio");
    expect(resolverVista("materias", "activa", false)).toBe("materias");
  });

  it("el último paso del onboarding se queda ahí, pero no atrapa", () => {
    expect(resolverVista("onboarding", "activa", true)).toBe("onboarding");
    expect(resolverVista("materias", "activa", true)).toBe("materias");
  });
});
