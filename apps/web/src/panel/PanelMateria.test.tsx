import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Correlativa, Material, PlanCompleto } from "@estudia/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TiempoDeGuardadoAgotado } from "../guardado/almacenGuardado";
import * as efectos from "../interfaz/efectos";
import { Shell } from "../interfaz/Shell";
import {
  abrirVista,
  datosDelCasoDePrueba,
  fila,
  INSCRIPCION,
  PLAN,
  repositorioFalso,
  type RepositorioFalso,
} from "../pruebas/entornoVistas";

const porCodigo = (codigo: string) => {
  const m = PLAN.materias.find((x) => x.codigo === codigo);
  if (!m) throw new Error(`No existe ${codigo}`);
  return m;
};
const CALCULO = porCodigo("GMA0136");
const OTRA = porCodigo("GMA1234");
const TERCERA = porCodigo("GCO0406");

const PROPIA = {
  ...CALCULO,
  id: "propia",
  codigo: null,
  nombre: "Optativa",
  anio: 1,
  cuatrimestre: 1,
  ownerId: "u",
};

function planConPropia(correlativas: Correlativa[] = []): PlanCompleto {
  return {
    ...PLAN,
    materias: [...PLAN.materias, PROPIA],
    correlativas: [...PLAN.correlativas, ...correlativas],
  };
}

const conInscripcion = (extra: Parameters<typeof repositorioFalso>[0] = {}) =>
  repositorioFalso({ inscripciones: [INSCRIPCION], ...extra });

/** Abre el panel desde la fila de Materias. */
async function abrirPanel(
  repositorio: RepositorioFalso,
  nombre: string | RegExp,
  opciones?: { tiempoGuardadoMs?: number },
) {
  const { main } = await abrirVista("materias", <Shell />, repositorio, opciones);
  const fila = await main.findByRole("button", {
    name: typeof nombre === "string" ? new RegExp(`^${nombre}`) : nombre,
  });
  act(() => fila.focus());
  fireEvent.click(fila);
  const dialogo = await screen.findByRole("dialog");
  return { main, fila, dialogo, panel: within(dialogo) };
}

const guardar = (panel: ReturnType<typeof within>) =>
  fireEvent.click(panel.getByRole("button", { name: "Guardar" }));

const elegir = (panel: ReturnType<typeof within>, etiqueta: string, valor: string) =>
  fireEvent.change(panel.getByLabelText(etiqueta), { target: { value: valor } });

const valorDe = (panel: ReturnType<typeof within>, etiqueta: string) =>
  (panel.getByLabelText(etiqueta) as HTMLSelectElement).value;

