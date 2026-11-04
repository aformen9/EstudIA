// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PUBLICO = resolve(import.meta.dirname, "../public");

describe("manifest de la PWA", () => {
  const manifest = JSON.parse(readFileSync(join(PUBLICO, "manifest.webmanifest"), "utf8")) as {
    name: string;
    short_name: string;
    icons: { src: string; purpose?: string }[];
  };

  it("se llama EstudIA", () => {
    expect(manifest.name).toBe("EstudIA");
    expect(manifest.short_name).toBe("EstudIA");
  });

  it("todos sus íconos existen, incluido el maskable", () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    for (const { src } of manifest.icons) expect(existsSync(join(PUBLICO, src))).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });
});
