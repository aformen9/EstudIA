import { describe, expect, it } from "vitest";
import { esAcento, esTema, resolverPreferencias } from "./preferencias";

describe("resolverPreferencias", () => {
  it("con el perfil vacío sube lo del dispositivo y no cambia nada", () => {
    expect(
      resolverPreferencias({ acento: "naranja", tema: "light" }, { acento: null, tema: null }),
    ).toEqual({ aplicar: {}, subir: { acento: "naranja", tema: "light" } });
  });

  it("con otra cosa en el perfil aplica la del perfil y no sube nada", () => {
    expect(
      resolverPreferencias({ acento: "azul", tema: "dark" }, { acento: "naranja", tema: "light" }),
    ).toEqual({ aplicar: { acento: "naranja", tema: "light" }, subir: {} });
  });

  it("si coinciden no hace nada", () => {
    expect(
      resolverPreferencias({ acento: "verde", tema: "dark" }, { acento: "verde", tema: "dark" }),
    ).toEqual({ aplicar: {}, subir: {} });
  });

  it("decide cada preferencia por separado", () => {
    expect(
      resolverPreferencias({ acento: "azul", tema: "light" }, { acento: "rosa", tema: null }),
    ).toEqual({ aplicar: { acento: "rosa" }, subir: { tema: "light" } });
  });
});

describe("valores válidos", () => {
  it("acepta solo los acentos y modos de la lista", () => {
    expect(["azul", "rosa", "violeta", "verde", "naranja"].every(esAcento)).toBe(true);
    expect(esAcento("Azul")).toBe(false);
    expect(esAcento("fucsia")).toBe(false);
    expect(esAcento(null)).toBe(false);
    expect(esTema("light") && esTema("dark")).toBe(true);
    expect(esTema("sepia")).toBe(false);
  });
});
