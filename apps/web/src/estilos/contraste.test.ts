import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Contraste AA de la paleta (CLAUDE.md): 4,5:1 para texto. Lee las variables reales de styles.css. */
const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");

function variablesDe(selector: string): Record<string, string> {
  const inicio = css.indexOf(`${selector} {`);
  const bloque = css.slice(inicio, css.indexOf("}", inicio));
  return Object.fromEntries(
    [...bloque.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
  );
}

function luminancia(color: string): number {
  const canales = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canales.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((claro as number) + 0.05) / ((oscuro as number) + 0.05);
}

const FONDOS = ["--bg", "--surface", "--surface-2"];
const PARES: [string, string][] = [
  ...["--ink", "--ink-2", "--ink-3", "--accent", "--lav"].flatMap((texto) =>
    FONDOS.map((fondo): [string, string] => [texto, fondo]),
  ),
  ["--accent", "--accent-soft"],
  ["--lav", "--lav-soft"],
  ["--ok", "--ok-bg"],
  ["--cur", "--cur-bg"],
  ["--fin", "--fin-bg"],
  ["--pend", "--pend-bg"],
  // Botón primario: su texto sobre los dos extremos del gradiente.
  ["--accent-ink", "--accent-fuerte"],
  ["--accent-ink", "--accent"],
  // Avatar: el gradiente termina en --lav.
  ["--accent-ink", "--lav"],
];

describe.each([
  ["claro", ':root[data-theme="light"]'],
  ["oscuro", ':root[data-theme="dark"]'],
])("contraste AA en modo %s", (_tema, selector) => {
  const variables = variablesDe(selector);

  it.each(PARES)("%s sobre %s", (texto, fondo) => {
    const [a, b] = [variables[texto], variables[fondo]];
    expect(a, `falta ${texto}`).toBeDefined();
    expect(b, `falta ${fondo}`).toBeDefined();
    expect(contraste(a as string, b as string)).toBeGreaterThanOrEqual(4.5);
  });
});
