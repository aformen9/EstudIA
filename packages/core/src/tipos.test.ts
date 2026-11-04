import { describe, expect, it } from "vitest";
import { ESTADOS_MATERIA } from "./tipos";

describe("tipos", () => {
  it("define los cuatro estados de la arquitectura", () => {
    expect(ESTADOS_MATERIA).toEqual(["pendiente", "cursando", "final", "aprobada"]);
  });
});
