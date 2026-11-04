import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conteoPorEstado } from "@estudia/core";
import { IndicadorGuardado } from "../guardado/IndicadorGuardado";
import { ConPlan } from "../plan/planActivo";
import {
  fila,
  ID_PLAN,
  INSCRIPCION,
  PLAN,
  renderConRepositorio,
  repositorioFalso,
  type RepositorioFalso,
} from "../pruebas/entornoVistas";
import { GrillaRapida } from "./GrillaRapida";

const [M1, M2] = PLAN.materias as [(typeof PLAN.materias)[0], (typeof PLAN.materias)[0]];

function montar(repositorio: RepositorioFalso, alTerminar = () => {}) {
  return renderConRepositorio(
    <>
      <IndicadorGuardado />
      <ConPlan>
        {(datos) => <GrillaRapida datos={datos} alVolver={() => {}} alTerminar={alTerminar} />}
      </ConPlan>
    </>,
    repositorio,
  );
}

function opcion(nombreMateria: string, estado: string) {
  return within(
    screen.getByRole("radiogroup", { name: nombreMateria }),
  ).getByRole<HTMLInputElement>("radio", { name: estado });
}

function indicador() {
  return screen.getByRole("status").textContent;
}

beforeEach(() => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

describe("GrillaRapida", () => {
  it("muestra las 50 materias, agrupadas por año y cuatrimestre con las extras al final", async () => {
    montar(repositorioFalso({ inscripciones: [INSCRIPCION] }));
    await screen.findByRole("radiogroup", { name: M1.nombre });

    expect(screen.getAllByRole("radiogroup")).toHaveLength(50);
    const titulos = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titulos[0]).toBe("1° año · 1° cuatrimestre");
    expect(titulos[1]).toBe("1° año · 2° cuatrimestre");
    expect(titulos.at(-1)).toBe("Extras");
  });

  it("es navegable con teclado: cada materia es un grupo de radios nativos con su nombre", async () => {
    montar(repositorioFalso({ inscripciones: [INSCRIPCION] }));
    await screen.findByRole("radiogroup", { name: M1.nombre });

    const radios = within(
      screen.getByRole("radiogroup", { name: M1.nombre }),
    ).getAllByRole<HTMLInputElement>("radio");
    expect(radios.map((r) => r.closest("label")?.textContent)).toEqual([
      "Pendiente",
      "En curso",
      "Final pendiente",
      "Aprobada",
    ]);
    // Mismo `name`: Tab entra una vez al grupo y las flechas cambian la opción.
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(radios.every((r) => r.tabIndex !== -1)).toBe(true);
  });

  it("guarda sola la materia que cambia, y una sin fila arranca vacía", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    montar(repositorio);
    await screen.findByRole("radiogroup", { name: M1.nombre });
    expect(opcion(M1.nombre, "Pendiente").checked).toBe(true);
    expect(indicador()).toBe("Sin cambios");

    fireEvent.click(opcion(M1.nombre, "En curso"));

    await waitFor(() =>
      expect(repositorio.guardarProgreso).toHaveBeenCalledExactlyOnceWith(
        fila(M1.id, { estado: "cursando" }),
      ),
    );
    expect(opcion(M1.nombre, "En curso").checked).toBe(true);
    await waitFor(() => expect(indicador()).toBe("Guardado en la nube"));
  });

  it("conserva los demás campos de una fila que ya existe", async () => {
    const existente = fila(M1.id, {
      estado: "final",
      p1: 7,
      p2: 8,
      rec: 6,
      notaCursada: 7.5,
      notaFinalExamen: 2,
      nota: null,
      aplazos: [2, 3],
    });
    const repositorio = repositorioFalso({
      inscripciones: [INSCRIPCION],
      progreso: [existente],
    });
    montar(repositorio);
    await screen.findByRole("radiogroup", { name: M1.nombre });
    expect(opcion(M1.nombre, "Final pendiente").checked).toBe(true);

    fireEvent.click(opcion(M1.nombre, "Aprobada"));

    await waitFor(() =>
      expect(repositorio.guardarProgreso).toHaveBeenCalledExactlyOnceWith({
        ...existente,
        estado: "aprobada",
      }),
    );
  });

  it("si falla, avisa, vuelve al estado anterior y no dice guardado; reintentar lo guarda", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.guardarProgreso.mockRejectedValueOnce(new Error("se cortó"));
    montar(repositorio);
    await screen.findByRole("radiogroup", { name: M1.nombre });

    fireEvent.click(opcion(M1.nombre, "Aprobada"));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain(`No se guardó ${M1.nombre}`);
    expect(alerta.textContent).toContain("se cortó");
    expect(opcion(M1.nombre, "Pendiente").checked).toBe(true);
    expect(opcion(M1.nombre, "Aprobada").checked).toBe(false);
    expect(indicador()).toBe("No se pudo guardar");

    fireEvent.click(within(alerta).getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(opcion(M1.nombre, "Aprobada").checked).toBe(true);
    expect(repositorio.base.progreso).toEqual([fila(M1.id, { estado: "aprobada" })]);
    await waitFor(() => expect(indicador()).toBe("Guardado en la nube"));
  });

  it("sin conexión no deja el cambio en cola: lo intenta, falla y avisa", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.guardarProgreso.mockRejectedValueOnce(new Error("Failed to fetch"));
    montar(repositorio);
    await screen.findByRole("radiogroup", { name: M1.nombre });

    onlineManager.setOnline(false);
    try {
      fireEvent.click(opcion(M1.nombre, "Aprobada"));
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(repositorio.guardarProgreso).toHaveBeenCalledOnce();
      expect(opcion(M1.nombre, "Pendiente").checked).toBe(true);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("guardar otra materia no esconde un fallo que sigue a la vista", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.guardarProgreso.mockRejectedValueOnce(new Error("se cortó"));
    montar(repositorio);
    await screen.findByRole("radiogroup", { name: M1.nombre });

    fireEvent.click(opcion(M1.nombre, "Aprobada"));
    await screen.findByRole("alert");

    fireEvent.click(opcion(M2.nombre, "En curso"));
    await waitFor(() => expect(repositorio.base.progreso).toHaveLength(1));
    await waitFor(() => expect(opcion(M2.nombre, "En curso").checked).toBe(true));
    await act(async () => {});

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(indicador()).toBe("No se pudo guardar");
  });

  it("dos cambios seguidos de una materia van en orden y queda el último", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const terminar: (() => void)[] = [];
    repositorio.guardarProgreso.mockImplementation(
      (f) =>
        new Promise((r) =>
          terminar.push(() => {
            repositorio.base.progreso = [f];
            r();
          }),
        ),
    );
    montar(repositorio);
    await screen.findByRole("radiogroup", { name: M1.nombre });

    fireEvent.click(opcion(M1.nombre, "En curso"));
    await waitFor(() => expect(repositorio.guardarProgreso).toHaveBeenCalledTimes(1));
    fireEvent.click(opcion(M1.nombre, "Aprobada"));
    await waitFor(() => expect(opcion(M1.nombre, "Aprobada").checked).toBe(true));

    // El segundo espera a que termine el primero.
    expect(repositorio.guardarProgreso).toHaveBeenCalledTimes(1);
    await act(async () => terminar[0]?.());
    await waitFor(() => expect(repositorio.guardarProgreso).toHaveBeenCalledTimes(2));
    expect(opcion(M1.nombre, "Aprobada").checked).toBe(true);

    await act(async () => terminar[1]?.());
    await waitFor(() => expect(indicador()).toBe("Guardado en la nube"));
    expect(repositorio.base.progreso).toEqual([fila(M1.id, { estado: "aprobada" })]);
  });

  it("si falla el primero de dos cambios seguidos y sale bien el segundo, queda el segundo", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    let fallar = () => {};
    repositorio.guardarProgreso.mockImplementationOnce(
      () => new Promise((_, rechazar) => (fallar = () => rechazar(new Error("uno")))),
    );
    montar(repositorio);
    await screen.findByRole("radiogroup", { name: M1.nombre });

    fireEvent.click(opcion(M1.nombre, "En curso"));
    await waitFor(() => expect(repositorio.guardarProgreso).toHaveBeenCalledTimes(1));
    fireEvent.click(opcion(M1.nombre, "Aprobada"));
    await waitFor(() => expect(opcion(M1.nombre, "Aprobada").checked).toBe(true));

    await act(async () => fallar());

    await waitFor(() => expect(repositorio.base.progreso).toHaveLength(1));
    expect(opcion(M1.nombre, "Aprobada").checked).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("los contadores salen de core y Listo termina", async () => {
    const repositorio = repositorioFalso({
      inscripciones: [INSCRIPCION],
      progreso: [fila(M1.id, { estado: "aprobada" })],
    });
    const alTerminar = vi.fn();
    montar(repositorio, alTerminar);
    await screen.findByRole("radiogroup", { name: M1.nombre });

    const conteo = conteoPorEstado({ ...PLAN, progreso: repositorio.base.progreso, historial: [] });
    expect(screen.getByText(new RegExp(`Aprobada: ${conteo.aprobada}`))).toBeTruthy();
    expect(screen.getByText(new RegExp(`Pendiente: ${conteo.pendiente}`))).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Listo, ir a Inicio" }));
    expect(alTerminar).toHaveBeenCalled();
    expect(repositorio.obtenerProgreso).toHaveBeenCalledWith(ID_PLAN);
  });
});