const cerrado = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  window.scrollTo = () => {};
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("foco y teclado", () => {
  it("Escape cierra y el foco vuelve a la fila", async () => {
    const { fila: origen, dialogo } = await abrirPanel(conInscripcion(), CALCULO.nombre);
    expect(dialogo.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialogo, { key: "Escape" });

    await cerrado();
    expect(document.activeElement).toBe(origen);
  });

  it("Tab queda atrapado adentro del panel, en los dos sentidos", async () => {
    const { dialogo, panel } = await abrirPanel(conInscripcion(), CALCULO.nombre);
    const cerrar = panel.getByRole("button", { name: "Cerrar" });
    const ultimo = panel.getByRole("button", { name: "Guardar" });

    act(() => ultimo.focus());
    fireEvent.keyDown(dialogo, { key: "Tab" });
    expect(document.activeElement).toBe(cerrar);

    fireEvent.keyDown(dialogo, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(ultimo);
  });

  it("el diálogo tiene por nombre el de la materia", async () => {
    await abrirPanel(conInscripcion(), CALCULO.nombre);
    expect(screen.getByRole("dialog", { name: CALCULO.nombre })).toBeTruthy();
  });
});

describe("correlativas e historial", () => {
  it("muestra para cursar y rendir con su estado, y el año completo", async () => {
    const m = porCodigo("GES0315");
    const repositorio = conInscripcion(datosDelCasoDePrueba());
    const { main } = await abrirVista("finales", <Shell />, repositorio);
    const tarjeta = (await main.findByRole("heading", { name: m.nombre })).closest(
      "section",
    ) as HTMLElement;
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Abrir materia" }));
    const panel = within(await screen.findByRole("dialog"));

    const rendir = panel.getByText("Para rendir").closest(".rl") as HTMLElement;
    const falta = within(rendir).getByText(porCodigo("GMA0212").nombre).closest(".req");
    expect(falta?.classList.contains("no")).toBe(true);
    expect(falta?.textContent).toContain("(falta)");
    expect(panel.getByText("Para cursar")).toBeTruthy();

    const filas = within(panel.getByRole("table")).getAllByRole("row");
    expect(filas.length).toBeGreaterThan(1);
    expect(panel.getByRole("table").closest(".hist-wrap")).toBeTruthy();
  });

  it("el historial va del más nuevo al más viejo", async () => {
    const evento = (fecha: string, nota: number) => ({
      materiaId: CALCULO.id,
      fecha,
      tipo: "Examen" as const,
      nota,
      resultado: "Reprobado" as const,
      fuente: "manual" as const,
    });
    const { panel } = await abrirPanel(
      conInscripcion({ historial: [evento("2024-01-01", 2), evento("2025-01-01", 3)] }),
      CALCULO.nombre,
    );
    const [, primera] = within(panel.getByRole("table")).getAllByRole("row");
    expect(primera?.textContent).toContain("01/01/2025");
  });
});

describe("notas", () => {
  it("ofrece los enteros de la escala del plan", async () => {
    const { panel } = await abrirPanel(conInscripcion(), CALCULO.nombre);
    const opciones = within(panel.getByLabelText("Parcial 1")).getAllByRole("option");
    expect(opciones.map((o) => o.textContent)).toEqual([
      "–",
      ...Array.from({ length: 10 }, (_, i) => String(i + 1)),
    ]);
  });

  it("una nota con decimales aparece como opción extra", async () => {
    const repositorio = conInscripcion({ progreso: [fila(CALCULO.id, { p1: 7.5 })] });
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre);
    expect(valorDe(panel, "Parcial 1")).toBe("7.5");
    expect(
      within(panel.getByLabelText("Parcial 1")).getByRole("option", { name: "7,5" }),
    ).toBeTruthy();
    expect(
      within(panel.getByLabelText("Parcial 2")).queryByRole("option", { name: "7,5" }),
    ).toBeNull();
  });

  it("abrir y guardar sin tocar nada no la cambia ni escribe", async () => {
    const existente = fila(CALCULO.id, {
      estado: "final",
      p1: 7.5,
      nota: null,
      notaCursada: 6.25,
      aplazos: [2.5, 0],
    });
    const repositorio = conInscripcion({ progreso: [existente] });
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre);

    guardar(panel);

    await cerrado();
    expect(repositorio.guardarProgreso).not.toHaveBeenCalled();
    expect(repositorio.base.progreso).toEqual([existente]);
  });

  it("una materia sin datos no crea una fila al guardar sin tocar nada", async () => {
    const repositorio = conInscripcion();
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre);
    guardar(panel);
    await cerrado();
    expect(repositorio.base.progreso).toEqual([]);
  });

  it("cambiar otro campo conserva los decimales y los aplazos intactos", async () => {
    const existente = fila(CALCULO.id, { estado: "cursando", p1: 7.5, aplazos: [2.5] });
    const repositorio = conInscripcion({ progreso: [existente] });
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre);

    elegir(panel, "Parcial 2", "8");
    guardar(panel);

    await cerrado();
    expect(repositorio.base.progreso).toEqual([{ ...existente, p2: 8 }]);
  });

  it("los aplazos se leen con core: separa y descarta lo que no entra en la escala", async () => {
    const repositorio = conInscripcion();
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre);
    fireEvent.change(panel.getByLabelText(/^Aplazos/), { target: { value: "2; 3 99" } });
    guardar(panel);
    await cerrado();
    expect(repositorio.base.progreso[0]?.aplazos).toEqual([2, 3]);
  });

  it("una nota final que aprueba propone Aprobada, y un examen copia la nota", async () => {
    const { panel } = await abrirPanel(conInscripcion(), CALCULO.nombre);
    elegir(panel, "Final", "8");
    expect(valorDe(panel, "Estado")).toBe("aprobada");
    expect(valorDe(panel, "Nota final")).toBe("8");
  });

  it("sugiere pasar a Final pendiente con los parciales aprobados", async () => {
    const { panel } = await abrirPanel(
      conInscripcion({ progreso: [fila(CALCULO.id, { estado: "cursando" })] }),
      CALCULO.nombre,
    );
    elegir(panel, "Parcial 1", "7");
    elegir(panel, "Parcial 2", "7");
    expect(panel.getByText(/Aprobaste los parciales/)).toBeTruthy();
  });
});

