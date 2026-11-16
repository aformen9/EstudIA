import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Correlativa, Material, PlanCompleto, ProgresoMateria } from "@estudia/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TiempoDeGuardadoAgotado } from "../guardado/almacenGuardado";
import * as efectos from "../interfaz/efectos";
import { Shell } from "../interfaz/Shell";
import { fechaDeHoy } from "../plan/presentacion";
import {
  abrirVista,
  datosDelCasoDePrueba,
  fila,
  filaConNotas,
  inst,
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

const ESTADOS: Record<string, string> = {
  pendiente: "Por cursar",
  cursando: "En curso",
  final: "Falta final",
  aprobada: "Aprobada",
};
const SEGMENTADOS = new Set(["Estado", "Año", "Cuatrimestre"]);

/** El texto de la opción de un control segmentado para un valor. */
function textoDeOpcion(etiqueta: string, valor: string): string {
  if (etiqueta === "Estado") return ESTADOS[valor] ?? valor;
  if (etiqueta === "Año") return valor === "0" ? "Extras" : `${valor}°`;
  return valor === "" ? "Anual" : `${valor}°`;
}

/** Elige como lo haría el alumno: un botón de opción, o escribiendo la nota en su slider. */
function elegir(panel: ReturnType<typeof within>, etiqueta: string, valor: string) {
  if (SEGMENTADOS.has(etiqueta)) {
    const grupo = panel.getByRole("radiogroup", { name: etiqueta });
    fireEvent.click(within(grupo).getByRole("radio", { name: textoDeOpcion(etiqueta, valor) }));
    return;
  }
  // Si no hay una instancia con ese nombre, se agrega una del tipo y se le pone la nota.
  let nombre = etiqueta;
  if (!panel.queryByRole("slider", { name: etiqueta })) {
    const tipo = TIPO_DE[etiqueta];
    if (!tipo) throw new Error(`No sé qué instancia es ${etiqueta}`);
    agregarInstancia(panel, tipo);
    const nuevas = panel
      .getAllByRole("slider")
      .filter((s: HTMLElement) => s.getAttribute("aria-valuetext") === "Sin nota");
    nombre = nuevas.at(-1)?.getAttribute("aria-label") ?? nombreDelSlider(nuevas.at(-1));
  }
  escribirNota(panel, nombre, valor);
}

const TIPO_DE: Record<string, string> = {
  Parcial: "Parcial",
  "Parcial 1": "Parcial",
  "Parcial 2": "Parcial",
  Recuperatorio: "Recuperatorio",
  Cursada: "Cursada",
  "Nota de cursada": "Cursada",
  Final: "Final",
  "Nota final": "Final",
  Promoción: "Promoción",
};

function nombreDelSlider(slider: HTMLElement | undefined): string {
  const id = slider?.getAttribute("aria-labelledby");
  return (id && document.getElementById(id)?.textContent) || "";
}

/** "+ Agregar instancia" y el tipo, como lo haría el alumno. */
function agregarInstancia(panel: ReturnType<typeof within>, tipo: string) {
  fireEvent.click(panel.getByRole("button", { name: "Agregar instancia" }));
  fireEvent.click(panel.getByRole("menuitem", { name: new RegExp(`^${tipo}`) }));
}

function escribirNota(panel: ReturnType<typeof within>, etiqueta: string, valor: string) {
  if (valor === "") {
    fireEvent.click(panel.getByRole("button", { name: `${etiqueta}: sin nota` }));
    return;
  }
  fireEvent.click(panel.getByRole("button", { name: new RegExp(`^Escribir ${etiqueta}:`) }));
  const campo = panel.getByRole("textbox", { name: `Escribir ${etiqueta}` });
  fireEvent.change(campo, { target: { value: valor } });
  fireEvent.keyDown(campo, { key: "Enter" });
}

/** Lo guardado, sin ids ni fechas: estado y, por instancia, tipo y nota. */
const guardado = (progreso: ProgresoMateria[]) =>
  progreso.map((p) => [p.materiaId, p.estado, p.instancias.map((i) => [i.tipo, i.nota])]);

/** El valor como lo daba el `<select>`: "" sin nota, "7.5" con punto. */
function valorDe(panel: ReturnType<typeof within>, etiqueta: string): string {
  if (SEGMENTADOS.has(etiqueta)) {
    const grupo = panel.getByRole("radiogroup", { name: etiqueta });
    const marcado = within(grupo).getByRole("radio", { checked: true }).textContent ?? "";
    if (etiqueta === "Estado") {
      return Object.keys(ESTADOS).find((k) => ESTADOS[k] === marcado) ?? marcado;
    }
    return marcado;
  }
  const slider = panel.getByRole("slider", { name: etiqueta });
  return slider.getAttribute("aria-valuetext") === "Sin nota"
    ? ""
    : (slider.getAttribute("aria-valuenow") ?? "");
}

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

describe("correlativas e instancias", () => {
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

    // El historial del fixture llega como instancias: la cursada, con su nota.
    expect(panel.getByRole("slider", { name: "Cursada" }).getAttribute("aria-valuetext")).toBe(
      "10",
    );
  });

  it("las instancias van ordenadas por fecha, de la más vieja a la más nueva", async () => {
    const { panel } = await abrirPanel(
      conInscripcion({
        progreso: [
          fila(CALCULO.id, {
            estado: "aprobada",
            instancias: [inst("final", "2025-01-01", 3), inst("final", "2024-01-01", 2)],
          }),
        ],
      }),
      CALCULO.nombre,
    );
    const nombres = panel.getAllByRole("slider").map(nombreDelSlider);
    expect(nombres).toEqual(["Final 1", "Final 2"]);
    expect(panel.getByRole("slider", { name: "Final 1" }).getAttribute("aria-valuetext")).toBe("2");
  });
});

