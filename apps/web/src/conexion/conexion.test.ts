import { describe, expect, it } from "vitest";
import { crearConexion } from "./conexion";

const URL_LOCAL = "http://127.0.0.1:54321";

describe("crearConexion", () => {
  it("arma el cliente con URL y clave", () => {
    const conexion = crearConexion({
      VITE_SUPABASE_URL: URL_LOCAL,
      VITE_SUPABASE_PUBLISHABLE_KEY: "clave",
    });
    expect(conexion?.url).toBe(URL_LOCAL);
    expect(conexion?.cliente).toBeTruthy();
  });

  it.each([
    [{}],
    [{ VITE_SUPABASE_URL: URL_LOCAL }],
    [{ VITE_SUPABASE_PUBLISHABLE_KEY: "clave" }],
    [{ VITE_SUPABASE_URL: "  ", VITE_SUPABASE_PUBLISHABLE_KEY: "clave" }],
    [{ VITE_SUPABASE_URL: "no es una url", VITE_SUPABASE_PUBLISHABLE_KEY: "clave" }],
    [{ VITE_SUPABASE_URL: "ftp://ejemplo.test", VITE_SUPABASE_PUBLISHABLE_KEY: "clave" }],
  ])("devuelve null sin variables válidas: %j", (variables) => {
    expect(crearConexion(variables)).toBeNull();
  });
});