describe("guardar", () => {
  it("al aprobar lanza el confeti y felicita", async () => {
    const confeti = vi.spyOn(efectos, "lanzarConfeti");
    const repositorio = conInscripcion();
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre);

    elegir(panel, "Nota final", "9");
    guardar(panel);

    await cerrado();
    expect(confeti).toHaveBeenCalledOnce();
    expect(screen.getByText(`¡Aprobaste ${CALCULO.nombre}! 🎉`)).toBeTruthy();
    expect(repositorio.base.progreso[0]).toMatchObject({ estado: "aprobada", nota: 9 });
  });

  it("si ya estaba aprobada no vuelve a festejar", async () => {
    const confeti = vi.spyOn(efectos, "lanzarConfeti");
    const repositorio = conInscripcion({
      progreso: [fila(CALCULO.id, { estado: "aprobada", nota: 8 })],
    });
    const { panel } = await abrirPanel(repositorio, /^Cálculo Elemental/);
    elegir(panel, "Nota final", "9");
    guardar(panel);
    await cerrado();
    expect(confeti).not.toHaveBeenCalled();
    expect(screen.getByText("Guardado")).toBeTruthy();
  });

  it("si falla se queda abierto, con lo que cargó, y Reintentar guarda", async () => {
    const repositorio = conInscripcion();
    repositorio.guardarProgreso.mockRejectedValueOnce(new Error("se cortó"));
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre);

    elegir(panel, "Parcial 1", "7");
    guardar(panel);

    expect((await panel.findByRole("alert")).textContent).toContain("No se pudo guardar. se cortó");
    expect(valorDe(panel, "Parcial 1")).toBe("7");

    fireEvent.click(panel.getByRole("button", { name: "Reintentar" }));
    await cerrado();
    expect(repositorio.base.progreso).toEqual([fila(CALCULO.id, { p1: 7 })]);
  });

  it("un guardado colgado pasa a No se pudo guardar, y Reintentar es idempotente", async () => {
    const repositorio = conInscripcion();
    repositorio.guardarProgreso.mockImplementationOnce(() => new Promise(() => {}));
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre, { tiempoGuardadoMs: 20 });

    elegir(panel, "Parcial 1", "7");
    guardar(panel);
    expect(panel.getByRole("button", { name: "Guardando…" })).toBeTruthy();

    expect((await panel.findByRole("alert")).textContent).toContain("No se pudo guardar");
    const reintentar = panel.getByRole("button", { name: "Reintentar" });
    expect(screen.getAllByText("No se pudo guardar").length).toBeGreaterThan(0);

    fireEvent.click(reintentar);
    await cerrado();
    expect(repositorio.base.progreso).toEqual([fila(CALCULO.id, { p1: 7 })]);
    expect(repositorio.guardarProgreso).toHaveBeenCalledTimes(2);
  });

  it("una respuesta tardía no pisa lo que se guardó después ni marca Guardado", async () => {
    const repositorio = conInscripcion();
    let responderTarde = () => {};
    repositorio.guardarProgreso.mockImplementationOnce(
      () => new Promise<void>((r) => (responderTarde = r)),
    );
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre, { tiempoGuardadoMs: 20 });

    elegir(panel, "Parcial 1", "7");
    guardar(panel);
    await panel.findByRole("alert");

    await act(async () => {
      responderTarde();
      await new Promise((r) => setTimeout(r));
    });
    // Sigue el aviso: la respuesta llegó tarde y no se da por guardado.
    expect(panel.getByRole("alert").textContent).toContain("No se pudo guardar");
    expect(screen.queryByText("Guardado en la nube")).toBeNull();

    elegir(panel, "Parcial 1", "9");
    fireEvent.click(panel.getByRole("button", { name: "Reintentar" }));
    await cerrado();
    expect(repositorio.base.progreso).toEqual([fila(CALCULO.id, { p1: 9 })]);
  });

  it("con una fila fallida, recargar avisa aunque se haya cerrado el panel", async () => {
    const repositorio = conInscripcion();
    repositorio.guardarProgreso.mockRejectedValueOnce(new Error("se cortó"));
    const { panel, dialogo } = await abrirPanel(repositorio, CALCULO.nombre);
    elegir(panel, "Parcial 1", "7");
    guardar(panel);
    await panel.findByRole("alert");

    fireEvent.keyDown(dialogo, { key: "Escape" });
    await cerrado();

    const evento = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
  });
});

