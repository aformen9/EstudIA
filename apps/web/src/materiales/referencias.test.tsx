import type { Material } from "@estudia/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TiempoDeGuardadoAgotado } from "../guardado/almacenGuardado";
import { Shell } from "../interfaz/Shell";
import { abrirVista, INSCRIPCION, PLAN, repositorioFalso } from "../pruebas/entornoVistas";

const [A, B] = PLAN.materias;
if (!A || !B) throw new Error("Faltan materias");

const base = {
  materiaId: A.id,
  visibilidad: "privado",
  anonimo: false,
  periodo: "2025-2C",
  oculto: false,
  createdAt: "2026-02-03T00:00:00Z",
} as const;

const nota = (id: string, cambios: Partial<Material> = {}) =>
  ({ ...base, id, titulo: id, tipo: "nota", texto: "x", ...cambios }) as Material;
const archivo = (id: string, cambios: Partial<Material> = {}) =>
  ({
    ...base,
    id,
    titulo: id,
    tipo: "archivo",
    driveFileId: null,
    documento: { id: "doc-1", sha256: "c".repeat(64), mime: null, bytes: 1, paginas: null },
    ...cambios,
  }) as Material;

const conMateriales = (materiales: Material[]) =>
  repositorioFalso({ inscripciones: [INSCRIPCION], materiales });

async function abrirSelector(materiales: Material[], nombre: RegExp) {
  const repositorio = conMateriales(materiales);
  const { main } = await abrirVista("materiales", <Shell />, repositorio);
  const disparador = await main.findByRole("button", { name: nombre });
  act(() => disparador.focus());
  fireEvent.click(disparador);
  const dialogo = await screen.findByRole("dialog");
  const selector = within(dialogo).getByLabelText("Materia") as HTMLSelectElement;
  return { repositorio, main, dialogo, selector, disparador };
}

const opciones = (selector: HTMLSelectElement) => [...selector.options].map((o) => o.textContent);

const MOVER = /^Mover a otra materia: /;
const AGREGAR = /^Agregar también a otra materia: /;

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  window.scrollTo = () => {};
});

