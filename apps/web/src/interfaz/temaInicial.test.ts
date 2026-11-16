import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { COLOR_BARRA } from "./tema";

/**
 * El script de `index.html` corre antes de pintar: sin nada guardado deja oscuro y azul; si el alumno
 * eligió claro u otro acento, lo aplica. Se prueba el script real, leído del archivo.
 */
const html = readFileSync(resolve(import.meta.dirname, "../../index.html"), "utf8");
const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";

function cargarPagina() {
  // Lo que trae <html> antes de que corra el script.
  document.documentElement.dataset.theme = /<html[^>]*data-theme="(\w+)"/.exec(html)?.[1];
  delete document.documentElement.dataset.accent;
  document.head.innerHTML = /<meta name="theme-color"[^>]*>/.exec(html)?.[0] ?? "";
  new Function(script)();
}

const barra = () => document.getElementById("themeColor")?.getAttribute("content");

beforeEach(() => localStorage.clear());

describe("tema y acento antes de pintar", () => {
  it("en la primera visita es oscuro y azul", () => {
    cargarPagina();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.accent).toBeUndefined();
    expect(barra()).toBe(COLOR_BARRA.dark);
  });

  it("recuerda el modo claro", () => {
    localStorage.setItem("estudia.theme", "light");
    cargarPagina();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(barra()).toBe(COLOR_BARRA.light);
  });

  it("recuerda el acento elegido", () => {
    localStorage.setItem("estudia.acento", "naranja");
    cargarPagina();
    expect(document.documentElement.dataset.accent).toBe("naranja");
  });

  it("ignora un acento guardado que no existe", () => {
    localStorage.setItem("estudia.acento", '"><img src=x>');
    cargarPagina();
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });
});
