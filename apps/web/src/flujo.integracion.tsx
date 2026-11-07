// @vitest-environment jsdom
/**
 * Criterio 5 de la fase 0, por el flujo real de la interfaz contra el stack local: elegir
 * UCA / LCD / 7023 e importar el caso de prueba legacy. Usa un alumno nuevo por corrida, porque
 * `repositorioSupabase.integracion.ts` deja al usuario de prueba con un plan ya activo.
 * Ver vitest.integracion.config.ts: al terminar hay que hacer `supabase db reset`.
 */
import {
  conteoPorEstado,
  restaurarMateriales,
  type DatosAlumno,
  type Repositorio,
} from "@estudia/core";
import { crearRespaldo, leerRespaldo } from "@estudia/core/importacion";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const ESPERA_WAITFOR = { timeout: 15_000 };

async function datosDe(repositorio: Repositorio): Promise<DatosAlumno> {
  const [inscripcion] = await repositorio.listarInscripciones();
  const planId = inscripcion?.planId ?? "";
  return {
    ...(await repositorio.obtenerPlanCompleto(planId)),
    progreso: await repositorio.obtenerProgreso(planId),
    historial: await repositorio.obtenerHistorial(planId),
  };
}

describe("Criterio 5: importar el caso de prueba por la interfaz", () => {
  let conexion: Conexion;

  /** Un `render` nuevo trae su propia caché: es lo mismo que recargar la página. */
  async function recargarEn(hash: string) {
    cleanup();
    window.location.hash = hash;
    render(<App conexion={conexion} />);
    return within(await screen.findByRole("main", {}, ESPERA));
  }

  async function abrirPanel(nombre: RegExp) {
    const main = await recargarEn("materias");
    fireEvent.click(await main.findByRole("button", { name: nombre }, ESPERA));
    return within(await screen.findByRole("dialog", {}, ESPERA));
  }

  const panelCerrado = () =>
    waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), ESPERA_WAITFOR);

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
    const main = within(screen.getByRole("main"));
    expect(main.getByText("Licenciatura en Ciencias de Datos · Plan 7023")).toBeTruthy();
    const promedio = main.getByRole("link", { name: /Promedio/ });
    expect(promedio.textContent).toContain("7,73");
    expect(promedio.textContent).toContain("con aplazos 7,36");

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

  it("cambiar una nota persiste al recargar", async () => {
    const panel = await abrirPanel(/^Cálculo Elemental/);
    fireEvent.change(panel.getByLabelText("Nota final"), { target: { value: "7" } });
    fireEvent.click(panel.getByRole("button", { name: "Guardar" }));
    await panelCerrado();

    const repositorio = crearRepositorioSupabase(conexion.cliente);
    const datos = await datosDe(repositorio);
    const materia = datos.materias.find((m) => m.nombre === "Cálculo Elemental");
    expect(datos.progreso.find((f) => f.materiaId === materia?.id)?.nota).toBe(7);

    const otraVez = await abrirPanel(/^Cálculo Elemental/);
    expect((otraVez.getByLabelText("Nota final") as HTMLSelectElement).value).toBe("7");
  });

  it("crear y borrar una materia propia: su material queda sin materia y privado", async () => {
    const repositorio = crearRepositorioSupabase(conexion.cliente);

    const main = await recargarEn("materias");
    fireEvent.click(await main.findByRole("button", { name: "Agregar materia" }, ESPERA));
    const nueva = within(await screen.findByRole("dialog", { name: "Agregar materia" }, ESPERA));
    fireEvent.change(nueva.getByLabelText("Nombre"), { target: { value: "Optativa de prueba" } });
    fireEvent.click(nueva.getByRole("button", { name: "Guardar" }));
    await panelCerrado();

    const creada = (await datosDe(repositorio)).materias.find(
      (m) => m.nombre === "Optativa de prueba",
    );
    if (!creada) throw new Error("No se creó la materia");
    expect(creada).toMatchObject({ tipo: "Materia", codigo: null });
    expect(creada.ownerId).not.toBeNull();

    const material = await repositorio.agregarMaterial({
      id: crypto.randomUUID(),
      tipo: "nota",
      materiaId: creada.id,
      titulo: "Apunte de la optativa",
      texto: "Texto",
    });

    const panel = await abrirPanel(/^Optativa de prueba/);
    await panel.findByText("Apunte de la optativa", {}, ESPERA);
    const editar = panel.getByText(/Editar nombre/).closest("details") as HTMLDetailsElement;
    editar.open = true;
    fireEvent.click(panel.getByRole("button", { name: "Eliminar materia" }));
    expect(panel.getByRole("alert").textContent).toContain("Su material (1) no se borra");
    fireEvent.click(panel.getByRole("button", { name: "Sí, eliminar" }));
    await panelCerrado();

    const datos = await datosDe(repositorio);
    expect(datos.materias.some((m) => m.id === creada.id)).toBe(false);
    const quedo = (await repositorio.listarMateriales()).find((m) => m.id === material.id);
    expect(quedo).toMatchObject({ materiaId: null, visibilidad: "privado" });
  });

  it("un material link se restaura de un respaldo, sin duplicarse", async () => {
    const repositorio = crearRepositorioSupabase(conexion.cliente);
    const datos = await datosDe(repositorio);
    const materia = datos.materias.find((m) => m.nombre === "Cálculo Elemental");
    const link = await repositorio.agregarMaterial({
      id: crypto.randomUUID(),
      tipo: "link",
      materiaId: materia?.id ?? null,
      titulo: "Clase grabada",
      url: "https://ejemplo.test/clase",
      periodo: "2025-2C",
      createdAt: "2025-03-01T12:00:00+00:00",
    });
    const { respaldo } = crearRespaldo(
      datos,
      await repositorio.listarMateriales(),
      new Date().toISOString(),
    );
    await repositorio.borrarMaterial(link.id);

    const main = await recargarEn("ajustes");
    fireEvent.click(await main.findByRole("button", { name: "Importar respaldo" }, ESPERA));
    fireEvent.change(await main.findByLabelText("Elegir archivo", {}, ESPERA), {
      target: { files: [new File([JSON.stringify(respaldo)], "respaldo.json")] },
    });
    fireEvent.click(await main.findByRole("checkbox", { name: /Entiendo/ }, ESPERA));
    fireEvent.click(main.getByRole("button", { name: "Reemplazar mis datos" }));
    await main.findByText("Omitidos (ya estaban)", {}, ESPERA);
    expect(main.getByText("Agregados").closest("div")?.textContent).toContain("1");

    const restaurado = (await repositorio.listarMateriales()).find(
      (m) => m.tipo === "link" && m.titulo === "Clase grabada",
    );
    expect(restaurado).toMatchObject({
      materiaId: materia?.id,
      url: "https://ejemplo.test/clase",
      periodo: "2025-2C",
    });
    expect(new Date(restaurado?.createdAt ?? "").toISOString()).toBe("2025-03-01T12:00:00.000Z");

    // Restaurar de nuevo no duplica.
    const leido = leerRespaldo(respaldo, datos);
    if (!leido.ok) throw new Error(leido.error);
    const antes = (await repositorio.listarMateriales()).length;
    const segunda = await restaurarMateriales(repositorio, leido.materiales, {}, () =>
      crypto.randomUUID(),
    );
    expect(segunda.agregados).toBe(0);
    expect((await repositorio.listarMateriales()).length).toBe(antes);
  });

  it("efecto aceptado (arquitectura §6): restaurar con una materia propia borrada deja el material en la recreada y también sin materia", async () => {
    const repositorio = crearRepositorioSupabase(conexion.cliente);
    const { plan } = await datosDe(repositorio);
    const propia = await repositorio.crearMateriaPropia(
      plan.id,
      {
        codigo: "EFECTO1",
        nombre: "Materia del efecto aceptado",
        anio: 3,
        cuatrimestre: 1,
        tipo: "Materia",
        area: null,
        requiereAnioCompletoParaCursar: null,
        correlativas: [],
      },
      crypto.randomUUID(),
    );
    const titulo = "Apunte del efecto aceptado";
    const material = await repositorio.agregarMaterial({
      id: crypto.randomUUID(),
      tipo: "nota",
      materiaId: propia.id,
      titulo,
      texto: "Texto",
    });

    const datos = await datosDe(repositorio);
    const { respaldo } = crearRespaldo(
      datos,
      await repositorio.listarMateriales(),
      new Date().toISOString(),
    );

    await repositorio.borrarMateriaPropia(propia.id);
    const suelto = (await repositorio.listarMateriales()).find((m) => m.id === material.id);
    expect(suelto).toMatchObject({ materiaId: null, visibilidad: "privado" });

    const sinLaMateria = await datosDe(repositorio);
    const leido = leerRespaldo(respaldo, sinLaMateria);
    if (!leido.ok) throw new Error(leido.error);
    const claves = await repositorio.reemplazarDatosDelPlan(plan.id, leido.datos);
    const restaurado = await restaurarMateriales(repositorio, leido.materiales, claves, () =>
      crypto.randomUUID(),
    );
    expect(restaurado.fallidos).toEqual([]);

    const recreada = (await datosDe(repositorio)).materias.find(
      (m) => m.nombre === "Materia del efecto aceptado",
    );
    if (!recreada) throw new Error("No se recreó la materia");
    expect(recreada.id).not.toBe(propia.id);
    const copias = (await repositorio.listarMateriales()).filter((m) => m.titulo === titulo);
    expect(copias.map((m) => m.materiaId).sort()).toEqual([recreada.id, null].sort());
  });
});