describe("mover a otra materia", () => {
  it("ofrece solo materias del plan activo, sin la actual, más Sin materia", async () => {
    const { selector } = await abrirSelector([nota("n")], MOVER);
    const lista = opciones(selector);
    expect(lista).toHaveLength(PLAN.materias.length);
    expect(lista).not.toContain(A.nombre);
    expect(lista).toContain(B.nombre);
    expect(lista.at(-1)).toBe("Sin materia");
  });

  it("mueve, y el foco arranca en el selector", async () => {
    const { repositorio, dialogo, selector } = await abrirSelector([nota("n")], MOVER);
    expect(document.activeElement).toBe(selector);
    fireEvent.change(selector, { target: { value: B.id } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Mover" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(repositorio.moverMaterial).toHaveBeenCalledExactlyOnceWith("n", B.id);
    expect(repositorio.base.materiales[0]?.materiaId).toBe(B.id);
  });

  it("permite dejarlo sin materia, y sin materia no se ofrece otra vez", async () => {
    const { repositorio, dialogo, selector, main } = await abrirSelector([nota("n")], MOVER);
    fireEvent.change(selector, { target: { value: "" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Mover" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(repositorio.base.materiales[0]?.materiaId).toBeNull();

    fireEvent.click(await main.findByRole("button", { name: MOVER }));
    const otra = within(await screen.findByRole("dialog"));
    expect(opciones(otra.getByLabelText("Materia") as HTMLSelectElement)).not.toContain(
      "Sin materia",
    );
  });

  it("avisa que un compartido pasa a privado; un privado no", async () => {
    const compartido = await abrirSelector([nota("n", { visibilidad: "compartido" })], MOVER);
    expect(within(compartido.dialogo).getByRole("note").textContent).toContain("pasa a privado");
    fireEvent.click(within(compartido.dialogo).getByRole("button", { name: "Cancelar" }));
    compartido.main.getByText("n");
  });

  it("un privado no muestra el aviso de compartido", async () => {
    const { dialogo } = await abrirSelector([nota("n")], MOVER);
    expect(within(dialogo).queryByRole("note")).toBeNull();
  });

  it("Escape cierra sin mover y el foco vuelve al botón", async () => {
    const { repositorio, dialogo, disparador } = await abrirSelector([nota("n")], MOVER);
    fireEvent.keyDown(dialogo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(disparador);
    expect(repositorio.moverMaterial).not.toHaveBeenCalled();
  });

  it("si falla lo dice y deja reintentar", async () => {
    const { repositorio, dialogo } = await abrirSelector([nota("n")], MOVER);
    repositorio.moverMaterial.mockRejectedValueOnce(new Error("sin red"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Mover" }));
    expect((await within(dialogo).findByRole("alert")).textContent).toContain("sin red");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Mover" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("en un material oculto se sigue pudiendo mover", async () => {
    const repositorio = conMateriales([nota("n", { oculto: true })]);
    const { main } = await abrirVista("materiales", <Shell />, repositorio);
    expect(await main.findByRole("button", { name: MOVER })).toBeTruthy();
  });
});

describe("agregar también a", () => {
  it("un archivo: otra referencia al mismo documento, sin tocar la copia local", async () => {
    const { repositorio, dialogo, selector } = await abrirSelector([archivo("a.pdf")], AGREGAR);
    expect(within(dialogo).getByText(/no se duplica/)).toBeTruthy();
    fireEvent.change(selector, { target: { value: B.id } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(repositorio.base.materiales).toHaveLength(2));
    expect(repositorio.agregarMaterial.mock.calls[0]?.[0]).toMatchObject({
      tipo: "archivo",
      materiaId: B.id,
      documentoId: "doc-1",
      periodo: "2025-2C",
    });
    expect(repositorio.registrarDocumento).not.toHaveBeenCalled();
    expect(repositorio.base.materiales[0]?.materiaId).toBe(A.id);
  });

  it("una nota: copia privada, aunque el original esté compartido", async () => {
    const { repositorio, dialogo, selector } = await abrirSelector(
      [nota("n", { visibilidad: "compartido" })],
      AGREGAR,
    );
    expect(within(dialogo).getByText(/copia privada/)).toBeTruthy();
    fireEvent.change(selector, { target: { value: B.id } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Agregar" }));
    await waitFor(() => expect(repositorio.base.materiales).toHaveLength(2));
    expect(repositorio.base.materiales[1]).toMatchObject({
      tipo: "nota",
      materiaId: B.id,
      visibilidad: "privado",
      texto: "x",
    });
  });

  it("no ofrece Sin materia ni las materias donde ya está", async () => {
    const { selector } = await abrirSelector(
      [archivo("a.pdf"), archivo("b.pdf", { materiaId: B.id })],
      new RegExp(`${AGREGAR.source}a.pdf`),
    );
    const lista = opciones(selector);
    expect(lista).not.toContain("Sin materia");
    expect(lista).not.toContain(A.nombre);
    expect(lista).not.toContain(B.nombre);
  });

  it("un material oculto no ofrece Agregar también", async () => {
    const repositorio = conMateriales([nota("n", { oculto: true })]);
    const { main } = await abrirVista("materiales", <Shell />, repositorio);
    await main.findByText("n");
    expect(main.queryByRole("button", { name: AGREGAR })).toBeNull();
  });

  it("reintentar después de un timeout usa el mismo id y no duplica", async () => {
    const { repositorio, dialogo, selector } = await abrirSelector([nota("n")], AGREGAR);
    const original = repositorio.agregarMaterial.getMockImplementation();
    repositorio.agregarMaterial.mockImplementationOnce(async (nuevo) => {
      await original?.(nuevo);
      throw new TiempoDeGuardadoAgotado();
    });
    fireEvent.change(selector, { target: { value: B.id } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Agregar" }));
    await within(dialogo).findByRole("alert");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const [primero, segundo] = repositorio.agregarMaterial.mock.calls;
    expect(segundo?.[0].id).toBe(primero?.[0].id);
    expect(repositorio.base.materiales).toHaveLength(2);
  });
});

describe("en el panel de materia", () => {
  it("mover saca el material de la lista, sin cerrar el panel, y lo cuenta", async () => {
    const repositorio = conMateriales([nota("n")]);
    const { main } = await abrirVista("materias", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: new RegExp(`^${A.nombre}`) }));
    const panel = await screen.findByRole("dialog");
    const disparador = await within(panel).findByRole("button", { name: MOVER });
    act(() => disparador.focus());
    fireEvent.click(disparador);

    const selector = await screen.findByRole("dialog", { name: "Mover a otra materia" });
    fireEvent.change(within(selector).getByLabelText("Materia"), { target: { value: B.id } });
    fireEvent.click(within(selector).getByRole("button", { name: "Mover" }));

    await waitFor(() => expect(within(panel).queryByText("n")).toBeNull());
    expect(await within(panel).findByText(/ahora está en/)).toBeTruthy();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(document.activeElement).toBe(panel);
  });
});
