// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMAIL_DE_PRUEBA, PASSWORD_DE_PRUEBA, TEXTO_DEL_BOTON } from "./loginDePrueba";

const RAIZ_WEB = resolve(import.meta.dirname, "../..");
const VITE = resolve(RAIZ_WEB, "node_modules/vite/bin/vite.js");

const MARCADORES = {
  email: EMAIL_DE_PRUEBA,
  contraseña: PASSWORD_DE_PRUEBA,
  "texto del botón": TEXTO_DEL_BOTON,
  "nombre del módulo": "loginDePrueba",
};

/**
 * Es un proceso aparte a propósito: Vite decide `import.meta.env.DEV` según `NODE_ENV`, y Vitest lo
 * pone en "test". Un `build()` acá adentro daría DEV=true y no sería el build que se despliega.
 */
describe("build de producción", () => {
  let salida: string;
  let archivos: { nombre: string; contenido: string }[];

  beforeAll(async () => {
    salida = mkdtempSync(join(tmpdir(), "estudia-build-"));
    await promisify(execFile)(
      process.execPath,
      [VITE, "build", "--outDir", salida, "--emptyOutDir", "--logLevel", "error"],
      { cwd: RAIZ_WEB, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" } },
    );
    archivos = (readdirSync(salida, { recursive: true, withFileTypes: true }) ?? [])
      .filter((e) => e.isFile())
      .map((e) => ({
        nombre: join(e.parentPath, e.name),
        contenido: readFileSync(join(e.parentPath, e.name), "latin1"),
      }));
  }, 120_000);

  afterAll(() => {
    if (salida) rmSync(salida, { recursive: true, force: true });
  });

  it("es el bundle de verdad: trae el login con Google", () => {
    const js = archivos.filter((a) => a.nombre.endsWith(".js"));
    expect(js.length).toBeGreaterThan(0);
    expect(js.some((a) => a.contenido.includes("Entrar con Google"))).toBe(true);
  });

  it.each(Object.entries(MARCADORES))("no contiene el login de prueba: %s", (_nombre, marcador) => {
    const conMarcador = archivos.filter(
      (a) => a.nombre.includes(marcador) || a.contenido.includes(marcador),
    );
    expect(conMarcador.map((a) => a.nombre)).toEqual([]);
  });
});