describe("instancias de evaluación", () => {
  const conInstancias = (
    estado: ProgresoMateria["estado"],
    ...instancias: ProgresoMateria["instancias"]
  ) => conInscripcion({ progreso: [fila(CALCULO.id, { estado, instancias })] });
  const resumen = (panel: ReturnType<typeof within>) =>
    [
      ...(panel.getByText("Nota de la materia").closest(".resumen-i")?.querySelectorAll("b") ?? []),
    ].map((b) => b.textContent);

  it("la materia arranca sin instancias", async () => {
    const { panel } = await abrirPanel(conInscripcion(), CALCULO.nombre);
    expect(panel.getByText("Todavía no cargaste ninguna instancia.")).toBeTruthy();
    expect(panel.queryByRole("slider")).toBeNull();
  });

  it("el slider usa la escala y el paso del plan, con flechas de a un paso y Shift de a 1", async () => {
    const { panel } = await abrirPanel(
      conInstancias("cursando", inst("parcial", "2025-04-01", null)),
      CALCULO.nombre,
    );
    const slider = panel.getByRole("slider", { name: "Parcial" });
    expect(slider.getAttribute("aria-valuemin")).toBe("1");
    expect(slider.getAttribute("aria-valuemax")).toBe("10");
    expect(slider.getAttribute("aria-valuetext")).toBe("Sin nota");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider.getAttribute("aria-valuetext")).toBe("4");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider.getAttribute("aria-valuetext")).toBe("4,1");
    fireEvent.keyDown(slider, { key: "ArrowRight", shiftKey: true });
    expect(slider.getAttribute("aria-valuetext")).toBe("5,1");
    fireEvent.click(panel.getByRole("button", { name: "Bajar Parcial" }));
    expect(slider.getAttribute("aria-valuetext")).toBe("5");
    fireEvent.click(panel.getByRole("button", { name: "Parcial: sin nota" }));
    expect(slider.getAttribute("aria-valuetext")).toBe("Sin nota");
  });

  it("Agregar instancia ofrece los cinco tipos, con la fecha de hoy y los topes", async () => {
    const { panel } = await abrirPanel(conInscripcion(), CALCULO.nombre);
    fireEvent.click(panel.getByRole("button", { name: "Agregar instancia" }));
    const items = panel.getAllByRole("menuitem");
    expect(items.map((i) => i.querySelector("b")?.textContent)).toEqual([
      "Parcial",
      "Recuperatorio",
      "Cursada",
      "Final",
      "Promoción",
    ]);
    const recuperatorio = panel.getByRole<HTMLButtonElement>("menuitem", {
      name: /^Recuperatorio/,
    });
    expect(recuperatorio.disabled).toBe(true);
    expect(recuperatorio.textContent).toContain("más recuperatorios que parciales");
    fireEvent.keyDown(recuperatorio, { key: "Escape" });
    expect(panel.queryByRole("menu")).toBeNull();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    agregarInstancia(panel, "Parcial");
    expect(panel.getByLabelText<HTMLInputElement>("Fecha de Parcial").value).toBe(fechaDeHoy());
    agregarInstancia(panel, "Recuperatorio");
    agregarInstancia(panel, "Promoción");
    fireEvent.click(panel.getByRole("button", { name: "Agregar instancia" }));
    expect(panel.getByRole<HTMLButtonElement>("menuitem", { name: /^Promoción/ }).disabled).toBe(
      true,
    );
    expect(
      panel.getByRole<HTMLButtonElement>("menuitem", { name: /^Recuperatorio/ }).disabled,
    ).toBe(true);
  });

  it("numera las del mismo tipo por fecha, también finales y cursadas", async () => {
    const { panel } = await abrirPanel(conInscripcion(), CALCULO.nombre);
    agregarInstancia(panel, "Final");
    expect(panel.getAllByRole("slider").map(nombreDelSlider)).toEqual(["Final"]);
    agregarInstancia(panel, "Final");
    agregarInstancia(panel, "Cursada");
    expect(panel.getAllByRole("slider").map(nombreDelSlider)).toEqual([
      "Final 1",
      "Final 2",
      "Cursada",
    ]);
    // Cambiar la fecha reordena y renumera.
    fireEvent.change(panel.getByLabelText("Fecha de Cursada"), { target: { value: "2020-01-01" } });
    expect(panel.getAllByRole("slider").map(nombreDelSlider)).toEqual([
      "Cursada",
      "Final 1",
      "Final 2",
    ]);
  });

  it("quitar saca la instancia, salvo un parcial que dejaría más recuperatorios", async () => {
    const { panel } = await abrirPanel(
      conInstancias(
        "cursando",
        inst("parcial", "2025-04-01", 3),
        inst("recuperatorio", "2025-05-01", 6),
        inst("final", "2025-07-01", null),
      ),
      CALCULO.nombre,
    );
    const quitarParcial = panel.getByRole<HTMLButtonElement>("button", { name: "Quitar Parcial" });
    expect(quitarParcial.disabled).toBe(true);
    expect(quitarParcial.title).toBe("Primero quitá un recuperatorio");
    fireEvent.click(panel.getByRole("button", { name: "Quitar Final" }));
    expect(panel.queryByRole("slider", { name: "Final" })).toBeNull();
    fireEvent.click(panel.getByRole("button", { name: "Quitar Recuperatorio" }));
    expect(panel.getByRole<HTMLButtonElement>("button", { name: "Quitar Parcial" }).disabled).toBe(
      false,
    );
  });

  it("los botones de arriba agrupan: parciales con recuperatorios y finales con promoción", async () => {
    const { panel } = await abrirPanel(
      conInstancias(
        "aprobada",
        inst("parcial", "2025-04-01", 7),
        inst("recuperatorio", "2025-05-01", 6),
        inst("cursada", "2025-06-01", 8),
        inst("promocion", "2025-07-01", 9),
      ),
      CALCULO.nombre,
    );
    const ver = (grupo: string) => {
      fireEvent.click(panel.getByRole("radio", { name: grupo }));
      return panel.getAllByRole("slider").map(nombreDelSlider);
    };
    expect(ver("Parciales")).toEqual(["Parcial", "Recuperatorio"]);
    expect(ver("Cursadas")).toEqual(["Cursada"]);
    expect(ver("Finales")).toEqual(["Promoción"]);
    expect(ver("Todas")).toHaveLength(4);
  });

  it("lo que se calcula cambia en vivo y cada final dice qué es", async () => {
    const { panel } = await abrirPanel(
      conInstancias(
        "aprobada",
        inst("final", "2023-12-12", 2),
        inst("final", "2024-01-10", null),
        inst("final", "2024-02-12", 6),
      ),
      CALCULO.nombre,
    );
    expect(resumen(panel)).toEqual(["6", "2", "1", "–"]);
    const final = (n: number) =>
      panel
        .getByRole("slider", { name: `Final ${n}` })
        .closest(".nt")
        ?.querySelector(".chip-d")?.textContent;
    expect([final(1), final(2), final(3)]).toEqual(["Aplazo", "Ausente", "Aprobado"]);
    fireEvent.keyDown(panel.getByRole("slider", { name: "Final 3" }), { key: "ArrowRight" });
    expect(resumen(panel)[0]).toBe("6,1");
    elegir(panel, "Estado", "final");
    expect(resumen(panel)).toEqual(["–", "2, 6,1", "1", "–"]);
  });

  it("sin nota y con fecha futura es Programada, no ausente", async () => {
    const { panel } = await abrirPanel(
      conInstancias("final", inst("final", "2999-12-01", null)),
      CALCULO.nombre,
    );
    const chip = panel
      .getByRole("slider", { name: "Final" })
      .closest(".nt")
      ?.querySelector(".chip-d");
    expect(chip?.textContent).toBe("Programada");
    expect(resumen(panel)[2]).toBe("0");
  });

  it("en Falta final, un final que aprueba sugiere Aprobada y decide el alumno", async () => {
    const { panel } = await abrirPanel(conInstancias("final"), CALCULO.nombre);
    elegir(panel, "Final", "7");
    expect(valorDe(panel, "Estado")).toBe("final");
    fireEvent.click(panel.getByRole("button", { name: "Pasar a Aprobada" }));
    expect(valorDe(panel, "Estado")).toBe("aprobada");
    expect(resumen(panel)[0]).toBe("7");
  });

  it("aprobada con un final menor a la aprobación lo toma igual, con un aviso", async () => {
    const { panel } = await abrirPanel(
      conInstancias("aprobada", inst("final", "2025-07-01", 3)),
      CALCULO.nombre,
    );
    expect(resumen(panel)[0]).toBe("3");
    expect(panel.getByText(/es menor a 4/)).toBeTruthy();
  });

  it("escribir la nota acepta coma, redondea al paso y rechaza lo que está fuera de escala", async () => {
    const { panel } = await abrirPanel(
      conInstancias("cursando", inst("parcial", "2025-04-01", null)),
      CALCULO.nombre,
    );
    escribirNota(panel, "Parcial", "8,57");
    expect(valorDe(panel, "Parcial")).toBe("8.6");
    fireEvent.click(panel.getByRole("button", { name: /^Escribir Parcial:/ }));
    const campo = panel.getByRole("textbox", { name: "Escribir Parcial" });
    fireEvent.change(campo, { target: { value: "11" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(panel.getByRole("alert").textContent).toContain("entre 1 y 10");
    fireEvent.keyDown(campo, { key: "Escape" });
    expect(valorDe(panel, "Parcial")).toBe("8.6");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("una nota fuera del paso se conserva hasta que se la mueve", async () => {
    const { panel } = await abrirPanel(
      conInstancias("cursando", inst("parcial", "2025-04-01", 7.25)),
      CALCULO.nombre,
    );
    expect(valorDe(panel, "Parcial")).toBe("7.25");
    fireEvent.keyDown(panel.getByRole("slider", { name: "Parcial" }), { key: "ArrowRight" });
    expect(valorDe(panel, "Parcial")).toBe("7.3");
  });

  it("abrir y guardar sin tocar nada no la cambia ni escribe", async () => {
    const existente = fila(CALCULO.id, {
      estado: "final",
      instancias: [inst("parcial", "2025-04-01", 7.25), inst("final", "2025-07-01", 2.5)],
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

  it("cambiar una instancia conserva las demás intactas, decimales incluidos", async () => {
    const repositorio = conInstancias(
      "cursando",
      inst("parcial", "2025-04-01", 7.25),
      inst("parcial", "2025-05-01", null),
    );
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre);
    escribirNota(panel, "Parcial 2", "8");
    guardar(panel);
    await cerrado();
    expect(guardado(repositorio.base.progreso)).toEqual([
      [
        CALCULO.id,
        "cursando",
        [
          ["parcial", 7.25],
          ["parcial", 8],
        ],
      ],
    ]);
  });
});

describe("guardar", () => {
  it("al aprobar festeja a pantalla completa, con la nota, y se cierra al tocar", async () => {
    const confeti = vi.spyOn(efectos, "lanzarConfeti");
    const repositorio = conInscripcion();
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre);

    elegir(panel, "Nota final", "9");
    elegir(panel, "Estado", "aprobada");
    guardar(panel);

    await cerrado();
    const festejo = await screen.findByText("¡Felicitaciones!");
    expect(confeti).toHaveBeenCalledOnce();
    expect(screen.getByText(CALCULO.nombre, { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("9", { selector: ".fn b" })).toBeTruthy();
    fireEvent.click(festejo);
    await waitFor(() => expect(screen.queryByText("¡Felicitaciones!")).toBeNull());
    expect(guardado(repositorio.base.progreso)).toEqual([[CALCULO.id, "aprobada", [["final", 9]]]]);
  });

  it("si ya estaba aprobada no vuelve a festejar", async () => {
    const confeti = vi.spyOn(efectos, "lanzarConfeti");
    const repositorio = conInscripcion({
      progreso: [filaConNotas(CALCULO.id, "aprobada", 8)],
    });
    const { panel } = await abrirPanel(repositorio, /^Cálculo Elemental/);
    escribirNota(panel, "Final", "9");
    guardar(panel);
    await cerrado();
    expect(confeti).not.toHaveBeenCalled();
    expect(screen.getByText("Guardado")).toBeTruthy();
  });

  it("si falla se queda abierto, con lo que cargó, y Reintentar guarda", async () => {
    const repositorio = conInscripcion();
    repositorio.guardarProgreso.mockRejectedValueOnce(new Error("se cortó"));
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre);

    elegir(panel, "Parcial", "7");
    guardar(panel);

    expect((await panel.findByRole("alert")).textContent).toContain("No se pudo guardar. se cortó");
    expect(valorDe(panel, "Parcial")).toBe("7");

    fireEvent.click(panel.getByRole("button", { name: "Reintentar" }));
    await cerrado();
    expect(guardado(repositorio.base.progreso)).toEqual([
      [CALCULO.id, "pendiente", [["parcial", 7]]],
    ]);
  });

  it("un guardado colgado pasa a No se pudo guardar, y Reintentar es idempotente", async () => {
    const repositorio = conInscripcion();
    repositorio.guardarProgreso.mockImplementationOnce(() => new Promise(() => {}));
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre, { tiempoGuardadoMs: 20 });

    elegir(panel, "Parcial", "7");
    guardar(panel);
    expect(panel.getByRole("button", { name: "Guardando…" })).toBeTruthy();

    expect((await panel.findByRole("alert")).textContent).toContain("No se pudo guardar");
    const reintentar = panel.getByRole("button", { name: "Reintentar" });
    expect(screen.getAllByText("No se pudo guardar").length).toBeGreaterThan(0);

    fireEvent.click(reintentar);
    await cerrado();
    expect(guardado(repositorio.base.progreso)).toEqual([
      [CALCULO.id, "pendiente", [["parcial", 7]]],
    ]);
    expect(repositorio.guardarProgreso).toHaveBeenCalledTimes(2);
  });

  it("una respuesta tardía no pisa lo que se guardó después ni marca Guardado", async () => {
    const repositorio = conInscripcion();
    let responderTarde = () => {};
    repositorio.guardarProgreso.mockImplementationOnce(
      () => new Promise<void>((r) => (responderTarde = r)),
    );
    const { panel } = await abrirPanel(repositorio, CALCULO.nombre, { tiempoGuardadoMs: 20 });

    elegir(panel, "Parcial", "7");
    guardar(panel);
    await panel.findByRole("alert");

    await act(async () => {
      responderTarde();
      await new Promise((r) => setTimeout(r));
    });
    // Sigue el aviso: la respuesta llegó tarde y no se da por guardado.
    expect(panel.getByRole("alert").textContent).toContain("No se pudo guardar");
    expect(screen.queryByText("Guardado en la nube")).toBeNull();

    elegir(panel, "Parcial", "9");
    fireEvent.click(panel.getByRole("button", { name: "Reintentar" }));
    await cerrado();
    expect(guardado(repositorio.base.progreso)).toEqual([
      [CALCULO.id, "pendiente", [["parcial", 9]]],
    ]);
  });

  it("con una fila fallida, recargar avisa aunque se haya cerrado el panel", async () => {
    const repositorio = conInscripcion();
    repositorio.guardarProgreso.mockRejectedValueOnce(new Error("se cortó"));
    const { panel, dialogo } = await abrirPanel(repositorio, CALCULO.nombre);
    elegir(panel, "Parcial", "7");
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

    elegir(panel, "Nota final", "7");
    fireEvent.change(panel.getByLabelText("Nombre"), { target: { value: "Otro nombre" } });
    guardar(panel);

    await cerrado();
    expect(repositorio.actualizarMateriaPropia).toHaveBeenCalledOnce();
    expect(guardado(repositorio.base.progreso)).toEqual([["propia", "pendiente", [["final", 7]]]]);
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

    elegir(panel, "Nota de cursada", "7");
    fireEvent.change(panel.getByLabelText("Nombre"), { target: { value: "Optativa nueva" } });
    const cursar = within(panel.getByRole("group", { name: /Para cursar/ }));
    fireEvent.click(cursar.getByRole("checkbox", { name: new RegExp(`^${TERCERA.nombre}`) }));
    guardar(panel);

    const alerta = await panel.findByRole("alert");
    expect(alerta.textContent).toContain("Guardé lo demás, pero no las correlativas");
    expect(repositorio.guardarProgreso).toHaveBeenCalledOnce();
    expect(
      repositorio.guardarProgreso.mock.calls[0]?.[0].instancias.map((i) => [i.tipo, i.nota]),
    ).toEqual([["cursada", 7]]);
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
