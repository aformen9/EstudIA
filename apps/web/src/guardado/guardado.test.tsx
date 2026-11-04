import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderConRepositorio, repositorioFalso } from "../pruebas/entornoVistas";
import { conIndicador, crearAlmacenGuardado, textoGuardado } from "./almacenGuardado";
import { IndicadorGuardado } from "./IndicadorGuardado";

const INICIO = { pendientes: 0, ultimo: "ninguno", fallosVisibles: 0 } as const;

describe("textoGuardado", () => {
  it("antes de la primera escritura no afirma haber guardado", () => {
    expect(textoGuardado(INICIO, true).texto).toBe("Sin cambios");
  });

  it("dice Guardando, Guardado y el fallo", () => {
    expect(textoGuardado({ ...INICIO, pendientes: 1 }, true).texto).toBe("Guardando…");
    expect(textoGuardado({ ...INICIO, ultimo: "ok" }, true).texto).toBe("Guardado en la nube");
    expect(textoGuardado({ ...INICIO, ultimo: "error" }, true).texto).toBe("No se pudo guardar");
  });

  it("un fallo que sigue a la vista gana a un guardado posterior", () => {
    expect(textoGuardado({ ...INICIO, ultimo: "ok", fallosVisibles: 1 }, true).texto).toBe(
      "No se pudo guardar",
    );
  });

  it("sin conexión lo dice antes que todo", () => {
    expect(textoGuardado({ ...INICIO, pendientes: 1 }, false).texto).toBe("Sin conexión");
  });
});

describe("almacén de guardado", () => {
  it("sigue una escritura que sale bien y una que falla, sin tragarse el error", async () => {
    const almacen = crearAlmacenGuardado();
    let terminar = () => {};
    const escritura = almacen.seguir(() => new Promise<void>((r) => (terminar = r)));
    expect(almacen.leer().pendientes).toBe(1);
    terminar();
    await escritura;
    expect(almacen.leer()).toEqual({ pendientes: 0, ultimo: "ok", fallosVisibles: 0 });

    await expect(almacen.seguir(() => Promise.reject(new Error("mal")))).rejects.toThrow("mal");
    expect(almacen.leer().ultimo).toBe("error");
  });

  it("marcarFallo se resuelve una sola vez", () => {
    const almacen = crearAlmacenGuardado();
    const resolver = almacen.marcarFallo();
    expect(almacen.leer().fallosVisibles).toBe(1);
    resolver();
    resolver();
    expect(almacen.leer().fallosVisibles).toBe(0);
  });

  it("conIndicador sigue todas las escrituras y ninguna lectura", async () => {
    const almacen = crearAlmacenGuardado();
    const repositorio = conIndicador(repositorioFalso(), almacen);

    await repositorio.listarInscripciones();
    expect(almacen.leer().ultimo).toBe("ninguno");

    await repositorio.activarPlan("p");
    expect(almacen.leer().ultimo).toBe("ok");
  });
});

describe("IndicadorGuardado", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cambia con las escrituras: nada, guardando, guardado y fallo", async () => {
    const { guardado } = renderConRepositorio(<IndicadorGuardado />, repositorioFalso());
    expect(screen.getByRole("status").textContent).toBe("Sin cambios");

    let terminar = () => {};
    let escritura = Promise.resolve();
    act(() => {
      escritura = guardado.seguir(() => new Promise<void>((r) => (terminar = r)));
    });
    expect(screen.getByRole("status").textContent).toBe("Guardando…");

    await act(async () => {
      terminar();
      await escritura;
    });
    expect(screen.getByRole("status").textContent).toBe("Guardado en la nube");

    await act(async () => {
      await guardado.seguir(() => Promise.reject(new Error("mal"))).catch(() => {});
    });
    expect(screen.getByRole("status").textContent).toBe("No se pudo guardar");
  });

  it("avisa al quedarse sin conexión y al volver", async () => {
    const enLinea = vi.spyOn(navigator, "onLine", "get");
    renderConRepositorio(<IndicadorGuardado />, repositorioFalso());

    enLinea.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("status").textContent).toBe("Sin conexión");

    enLinea.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Sin cambios"));
  });
});