describe("materia del catálogo", () => {
  it("nombre y correlativas son de solo lectura, y no se puede borrar", async () => {
    const { panel } = await abrirPanel(conInscripcion(), CALCULO.nombre);
    expect(panel.queryByLabelText("Nombre")).toBeNull();
    expect(panel.queryByText(/Editar nombre/)).toBeNull();
    expect(panel.queryByRole("button", { name: "Eliminar materia" })).toBeNull();
    expect(panel.queryAllByRole("checkbox")).toEqual([]);
  });
});

describe("materia propia", () => {
  it("edita el nombre, y las correlativas marcadas conservan su condición", async () => {
    const repositorio = conInscripcion({
      plan: planConPropia([
        { materiaId: "propia", requiereId: OTRA.id, para: "cursar", condicion: "aprobada" },
      ]),
    });
    const { panel } = await abrirPanel(repositorio, "Optativa");

    fireEvent.change(panel.getByLabelText("Nombre"), { target: { value: "  Optativa II " } });
    const cursar = within(panel.getByRole("group", { name: /Para cursar/ }));
    fireEvent.click(cursar.getByRole("checkbox", { name: new RegExp(`^${TERCERA.nombre}`) }));
    guardar(panel);

    await cerrado();
    const [, borrador] = repositorio.actualizarMateriaPropia.mock.calls[0] ?? [];
    expect(borrador?.nombre).toBe("Optativa II");
    expect(borrador?.correlativas).toEqual([
      { requiereId: OTRA.id, para: "cursar", condicion: "aprobada" },
      { requiereId: TERCERA.id, para: "cursar", condicion: "regular" },
    ]);
  });

  it("una correlativa nueva para rendir usa la predeterminada, y destildar y volver a tildar conserva", async () => {
    const repositorio = conInscripcion({
      plan: planConPropia([
        { materiaId: "propia", requiereId: OTRA.id, para: "rendir", condicion: "regular" },
      ]),
    });
    const { panel } = await abrirPanel(repositorio, "Optativa");
    const rendir = within(panel.getByRole("group", { name: /Para rendir/ }));
    const otra = rendir.getByRole("checkbox", { name: new RegExp(`^${OTRA.nombre}`) });

    fireEvent.click(otra);
    fireEvent.click(otra);
    fireEvent.click(rendir.getByRole("checkbox", { name: new RegExp(`^${TERCERA.nombre}`) }));
    guardar(panel);

    await cerrado();
    const [, borrador] = repositorio.actualizarMateriaPropia.mock.calls[0] ?? [];
    expect(borrador?.correlativas).toEqual(
      expect.arrayContaining([
        { requiereId: OTRA.id, para: "rendir", condicion: "regular" },
        { requiereId: TERCERA.id, para: "rendir", condicion: "aprobada" },
      ]),
    );
  });

  it("no ofrece a la misma materia como correlativa de sí misma", async () => {
    const { panel } = await abrirPanel(conInscripcion({ plan: planConPropia() }), "Optativa");
    expect(panel.queryByRole("checkbox", { name: /^Optativa/ })).toBeNull();
  });

  it("guardar sin tocar nada no escribe", async () => {
    const repositorio = conInscripcion({ plan: planConPropia() });
    const { panel } = await abrirPanel(repositorio, "Optativa");
    guardar(panel);
    await cerrado();
    expect(repositorio.actualizarMateriaPropia).not.toHaveBeenCalled();
    expect(repositorio.guardarProgreso).not.toHaveBeenCalled();
  });

  it("sin nombre no guarda y lo pide", async () => {
    const repositorio = conInscripcion({ plan: planConPropia() });
    const { panel } = await abrirPanel(repositorio, "Optativa");
    fireEvent.change(panel.getByLabelText("Nombre"), { target: { value: "   " } });
    guardar(panel);
    expect((await panel.findByRole("alert")).textContent).toContain("Poné un nombre");
    expect(repositorio.actualizarMateriaPropia).not.toHaveBeenCalled();
  });

  it("un ciclo nuevo no se guarda y nombra las materias", async () => {
    const plan = planConPropia();
    const conCiclo: PlanCompleto = {
      ...plan,
      correlativas: [
        ...plan.correlativas,
        { materiaId: OTRA.id, requiereId: "propia", para: "cursar", condicion: "regular" },
      ],
    };
    const repositorio = conInscripcion({ plan: conCiclo });
    const { panel } = await abrirPanel(repositorio, "Optativa");

    const cursar = within(panel.getByRole("group", { name: /Para cursar/ }));
    fireEvent.click(cursar.getByRole("checkbox", { name: new RegExp(`^${OTRA.nombre}`) }));
    guardar(panel);

    const alerta = await panel.findByRole("alert");
    expect(alerta.textContent).toContain("Optativa");
    expect(alerta.textContent).toContain(OTRA.nombre);
    expect(repositorio.actualizarMateriaPropia).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  const planConCicloImportado = (): PlanCompleto => {
    const plan = planConPropia([
      { materiaId: "propia", requiereId: OTRA.id, para: "cursar", condicion: "regular" },
    ]);
    return {
      ...plan,
      correlativas: [
        ...plan.correlativas,
        { materiaId: OTRA.id, requiereId: "propia", para: "cursar", condicion: "regular" },
      ],
    };
  };

  it("un ciclo importado no impide guardar notas ni el nombre, si no se tocan las correlativas", async () => {
    const repositorio = conInscripcion({ plan: planConCicloImportado() });
    const { panel } = await abrirPanel(repositorio, "Optativa");

    fireEvent.change(panel.getByLabelText("Nota final"), { target: { value: "7" } });
    fireEvent.change(panel.getByLabelText("Nombre"), { target: { value: "Otro nombre" } });
    guardar(panel);

    await cerrado();
    expect(repositorio.actualizarMateriaPropia).toHaveBeenCalledOnce();
    expect(repositorio.base.progreso[0]).toMatchObject({ materiaId: "propia", nota: 7 });
  });

  it("si cambia las correlativas y el ciclo sigue, las rechaza y explica cómo salir", async () => {
    const repositorio = conInscripcion({ plan: planConCicloImportado() });
    const { panel } = await abrirPanel(repositorio, "Optativa");

    const cursar = within(panel.getByRole("group", { name: /Para cursar/ }));
    fireEvent.click(cursar.getByRole("checkbox", { name: new RegExp(`^${TERCERA.nombre}`) }));
    guardar(panel);

    const alerta = await panel.findByRole("alert");
    expect(alerta.textContent).toContain("No guardé las correlativas");
    expect(alerta.textContent).toContain(`destildá ${OTRA.nombre}`);
    expect(repositorio.actualizarMateriaPropia).not.toHaveBeenCalled();

    // Siguiendo la explicación, se puede guardar.
    fireEvent.click(cursar.getByRole("checkbox", { name: new RegExp(`^${OTRA.nombre}`) }));
    guardar(panel);
    await cerrado();
    expect(repositorio.actualizarMateriaPropia).toHaveBeenCalledOnce();
  });

  it("con un ciclo nuevo guarda las notas y el nombre, y rechaza solo las correlativas", async () => {
    const plan = planConCicloImportado();
    const repositorio = conInscripcion({ plan });
    const { panel } = await abrirPanel(repositorio, "Optativa");
    const propia = plan.materias.find((m) => m.nombre.startsWith("Optativa"));
    const antes = plan.correlativas
      .filter((c) => c.materiaId === propia?.id)
      .map(({ requiereId, para, condicion }) => ({ requiereId, para, condicion }));

    fireEvent.change(panel.getByLabelText("Nota de cursada"), { target: { value: "7" } });
    fireEvent.change(panel.getByLabelText("Nombre"), { target: { value: "Optativa nueva" } });
    const cursar = within(panel.getByRole("group", { name: /Para cursar/ }));
    fireEvent.click(cursar.getByRole("checkbox", { name: new RegExp(`^${TERCERA.nombre}`) }));
    guardar(panel);

    const alerta = await panel.findByRole("alert");
    expect(alerta.textContent).toContain("Guardé lo demás, pero no las correlativas");
    expect(repositorio.guardarProgreso).toHaveBeenCalledOnce();
    expect(repositorio.guardarProgreso.mock.calls[0]?.[0]).toMatchObject({ notaCursada: 7 });
    expect(repositorio.actualizarMateriaPropia).toHaveBeenCalledOnce();
    const enviado = repositorio.actualizarMateriaPropia.mock.calls[0]?.[1];
    expect(enviado?.nombre).toBe("Optativa nueva");
    expect(enviado?.correlativas).toEqual(antes);
    // Sigue abierto, con lo que marcó, para que pueda corregirlo.
    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(
      (cursar.getByRole("checkbox", { name: new RegExp(`^${TERCERA.nombre}`) }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
});

describe("crear una materia propia", () => {
  async function abrirNueva(repositorio: RepositorioFalso) {
    const { main } = await abrirVista("materias", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Agregar materia" }));
    const dialogo = await screen.findByRole("dialog", { name: "Agregar materia" });
    return { main, panel: within(dialogo) };
  }

  it("sin nombre no crea", async () => {
    const repositorio = conInscripcion();
    const { panel } = await abrirNueva(repositorio);
    guardar(panel);
    expect((await panel.findByRole("alert")).textContent).toContain("Poné un nombre");
    expect(repositorio.crearMateriaPropia).not.toHaveBeenCalled();
  });

  it("crea con tipo Materia, en la pestaña actual, y aparece en la lista sin crear progreso", async () => {
    const repositorio = conInscripcion();
    const { main, panel } = await abrirNueva(repositorio);

    fireEvent.change(panel.getByLabelText("Nombre"), { target: { value: " Seminario II " } });
    const cursar = within(panel.getByRole("group", { name: /Para cursar/ }));
    fireEvent.click(cursar.getByRole("checkbox", { name: new RegExp(`^${OTRA.nombre}`) }));
    guardar(panel);

    await cerrado();
    expect(repositorio.crearMateriaPropia).toHaveBeenCalledExactlyOnceWith(
      INSCRIPCION.planId,
      {
        codigo: null,
        nombre: "Seminario II",
        anio: 1,
        cuatrimestre: 1,
        tipo: "Materia",
        area: null,
        requiereAnioCompletoParaCursar: null,
        correlativas: [{ requiereId: OTRA.id, para: "cursar", condicion: "regular" }],
      },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(repositorio.guardarProgreso).not.toHaveBeenCalled();
    expect(await main.findByRole("button", { name: /^Seminario II/ })).toBeTruthy();
  });

  it("en Extras no tiene cuatrimestre", async () => {
    const repositorio = conInscripcion();
    const { panel } = await abrirNueva(repositorio);
    fireEvent.change(panel.getByLabelText("Nombre"), { target: { value: "Inglés" } });
    elegir(panel, "Año", "0");
    guardar(panel);
    await cerrado();
    expect(repositorio.crearMateriaPropia.mock.calls[0]?.[1]).toMatchObject({
      anio: 0,
      cuatrimestre: null,
    });
  });

  it("después de un timeout, Reintentar usa el mismo id y no duplica la materia", async () => {
    const repositorio = conInscripcion();
    const original = repositorio.crearMateriaPropia.getMockImplementation();
    repositorio.crearMateriaPropia.mockImplementationOnce(async (...args) => {
      await original?.(...args); // Llegó, pero se perdió la respuesta.
      throw new TiempoDeGuardadoAgotado();
    });
    const { panel } = await abrirNueva(repositorio);
    fireEvent.change(panel.getByLabelText("Nombre"), { target: { value: "Seminario" } });
    guardar(panel);
    await panel.findByRole("alert");
    fireEvent.click(panel.getByRole("button", { name: "Reintentar" }));

    await cerrado();
    const [primera, segunda] = repositorio.crearMateriaPropia.mock.calls;
    expect(segunda?.[2]).toBe(primera?.[2]);
    expect(repositorio.base.plan.materias.filter((m) => m.nombre === "Seminario")).toHaveLength(1);
    expect(repositorio.actualizarMateriaPropia).not.toHaveBeenCalled();
  });

  it("si corrige algo entre el timeout y el reintento, no se pierde", async () => {
    const repositorio = conInscripcion();
    const original = repositorio.crearMateriaPropia.getMockImplementation();
    repositorio.crearMateriaPropia.mockImplementationOnce(async (...args) => {
      await original?.(...args);
      throw new TiempoDeGuardadoAgotado();
    });
    const { panel } = await abrirNueva(repositorio);
    fireEvent.change(panel.getByLabelText("Nombre"), { target: { value: "Seminaro" } });
    guardar(panel);
    await panel.findByRole("alert");
    fireEvent.change(panel.getByLabelText("Nombre"), { target: { value: "Seminario" } });
    fireEvent.click(panel.getByRole("button", { name: "Reintentar" }));

    await cerrado();
    const nombres = repositorio.base.plan.materias.filter((m) => m.ownerId === "u");
    expect(nombres.map((m) => m.nombre)).toEqual(["Seminario"]);
  });

  it("si crea pero falla el progreso, Reintentar no crea otra", async () => {
    const repositorio = conInscripcion();
    repositorio.guardarProgreso.mockRejectedValueOnce(new Error("se cortó"));
    const { panel } = await abrirNueva(repositorio);
    fireEvent.change(panel.getByLabelText("Nombre"), { target: { value: "Seminario" } });
    elegir(panel, "Estado", "cursando");
    guardar(panel);

    await panel.findByRole("alert");
    fireEvent.click(panel.getByRole("button", { name: "Reintentar" }));

    await cerrado();
    expect(repositorio.crearMateriaPropia).toHaveBeenCalledOnce();
    expect(repositorio.base.progreso[0]).toMatchObject({ estado: "cursando" });
  });
});

describe("borrar una materia propia", () => {
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

  it("avisa cuántos materiales tiene y qué les pasa, y Cancelar no borra", async () => {
    const repositorio = conInscripcion({
      plan: planConPropia(),
      materiales: [nota("a", "propia"), nota("b", "propia"), nota("c", OTRA.id)],
    });
    const { panel } = await abrirPanel(repositorio, "Optativa");
    await panel.findByText("a");

    fireEvent.click(panel.getByRole("button", { name: "Eliminar materia" }));
    const aviso = panel.getByRole("alert");
    expect(aviso.textContent).toContain(
      "Su material (2) no se borra: queda guardado sin materia y privado",
    );
    expect(aviso.textContent).toContain("notas e historial");

    fireEvent.click(panel.getByRole("button", { name: "Cancelar" }));
    expect(repositorio.borrarMateriaPropia).not.toHaveBeenCalled();
  });

  it("borra, el material queda sin materia, y la lista se actualiza", async () => {
    const repositorio = conInscripcion({
      plan: planConPropia(),
      progreso: [fila("propia", { estado: "cursando" })],
      materiales: [nota("a", "propia")],
    });
    const { panel, main } = await abrirPanel(repositorio, "Optativa");

    fireEvent.click(panel.getByRole("button", { name: "Eliminar materia" }));
    fireEvent.click(panel.getByRole("button", { name: "Sí, eliminar" }));

    await cerrado();
    expect(repositorio.borrarMateriaPropia).toHaveBeenCalledExactlyOnceWith("propia");
    expect(repositorio.base.materiales[0]?.materiaId).toBeNull();
    expect(repositorio.base.progreso).toEqual([]);
    await waitFor(() => expect(main.queryByRole("button", { name: /^Optativa/ })).toBeNull());
    expect(screen.getByText("Materia eliminada")).toBeTruthy();
  });

  it("si no puede borrar lo dice y se queda abierto", async () => {
    const repositorio = conInscripcion({ plan: planConPropia() });
    repositorio.borrarMateriaPropia.mockRejectedValueOnce(new Error("no es tuya"));
    const { panel } = await abrirPanel(repositorio, "Optativa");
    fireEvent.click(panel.getByRole("button", { name: "Eliminar materia" }));
    fireEvent.click(panel.getByRole("button", { name: "Sí, eliminar" }));
    expect(await panel.findByText("no es tuya")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
