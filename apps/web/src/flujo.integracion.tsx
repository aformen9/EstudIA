// @vitest-environment jsdom
/**
 * Criterio 5 de la fase 0, por el flujo real de la interfaz contra el stack local: elegir
 * UCA / LCD / 7023 e importar el caso de prueba legacy. Usa un alumno nuevo por corrida, porque
 * `repositorioSupabase.integracion.ts` deja al usuario de prueba con un plan ya activo.
 * Ver vitest.integracion.config.ts: al terminar hay que hacer `supabase db reset`.
 */
import { conteoPorEstado, type DatosAlumno } from "@estudia/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { App } from "./App";
import { crearConexion, type Conexion } from "./conexion/conexion";
import { crearRepositorioSupabase } from "./repositorio/repositorioSupabase";
import { urlEsLocal } from "./sesion/loginDePrueba";

const RAIZ_WEB = resolve(import.meta.dirname, "..");
const entorno = loadEnv("development", RAIZ_WEB, "VITE_");
const ESPERA = { timeout: 15_000 };

describe("Criterio 5: importar el caso de prueba por la interfaz", () => {
  let conexion: Conexion;

  beforeAll(async () => {
    const url = entorno.VITE_SUPABASE_URL ?? "";
    if (!urlEsLocal(url)) throw new Error("Esta prueba solo corre contra Supabase local.");
    const creada = crearConexion(entorno);
    if (!creada) throw new Error("Faltan las variables del stack local.");
    conexion = creada;
    window.scrollTo = () => {};
    window.location.hash = "";
    const { error } = await conexion.cliente.auth.signUp({
      email: `criterio5.${crypto.randomUUID()}@estudia.test`,
      password: "usuario-inventado-solo-local",
    });
    if (error) throw error;
  });

  afterAll(async () => {
    cleanup();
    await conexion.cliente.auth.signOut({ scope: "local" });
  });

  it("UCA / LCD / 7023 → legacy → 50 materias con 26/5/2/17 y promedio 7,73", async () => {
    render(<App conexion={conexion} />);

    // Sin inscripción activa: onboarding obligatorio, y sin nada guardado todavía.
    expect(await screen.findByRole("heading", { name: "Elegí tu carrera" }, ESPERA)).toBeTruthy();
    expect(window.location.hash).toBe("#onboarding");

    fireEvent.click(await screen.findByRole("radio", { name: /UCA/ }, ESPERA));
    fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
    fireEvent.click(await screen.findByRole("radio", { name: /Ciencias de Datos/ }, ESPERA));
    fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
    fireEvent.click(await screen.findByRole("radio", { name: /Plan 7023/ }, ESPERA));
    fireEvent.click(screen.getByRole("button", { name: "Elegir este plan" }));

    fireEvent.click(await screen.findByRole("button", { name: /Importar respaldo/ }, ESPERA));

    const input = await screen.findByLabelText("Elegir archivo", {}, ESPERA);
    const contenido = readFileSync(
      resolve(RAIZ_WEB, "../../fixtures/caso-prueba-legacy.json"),
      "utf8",
    );
    fireEvent.change(input, {
      target: { files: [new File([contenido], "caso-prueba-legacy.json")] },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Guardar estos datos" }, ESPERA));

    expect(
      await screen.findByRole("heading", { name: "Llevás 26 de 50 materias aprobadas" }, ESPERA),
    ).toBeTruthy();
    expect(window.location.hash).toBe("#inicio");
    expect(
      screen.getByText("Licenciatura en Ciencias de Datos · Plan 7023 · Promedio 7,73"),
    ).toBeTruthy();

    // Lo que quedó en la base, leído aparte de la caché de la interfaz.
    const repositorio = crearRepositorioSupabase(conexion.cliente);
    const [inscripcion] = await repositorio.listarInscripciones();
    const planId = inscripcion?.planId ?? "";
    const datos: DatosAlumno = {
      ...(await repositorio.obtenerPlanCompleto(planId)),
      progreso: await repositorio.obtenerProgreso(planId),
      historial: await repositorio.obtenerHistorial(planId),
    };
    expect(datos.materias).toHaveLength(50);
    expect(conteoPorEstado(datos)).toEqual({
      aprobada: 26,
      cursando: 5,
      final: 2,
      pendiente: 17,
    });
  });
});
