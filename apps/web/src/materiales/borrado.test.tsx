import type { Material } from "@estudia/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../interfaz/Shell";
import { ID_ALUMNO } from "../pruebas/clienteFalso";
import {
  abrirVista,
  INSCRIPCION,
  PLAN,
  repositorioFalso,
  type RepositorioFalso,
} from "../pruebas/entornoVistas";
import { hacerFallarIndexedDb } from "../pruebas/indexedDbFalso";
import { archivosDeUsuario } from "./archivosLocales";
import { crearBorradosPendientes, PLAZO_DESHACER_MS } from "./borradosPendientes";

const MATERIA = PLAN.materias[0];
if (!MATERIA) throw new Error("Sin materias");
const SHA = "b".repeat(64);
const MIOS = archivosDeUsuario(ID_ALUMNO);

const base = {
  materiaId: MATERIA.id,
  visibilidad: "privado",
  anonimo: false,
  periodo: null,
  oculto: false,
  createdAt: "2026-02-03T00:00:00Z",
} as const;

const nota = (id: string): Material => ({ ...base, id, titulo: id, tipo: "nota", texto: "x" });
const archivo = (id: string, cambios: Partial<Material> = {}) =>
  ({
    ...base,
    id,
    titulo: id,
    tipo: "archivo",
    driveFileId: null,
    documento: { id: "doc-1", sha256: SHA, mime: "application/pdf", bytes: 1, paginas: null },
    ...cambios,
  }) as Material;

const guardarCopia = () =>
  MIOS.guardar({
    sha256: SHA,
    nombre: "x",
    mime: "application/pdf",
    bytes: 1,
    contenido: new Blob(["x"]),
  });

/** Atrapa solo los temporizadores del plazo de "Deshacer": lo demás corre con el reloj real. */
function capturarPlazos() {
  const plazos = new Map<number, () => void>();
  let proximo = 1_000_000;
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    funcion: () => void,
    ms?: number,
    ...resto: unknown[]
  ) => {
    // Al reanudar arranca con lo que faltaba: apenas menos que el plazo entero.
    const esPlazo = ms !== undefined && ms > PLAZO_DESHACER_MS - 3000 && ms <= PLAZO_DESHACER_MS;
    if (!esPlazo) return realSet(funcion, ms, ...resto);
    const id = proximo++;
    plazos.set(id, funcion);
    return id;
  }) as typeof setTimeout);
  vi.spyOn(globalThis, "clearTimeout").mockImplementation(((id?: number) => {
    if (id !== undefined && plazos.delete(id)) return;
    realClear(id);
  }) as typeof clearTimeout);
  return {
    plazos,
    async vencerTodos() {
      const pendientes = [...plazos.values()];
      plazos.clear();
      await act(async () => {
        pendientes.forEach((funcion) => funcion());
      });
    },
    async vencerElPrimero() {
      const [entrada] = plazos.entries();
      if (!entrada) throw new Error("No hay plazos");
      plazos.delete(entrada[0]);
      await act(async () => entrada[1]());
    },
  };
}

const conMateriales = (materiales: Material[]) =>
  repositorioFalso({ inscripciones: [INSCRIPCION], materiales });

const abrir = (repositorio: RepositorioFalso) => abrirVista("materiales", <Shell />, repositorio);

