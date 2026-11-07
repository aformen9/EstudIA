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

/** Para que un nombre de materia sirva dentro de una expresión regular. */
const literal = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const opcion = (nombre: string) => ({ name: new RegExp(`^${literal(nombre)}`) });

async function abrirAgregar(materiales: Material[], nombre: RegExp = AGREGAR) {
  const repositorio = conMateriales(materiales);
  const { main } = await abrirVista("materiales", <Shell />, repositorio);
  const disparador = await main.findByRole("button", { name: nombre });
  act(() => disparador.focus());
  fireEvent.click(disparador);
  const dialogo = within(await screen.findByRole("dialog", { name: "Agregar a otra materia" }));
  return { repositorio, main, dialogo, disparador };
}

const nombres = (dialogo: ReturnType<typeof within>) =>
  dialogo.getAllByRole("option").map((o: HTMLElement) => o.textContent ?? "");

const AGREGAR = /^Agregar a otra materia: /;

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  window.scrollTo = () => {};
});

describe("etiquetas de materia", () => {
  it("quitar de una materia la borra de esa sola, con Deshacer", async () => {
    const repositorio = conMateriales([archivo("a.pdf"), archivo("b", { materiaId: B.id })]);
    const { main } = await abrirVista("materiales", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: `Quitar de ${B.nombre}` }));
    expect(await screen.findByText(new RegExp(`Lo quitaste de ${literal(B.nombre)}`))).toBeTruthy();
    expect(main.queryByRole("button", { name: `Quitar de ${B.nombre}` })).toBeNull();
    expect(main.getByRole("button", { name: `Quitar de ${A.nombre}` })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Deshacer/ }));
    expect(await main.findByRole("button", { name: `Quitar de ${B.nombre}` })).toBeTruthy();
    expect(repositorio.borrarMaterial).not.toHaveBeenCalled();
  });

  it("quitar la última materia lo deja sin materia, sin borrarlo", async () => {
    const repositorio = conMateriales([nota("n")]);
    const { main } = await abrirVista("materiales", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: `Quitar de ${A.nombre}` }));
    await waitFor(() =>
      expect(repositorio.moverMaterial).toHaveBeenCalledExactlyOnceWith("n", null),
    );
    expect(await main.findByText("Sin materia")).toBeTruthy();
    expect(repositorio.borrarMaterial).not.toHaveBeenCalled();
  });
});

describe("agregar a otra materia", () => {
  it("un archivo: otra referencia al mismo documento, sin tocar la copia local", async () => {
    const { repositorio, dialogo } = await abrirAgregar([archivo("a.pdf")]);
    expect(dialogo.getByText(/no se duplica/)).toBeTruthy();
    fireEvent.click(dialogo.getByRole("option", opcion(B.nombre)));

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
    const { repositorio, dialogo } = await abrirAgregar([nota("n", { visibilidad: "compartido" })]);
    expect(dialogo.getByText(/copia privada/)).toBeTruthy();
    fireEvent.click(dialogo.getByRole("option", opcion(B.nombre)));
    await waitFor(() => expect(repositorio.base.materiales).toHaveLength(2));
    expect(repositorio.base.materiales[1]).toMatchObject({
      tipo: "nota",
      materiaId: B.id,
      visibilidad: "privado",
      texto: "x",
    });
  });

  it("no ofrece Sin materia ni las materias donde ya está, y busca sin tildes", async () => {
    const { dialogo } = await abrirAgregar([
      archivo("a.pdf"),
      archivo("b.pdf", { materiaId: B.id }),
    ]);
    const lista = nombres(dialogo);
    expect(lista).toHaveLength(PLAN.materias.length - 2);
    expect(lista.some((n: string) => n.startsWith("Sin materia"))).toBe(false);
    expect(lista.some((n: string) => n.startsWith(A.nombre))).toBe(false);
    expect(lista.some((n: string) => n.startsWith(B.nombre))).toBe(false);
    fireEvent.change(dialogo.getByRole("combobox"), { target: { value: "zzz-no-existe" } });
    expect(dialogo.getByText(/Ninguna materia con/)).toBeTruthy();
  });

  it("Escape cierra sin agregar y el foco vuelve al botón", async () => {
    const { repositorio, dialogo, disparador } = await abrirAgregar([nota("n")]);
    fireEvent.keyDown(dialogo.getByRole("combobox"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(disparador);
    expect(repositorio.agregarMaterial).not.toHaveBeenCalled();
  });

  it("un material oculto no ofrece Agregar", async () => {
    const repositorio = conMateriales([nota("n", { oculto: true })]);
    const { main } = await abrirVista("materiales", <Shell />, repositorio);
    await main.findByText("n");
    expect(main.queryByRole("button", { name: AGREGAR })).toBeNull();
  });

  it("si falla lo dice; reintentar usa el mismo id y no duplica", async () => {
    const { repositorio, dialogo } = await abrirAgregar([nota("n")]);
    const original = repositorio.agregarMaterial.getMockImplementation();
    repositorio.agregarMaterial.mockImplementationOnce(async (nuevo) => {
      await original?.(nuevo);
      throw new TiempoDeGuardadoAgotado();
    });
    fireEvent.click(dialogo.getByRole("option", opcion(B.nombre)));
    await dialogo.findByRole("alert");
    fireEvent.click(dialogo.getByRole("option", opcion(B.nombre)));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const [primero, segundo] = repositorio.agregarMaterial.mock.calls;
    expect(segundo?.[0].id).toBe(primero?.[0].id);
    expect(repositorio.base.materiales).toHaveLength(2);
  });
});

describe("en el panel de materia", () => {
  it("agregar a otra materia no cierra el panel y lo cuenta", async () => {
    const repositorio = conMateriales([nota("n")]);
    const { main } = await abrirVista("materias", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: new RegExp(`^${literal(A.nombre)}`) }));
    const panel = await screen.findByRole("dialog");
    const disparador = await within(panel).findByRole("button", { name: AGREGAR });
    act(() => disparador.focus());
    fireEvent.click(disparador);

    const selector = await screen.findByRole("dialog", { name: "Agregar a otra materia" });
    fireEvent.click(within(selector).getByRole("option", opcion(B.nombre)));

    expect(await within(panel).findByText(/ahora también está en/)).toBeTruthy();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(document.activeElement).toBe(disparador);
  });
});
