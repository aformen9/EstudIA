import type { Material } from "@estudia/core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../interfaz/Shell";
import {
  abrirVista,
  elegirArchivoAlCargar,
  hashEs,
  ID_PLAN,
  INSCRIPCION,
  leerFixtureLegacy,
  PLAN,
  repositorioFalso,
  type RepositorioFalso,
} from "../pruebas/entornoVistas";

const abrir = (repositorio: RepositorioFalso) => abrirVista("ajustes", <Shell />, repositorio);
const conInscripcion = (extra: Parameters<typeof repositorioFalso>[0] = {}) =>
  repositorioFalso({ inscripciones: [INSCRIPCION], ...extra });

const nota = (id: string, materiaId: string | null): Material => ({
  id,
  materiaId,
  tipo: "nota",
  titulo: id,
  texto: "x",
  visibilidad: "privado",
  anonimo: false,
  periodo: null,
  oculto: false,
  createdAt: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  window.scrollTo = () => {};
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Ajustes", () => {
  it("cambia el nombre y se ve en el menú", async () => {
    const repositorio = conInscripcion();
    repositorio.actualizarPerfil.mockImplementation(async ({ nombre }) => ({
      id: "u",
      nombre,
      avatarUrl: null,
      esAdmin: false,
    }));
    const { main, container } = await abrir(repositorio);
    const campo = await main.findByLabelText("Nombre");
    await waitFor(() => expect((campo as HTMLInputElement).value).toBe("Ana Pérez"));

    fireEvent.change(campo, { target: { value: "  Ana " } });
    fireEvent.click(main.getByRole("button", { name: "Guardar nombre" }));

    await waitFor(() =>
      expect(repositorio.actualizarPerfil).toHaveBeenCalledExactlyOnceWith({ nombre: "Ana" }),
    );
    expect(
      await within(container.querySelector(".brand") as HTMLElement).findByText("Ana"),
    ).toBeTruthy();
  });

  it("si no puede guardar el nombre lo dice", async () => {
    const repositorio = conInscripcion();
    repositorio.actualizarPerfil.mockRejectedValueOnce(new Error("sin red"));
    const { main } = await abrir(repositorio);
    await main.findByLabelText("Nombre");
    fireEvent.click(main.getByRole("button", { name: "Guardar nombre" }));
    expect((await main.findByRole("alert")).textContent).toContain("sin red");
  });

  it("cambiar de plan activa el elegido, avisa que no se borra nada y lleva a Inicio", async () => {
    const repositorio = conInscripcion();
    const otro = { ...PLAN.plan, id: "plan-2", version: "9000" };
    repositorio.listarPlanes.mockResolvedValue([PLAN.plan, otro]);
    const { main } = await abrir(repositorio);

    fireEvent.click(await main.findByRole("button", { name: "Cambiar de carrera o plan" }));
    expect(main.getByText(/no se borra: vuelve a aparecer/)).toBeTruthy();
    await main.findByRole("radio", { name: /UCA/ });
    fireEvent.click(main.getByRole("button", { name: "Seguir" }));
    await main.findByRole("radio", { name: /Ciencias de Datos/ });
    fireEvent.click(main.getByRole("button", { name: "Seguir" }));
    fireEvent.click(await main.findByRole("radio", { name: /Plan 9000/ }));
    fireEvent.click(main.getByRole("button", { name: "Elegir este plan" }));

    await waitFor(() => expect(repositorio.activarPlan).toHaveBeenCalledExactlyOnceWith("plan-2"));
    await hashEs("#inicio");
    expect(repositorio.reemplazarDatosDelPlan).not.toHaveBeenCalled();
  });

  it("elegir el plan actual no activa nada", async () => {
    const repositorio = conInscripcion();
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Cambiar de carrera o plan" }));
    await main.findByRole("radio", { name: /UCA/ });
    fireEvent.click(main.getByRole("button", { name: "Seguir" }));
    await main.findByRole("radio", { name: /Ciencias de Datos/ });
    fireEvent.click(main.getByRole("button", { name: "Seguir" }));
    await main.findByRole("radio", { name: /Plan 7023/ });
    fireEvent.click(main.getByRole("button", { name: "Elegir este plan" }));
    expect(repositorio.activarPlan).not.toHaveBeenCalled();
    expect(await main.findByRole("button", { name: "Cambiar de carrera o plan" })).toBeTruthy();
  });

  it("descarga el respaldo e informa los materiales que no entran", async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blobs.push(b as Blob);
      return "blob:falso";
    });
    URL.revokeObjectURL = vi.fn();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const repositorio = conInscripcion({
      materiales: [nota("mia", PLAN.materias[0]?.id ?? ""), nota("ajena", "otra-materia")],
    });
    const { main } = await abrir(repositorio);

    const boton = await main.findByRole<HTMLButtonElement>("button", {
      name: "Descargar respaldo",
    });
    await waitFor(() => expect(boton.disabled).toBe(false));
    fireEvent.click(boton);

    expect(clic).toHaveBeenCalledOnce();
    const respaldo = JSON.parse(await (blobs[0] as Blob).text());
    expect(respaldo.formato).toBe("estudia-respaldo");
    expect(respaldo.plan.version).toBe("7023");
    expect(respaldo.materiales.map((m: { titulo: string }) => m.titulo)).toEqual(["mia"]);
    expect(main.getByText(/No incluye 1 material de otro plan/)).toBeTruthy();
  });

  it("sin materiales de otro plan solo dice que se descargó", async () => {
    URL.createObjectURL = vi.fn(() => "blob:falso");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { main } = await abrir(conInscripcion());
    const boton = await main.findByRole<HTMLButtonElement>("button", {
      name: "Descargar respaldo",
    });
    await waitFor(() => expect(boton.disabled).toBe(false));
    fireEvent.click(boton);
    expect(main.getByText("Respaldo descargado.")).toBeTruthy();
  });

  it("importa un respaldo viejo y lleva a Inicio", async () => {
    const repositorio = conInscripcion();
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Importar respaldo" }));
    await elegirArchivoAlCargar(leerFixtureLegacy());
    fireEvent.click(await main.findByRole("button", { name: "Guardar estos datos" }));
    await hashEs("#inicio");
    expect(repositorio.reemplazarDatosDelPlan.mock.calls[0]?.[0]).toBe(ID_PLAN);
  });

  it("Volver desde importar regresa a Ajustes", async () => {
    const { main } = await abrir(conInscripcion());
    fireEvent.click(await main.findByRole("button", { name: "Importar respaldo" }));
    fireEvent.click(main.getByRole("button", { name: "Volver" }));
    expect(await main.findByRole("button", { name: "Descargar respaldo" })).toBeTruthy();
  });

  it("cerrar sesión desde Ajustes usa el mismo diálogo", async () => {
    const { main, signOut } = await abrir(conInscripcion());
    fireEvent.click(await main.findByRole("button", { name: "Cerrar sesión" }));
    const dialogo = within(await screen.findByRole("dialog", { name: "Cerrar sesión" }));
    // Este usuario no tiene archivos en el dispositivo: no hay nada que ofrecer borrar.
    expect(dialogo.queryByRole("checkbox")).toBeNull();
    fireEvent.click(dialogo.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" }));
  });
});
