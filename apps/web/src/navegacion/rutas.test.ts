import { describe, expect, it } from "vitest";
import { vistaDesdeHash } from "./rutas";

describe("vistaDesdeHash", () => {
  it("reconoce las vistas, con o sin #", () => {
    expect(vistaDesdeHash("#materias")).toBe("materias");
    expect(vistaDesdeHash("finales")).toBe("finales");
  });

  it.each(["", "#", "#no-existe", "#constructor", "#__proto__", "#toString"])(
    "cualquier otra cosa va al inicio: %j",
    (hash) => expect(vistaDesdeHash(hash)).toBe("inicio"),
  );
});