const contador = () =>
  document.querySelector<HTMLElement>('a[data-v="materiales"] em')?.textContent;

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  window.scrollTo = () => {};
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("borrar un material con Deshacer", () => {
  it("desaparece al instante de la lista y del contador, con el aviso, sin borrar todavía", async () => {
    capturarPlazos();
    const repositorio = conMateriales([nota("uno"), nota("dos")]);
    const { main } = await abrir(repositorio);
    await main.findByText("uno");
    await waitFor(() => expect(contador()).toBe("2"));

    fireEvent.click(main.getByRole("button", { name: "Borrar uno" }));

    expect(main.queryByText("uno")).toBeNull();
    expect(contador()).toBe("1");
    expect(repositorio.borrarMaterial).not.toHaveBeenCalled();
    const boton = screen.getByRole("button", { name: /Deshacer.*uno/ });
    expect(boton.textContent).toBe("Deshacer");
    expect(boton.closest('[role="status"]')?.textContent).toContain("Borraste “uno”");
  });

  it("no pide un segundo toque", async () => {
    capturarPlazos();
    const { main } = await abrir(conMateriales([nota("uno")]));
    fireEvent.click(await main.findByRole("button", { name: "Borrar uno" }));
    expect(screen.queryByRole("button", { name: /Confirmar/ })).toBeNull();
    expect(screen.queryByText("¿Borrar?")).toBeNull();
  });

  it("Deshacer lo trae de vuelta, no borra nada y el foco vuelve al material", async () => {
    const reloj = capturarPlazos();
    const repositorio = conMateriales([nota("uno")]);
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Borrar uno" }));

    fireEvent.click(screen.getByRole("button", { name: /Deshacer/ }));

    expect(await main.findByText("uno")).toBeTruthy();
    expect(contador()).toBe("1");
    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
    expect(reloj.plazos.size).toBe(0);
    await waitFor(() =>
      expect(document.activeElement).toBe(main.getByRole("button", { name: "Borrar uno" })),
    );
    expect(repositorio.borrarMaterial).not.toHaveBeenCalled();
  });

  it("salir de la página cancela: al volver con Atrás no se borra sin poder deshacer", async () => {
    const reloj = capturarPlazos();
    const repositorio = conMateriales([nota("uno")]);
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Borrar uno" }));
    expect(reloj.plazos.size).toBe(1);

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(reloj.plazos.size).toBe(0);
    expect(repositorio.borrarMaterial).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
    expect(await main.findByText("uno")).toBeTruthy();
  });

  it("el plazo es de 8 s, y al vencer borra de verdad y saca el aviso", async () => {
    const reloj = capturarPlazos();
    const repositorio = conMateriales([nota("uno")]);
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Borrar uno" }));
    expect(PLAZO_DESHACER_MS).toBe(8000);
    expect(reloj.plazos.size).toBe(1);

    await reloj.vencerTodos();

    await waitFor(() => expect(repositorio.borrarMaterial).toHaveBeenCalledExactlyOnceWith("uno"));
    expect(repositorio.base.materiales).toEqual([]);
    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
    expect(await main.findByRole("heading", { name: "Todavía no subiste material" })).toBeTruthy();
  });

  it.each(["recargar o cerrar la pestaña", "cerrar la sesión"])(
    "%s antes de vencer no borra",
    async () => {
      const reloj = capturarPlazos();
      const repositorio = conMateriales([nota("uno")]);
      const primera = await abrir(repositorio);
      fireEvent.click(await primera.main.findByRole("button", { name: "Borrar uno" }));

      // Las dos desmontan el Shell: la sesión anónima muestra el login y recargar lo tira entero.
      primera.unmount();
      expect(reloj.plazos.size).toBe(0);
      expect(repositorio.borrarMaterial).not.toHaveBeenCalled();
      expect(repositorio.base.materiales).toHaveLength(1);

      const segunda = await abrir(repositorio);
      expect(await segunda.main.findByText("uno")).toBeTruthy();
    },
  );

  it("si el borrado real falla, el material vuelve y se avisa", async () => {
    const reloj = capturarPlazos();
    const repositorio = conMateriales([nota("uno")]);
    repositorio.borrarMaterial.mockRejectedValueOnce(new Error("se cortó"));
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Borrar uno" }));

    await reloj.vencerTodos();

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain('No pude borrar "uno"');
    expect(alerta.textContent).toContain("se cortó");
    expect(await main.findByText("uno")).toBeTruthy();
    expect(contador()).toBe("1");

    fireEvent.click(within(alerta).getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("dos seguidos: cada uno con su plazo, y se pueden deshacer por separado", async () => {
    const reloj = capturarPlazos();
    const repositorio = conMateriales([nota("uno"), nota("dos"), nota("tres")]);
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Borrar uno" }));
    fireEvent.click(main.getByRole("button", { name: "Borrar dos" }));

    expect(reloj.plazos.size).toBe(2);
    expect(contador()).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: /Deshacer.*uno/ }));
    expect(main.getByText("uno")).toBeTruthy();
    expect(main.queryByText("dos")).toBeNull();
    expect(reloj.plazos.size).toBe(1);

    await reloj.vencerTodos();
    await waitFor(() => expect(repositorio.borrarMaterial).toHaveBeenCalledExactlyOnceWith("dos"));
    expect(repositorio.base.materiales.map((m) => m.id)).toEqual(["uno", "tres"]);
  });

  it("el foco no queda en el aviso al borrar: pasa al material vecino", async () => {
    capturarPlazos();
    const { main } = await abrir(conMateriales([nota("uno"), nota("dos")]));
    const boton = await main.findByRole("button", { name: "Borrar uno" });
    act(() => boton.focus());
    fireEvent.click(boton);
    await waitFor(() => expect(main.queryByText("uno")).toBeNull());
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toMatch(
      /^Borrar dos/,
    );
  });

  it("se pausa con el puntero y con el foco, y sigue recién cuando no queda ninguno", async () => {
    const reloj = capturarPlazos();
    const { main } = await abrir(conMateriales([nota("uno")]));
    fireEvent.click(await main.findByRole("button", { name: "Borrar uno" }));
    const boton = screen.getByRole("button", { name: /Deshacer/ });
    const aviso = boton.parentElement as HTMLElement;

    fireEvent.mouseEnter(aviso);
    expect(reloj.plazos.size).toBe(0);
    fireEvent.focus(boton);
    fireEvent.mouseLeave(aviso);
    expect(reloj.plazos.size).toBe(0);
    fireEvent.blur(boton);
    expect(reloj.plazos.size).toBe(1);
  });

  it("borrado desde el panel: el aviso va adentro del modal, si no quedaría inerte", async () => {
    capturarPlazos();
    const repositorio = conMateriales([nota("uno")]);
    const { main } = await abrirVista("materias", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: new RegExp(`^${MATERIA?.nombre}`) }));
    const dialogo = await screen.findByRole("dialog");
    const panel = within(dialogo);
    fireEvent.click(await panel.findByRole("button", { name: "Borrar uno" }));

    const boton = panel.getByRole("button", { name: /Deshacer/ });
    expect(dialogo.contains(boton)).toBe(true);
    expect(screen.getAllByRole("button", { name: /Deshacer/ })).toHaveLength(1);
    expect(panel.queryByText("Se guarda solo")).toBeNull();
  });

  it("volver a subir un archivo que está por borrarse no dice que ya está", async () => {
    capturarPlazos();
    const contenido = "abc";
    const repositorio = conMateriales([
      archivo("apunte.pdf", {
        documento: {
          id: "doc",
          sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
          mime: null,
          bytes: 1,
          paginas: null,
        },
      } as Partial<Material>),
    ]);
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Borrar apunte.pdf" }));
    fireEvent.click(main.getByRole("button", { name: "Subir material" }));
    const dialogo = within(await screen.findByRole("dialog", { name: "Subir material" }));
    fireEvent.change(dialogo.getByLabelText("¿De qué materia es?"), {
      target: { value: MATERIA?.id },
    });
    fireEvent.change(dialogo.getByLabelText("Elegir archivos"), {
      target: { files: [new File([contenido], "apunte.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(repositorio.agregarMaterial).toHaveBeenCalledOnce());
    expect(dialogo.queryByText(/ya está en esta materia/)).toBeNull();
  });
});

describe("la copia local al vencer", () => {
  it("se borra si ninguna otra referencia la usa", async () => {
    const reloj = capturarPlazos();
    await guardarCopia();
    const repositorio = conMateriales([archivo("a.pdf")]);
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Borrar a.pdf" }));
    expect(await MIOS.contar()).toBe(1);

    await reloj.vencerTodos();

    await waitFor(async () => expect(await MIOS.contar()).toBe(0));
  });

  it("se conserva si la usa otra referencia, también de OTRO plan", async () => {
    const reloj = capturarPlazos();
    await guardarCopia();
    const deOtroPlan = archivo("otro-plan.pdf", { materiaId: "materia-de-otro-plan" });
    const repositorio = conMateriales([archivo("a.pdf"), deOtroPlan]);
    const { main } = await abrir(repositorio);
    await main.findByText("a.pdf");
    // La de otro plan no se ve ni se cuenta en esta vista.
    expect(main.queryByText("otro-plan.pdf")).toBeNull();

    fireEvent.click(main.getByRole("button", { name: "Borrar a.pdf" }));
    await reloj.vencerTodos();

    await waitFor(() => expect(repositorio.borrarMaterial).toHaveBeenCalledWith("a.pdf"));
    await waitFor(() => expect(repositorio.listarMateriales).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(await MIOS.contar()).toBe(1);
  });

  it("dos referencias borradas seguidas: la copia se va con la última", async () => {
    const reloj = capturarPlazos();
    await guardarCopia();
    const repositorio = conMateriales([
      archivo("a.pdf"),
      archivo("b.pdf", { materiaId: PLAN.materias[1]?.id ?? null }),
    ]);
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Borrar a.pdf" }));
    fireEvent.click(main.getByRole("button", { name: "Borrar b.pdf" }));

    await reloj.vencerElPrimero();
    await waitFor(() => expect(repositorio.base.materiales).toHaveLength(1));
    expect(await MIOS.contar()).toBe(1);

    await reloj.vencerElPrimero();
    await waitFor(async () => expect(await MIOS.contar()).toBe(0));
  });

  it("si no puede saber si otro la usa, no la borra", async () => {
    const reloj = capturarPlazos();
    await guardarCopia();
    const repositorio = conMateriales([archivo("a.pdf")]);
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Borrar a.pdf" }));
    repositorio.listarMateriales.mockRejectedValueOnce(new Error("sin red"));

    await reloj.vencerTodos();

    await waitFor(() => expect(repositorio.borrarMaterial).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(await MIOS.contar()).toBe(1);
  });

  it("si se borró el material pero no la copia, avisa", async () => {
    const reloj = capturarPlazos();
    await guardarCopia();
    const repositorio = conMateriales([archivo("a.pdf")]);
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Borrar a.pdf" }));
    hacerFallarIndexedDb("delete");

    await reloj.vencerTodos();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "su copia sigue en este dispositivo",
    );
  });
});

describe("crearBorradosPendientes", () => {
  it("ejecutarPendientes borra ya lo pendiente y espera a que termine", async () => {
    const borrados: string[] = [];
    const pendientes = crearBorradosPendientes(async (material) => {
      await Promise.resolve();
      borrados.push(material.id);
      return null;
    });
    pendientes.pedir(nota("a"));
    pendientes.pedir(nota("b"));
    pendientes.pausar("b", "foco");

    await pendientes.ejecutarPendientes();

    expect(borrados).toEqual(["a", "b"]);
    expect(pendientes.leer().pendientes).toEqual([]);
    expect(pendientes.leer().ocultos.size).toBe(0);
  });

  it("ejecutarPendientes también espera lo que ya se estaba borrando", async () => {
    vi.useFakeTimers();
    try {
      let terminar = () => {};
      const pendientes = crearBorradosPendientes(
        () =>
          new Promise<null>((resolver) => {
            terminar = () => resolver(null);
          }),
      );
      pendientes.pedir(nota("a"));
      await vi.advanceTimersByTimeAsync(PLAZO_DESHACER_MS);

      let termino = false;
      void pendientes.ejecutarPendientes().then(() => (termino = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(termino).toBe(false);

      terminar();
      await vi.advanceTimersByTimeAsync(0);
      expect(termino).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("si un borrado falla, ejecutarPendientes no rechaza y queda en fallos", async () => {
    const pendientes = crearBorradosPendientes(() => Promise.reject(new Error("sin red")));
    pendientes.pedir(nota("a"));
    await pendientes.ejecutarPendientes();
    expect(pendientes.leer().fallos[0]?.texto).toContain("sin red");
    expect(pendientes.leer().ocultos.size).toBe(0);
  });

  it("pausar conserva lo que faltaba, en vez de empezar de nuevo", () => {
    vi.useFakeTimers();
    try {
      const ejecutar = vi.fn().mockResolvedValue(null);
      const borrados = crearBorradosPendientes(ejecutar);
      borrados.pedir(nota("uno"));

      vi.advanceTimersByTime(5000);
      borrados.pausar("uno", "foco");
      vi.advanceTimersByTime(60_000);
      expect(ejecutar).not.toHaveBeenCalled();

      borrados.reanudar("uno", "foco");
      vi.advanceTimersByTime(2999);
      expect(ejecutar).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(ejecutar).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancelarTodo no borra y deja de ocultar", () => {
    vi.useFakeTimers();
    try {
      const ejecutar = vi.fn().mockResolvedValue(null);
      const borrados = crearBorradosPendientes(ejecutar);
      borrados.pedir(nota("uno"));
      borrados.cancelarTodo();
      vi.advanceTimersByTime(60_000);
      expect(ejecutar).not.toHaveBeenCalled();
      expect(borrados.leer().ocultos.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sigue oculto mientras se borra, y deja de estarlo al terminar", async () => {
    vi.useFakeTimers();
    try {
      let terminar: (valor: null) => void = () => {};
      const ejecutar = vi.fn(() => new Promise<null>((resolver) => (terminar = resolver)));
      const borrados = crearBorradosPendientes(ejecutar);
      borrados.pedir(nota("uno"));
      vi.advanceTimersByTime(PLAZO_DESHACER_MS);
      expect(borrados.leer().pendientes).toEqual([]);
      expect(borrados.leer().ocultos.has("uno")).toBe(true);
      terminar(null);
      await vi.advanceTimersByTimeAsync(0);
      expect(borrados.leer().ocultos.has("uno")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
