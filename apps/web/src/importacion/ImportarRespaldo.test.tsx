import { crearRespaldo, type DatosAlumno, type Material, type Materia } from "@estudia/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConPlan } from "../plan/planActivo";
import {
  elegirArchivo,
  fila,
  hashEs,
  ID_PLAN,
  INSCRIPCION,
  leerFixtureLegacy,
  materialDesde,
  PLAN,
  renderConRepositorio,
  repositorioFalso,
  type RepositorioFalso,
} from "../pruebas/entornoVistas";
import { ImportarRespaldo } from "./ImportarRespaldo";

function montar(repositorio: RepositorioFalso, alCancelar = () => {}) {
  return renderConRepositorio(
    <ConPlan>{(datos) => <ImportarRespaldo datos={datos} alCancelar={alCancelar} />}</ConPlan>,
    repositorio,
  );
}

async function abrirSelector(repositorio: RepositorioFalso) {
  const montado = montar(repositorio);
  await screen.findByLabelText("Elegir archivo");
  return montado;
}

function dato(nombre: string): string | null | undefined {
  const dt = screen.getByText(nombre, { selector: "dt" });
  return dt.parentElement?.querySelector("dd")?.textContent;
}

function respaldoNuevo(materiales: Material[]): string {
  const [materia] = PLAN.materias as [Materia];
  const datos: DatosAlumno = {
    ...PLAN,
    progreso: [fila(materia.id, { estado: "aprobada", nota: 9 })],
    historial: [],
  };
  const creado = crearRespaldo(datos, materiales, "2026-11-04T00:00:00Z");
  return JSON.stringify(creado.respaldo);
}

const LINK = (titulo: string, id = titulo) =>
  materialDesde({ tipo: "link", materiaId: null, titulo, url: `https://e.test/${titulo}` }, id);

beforeEach(() => {
  window.location.hash = "onboarding";
  window.scrollTo = () => {};
});

describe("errores de core", () => {
  it.each([
    ["no es JSON", "{roto", "El archivo no es un JSON válido."],
    [
      "formato desconocido",
      JSON.stringify({ hola: 1 }),
      "El archivo no parece un respaldo de EstudIA ni de Mi Plan de Estudio.",
    ],
  ])("%s: muestra el mensaje tal cual", async (_caso, contenido, mensaje) => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    await abrirSelector(repositorio);

    elegirArchivo(contenido);

    expect((await screen.findByRole("alert")).textContent).toBe(mensaje);
    expect(repositorio.reemplazarDatosDelPlan).not.toHaveBeenCalled();
  });

  it("legacy sin códigos en común: bloquea con el mensaje de core", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    await abrirSelector(repositorio);

    elegirArchivo(
      JSON.stringify({ materias: [{ id: "NADA1", codigo: "NADA1", nombre: "Otra", anio: 1 }] }),
    );

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toBe(
      "Este respaldo es de otra carrera: ninguna de sus materias está en el plan 7023. Elegí la carrera correcta y probá de nuevo.",
    );
    expect(screen.queryByText("Materias", { selector: "dt" })).toBeNull();
    expect(repositorio.reemplazarDatosDelPlan).not.toHaveBeenCalled();
  });

  it("respaldo nuevo de otro plan: muestra el rechazo de core", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    await abrirSelector(repositorio);
    const otro = JSON.parse(respaldoNuevo([])) as Record<string, unknown>;

    elegirArchivo(
      JSON.stringify({ ...otro, plan: { universidad: "UCA", carrera: "OTRA", version: "1" } }),
    );

    expect((await screen.findByRole("alert")).textContent).toMatch(/^Este respaldo es de .* LCD/);
    expect(repositorio.reemplazarDatosDelPlan).not.toHaveBeenCalled();
  });

  it("después de un error se puede elegir otro archivo", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    await abrirSelector(repositorio);
    elegirArchivo("{roto");
    await screen.findByRole("alert");

    elegirArchivo(leerFixtureLegacy());

    await screen.findByText("Materias", { selector: "dt" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("vista previa", () => {
  it("muestra el resumen, lo calculado con core y los avisos, sin guardar nada", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    await abrirSelector(repositorio);

    elegirArchivo(leerFixtureLegacy(), "mi-plan.json");

    await screen.findByText("Materias", { selector: "dt" });
    expect(screen.getByText("mi-plan.json")).toBeTruthy();
    expect(dato("Materias")).toBe("50");
    expect(dato("Aprobada")).toBe("26");
    expect(dato("En curso")).toBe("5");
    expect(dato("Final pendiente")).toBe("2");
    expect(dato("Pendiente")).toBe("17");
    expect(dato("Aprobado")).toBe("52 %");
    expect(dato("Cursado")).toBe("56 %");
    expect(dato("Promedio sin aplazos")).toBe("7,73");
    expect(dato("Promedio con aplazos")).toBe("7,36");
    expect(repositorio.reemplazarDatosDelPlan).not.toHaveBeenCalled();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("los avisos del reporte se muestran con su texto", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    await abrirSelector(repositorio);
    const legacy = JSON.parse(leerFixtureLegacy()) as { materias: Record<string, unknown>[] };
    legacy.materias.push({ id: "PROPIA1", codigo: "PROPIA1", nombre: "Optativa rara", anio: 3 });

    elegirArchivo(JSON.stringify(legacy));

    await screen.findByText("Materias", { selector: "dt" });
    expect(dato("Materias propias")).toBe("1");
    const avisos = document.querySelector("details.avisos") as HTMLElement;
    expect(within(avisos).getByText(/aviso/, { selector: "summary" })).toBeTruthy();
    expect(within(avisos).getAllByRole("listitem", { hidden: true }).length).toBeGreaterThan(0);
    expect(avisos.textContent).toContain("Optativa rara");
  });

  it("al pasar a la vista previa el foco no se pierde", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    await abrirSelector(repositorio);
    elegirArchivo(leerFixtureLegacy());

    await screen.findByText("Materias", { selector: "dt" });
    expect(document.activeElement).toBe(document.querySelector(".importar"));
  });

  it("sin datos existentes se confirma con un botón y sin aviso de reemplazo", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    await abrirSelector(repositorio);
    elegirArchivo(leerFixtureLegacy());

    const guardar = await screen.findByRole("button", { name: "Guardar estos datos" });
    expect(screen.queryByText(/reemplaza lo que ya tenés/)).toBeNull();

    fireEvent.click(guardar);
    await waitFor(() => expect(repositorio.reemplazarDatosDelPlan).toHaveBeenCalledOnce());
  });

  it("Elegir otro archivo vuelve atrás sin guardar", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    await abrirSelector(repositorio);
    elegirArchivo(leerFixtureLegacy());
    fireEvent.click(await screen.findByRole("button", { name: "Elegir otro archivo" }));

    expect(screen.getByLabelText("Elegir archivo")).toBeTruthy();
    expect(repositorio.reemplazarDatosDelPlan).not.toHaveBeenCalled();
  });
});

describe("sobre datos existentes", () => {
  const [materia] = PLAN.materias as [Materia];
  const conDatos = () =>
    repositorioFalso({
      inscripciones: [INSCRIPCION],
      progreso: [fila(materia.id, { estado: "cursando" })],
      historial: [
        {
          materiaId: materia.id,
          fecha: "2025-01-01",
          tipo: "Examen",
          nota: 2,
          resultado: "Reprobado",
          fuente: "manual",
        },
      ],
    });

  it("avisa que reemplaza y no deja guardar hasta confirmar", async () => {
    const repositorio = conDatos();
    await abrirSelector(repositorio);
    elegirArchivo(leerFixtureLegacy());

    const alerta = await screen.findByText(/reemplaza lo que ya tenés/);
    expect(alerta.closest(".alert")?.textContent).toMatch(/1 materia con datos y 1 evento/);
    const boton = screen.getByRole<HTMLButtonElement>("button", { name: "Reemplazar mis datos" });
    expect(boton.disabled).toBe(true);
    fireEvent.click(boton);
    expect(repositorio.reemplazarDatosDelPlan).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: /Entiendo que se reemplazan/ }));
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    await waitFor(() => expect(repositorio.reemplazarDatosDelPlan).toHaveBeenCalledOnce());
  });

  it("cuenta lo que hay en la base ahora, no lo cacheado", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    await abrirSelector(repositorio);
    // Guardado desde otro dispositivo después de cargar la pantalla.
    repositorio.base.progreso = [fila(materia.id, { estado: "aprobada" })];

    elegirArchivo(leerFixtureLegacy());

    expect(await screen.findByText(/reemplaza lo que ya tenés/)).toBeTruthy();
  });

  it("si no puede comprobar los datos actuales, no sigue", async () => {
    const repositorio = conDatos();
    await abrirSelector(repositorio);
    repositorio.obtenerProgreso.mockRejectedValueOnce(new Error("sin red"));

    elegirArchivo(leerFixtureLegacy());

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No pude comprobar tus datos actuales: sin red",
    );
    expect(screen.queryByRole("button", { name: /Reemplazar|Guardar/ })).toBeNull();
  });
});

describe("guardar", () => {
  it("legacy: reemplaza con los datos de core, no toca materiales, invalida y va a Inicio", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const { clienteQuery } = await abrirSelector(repositorio);
    const invalidar = vi.spyOn(clienteQuery, "invalidateQueries");
    elegirArchivo(leerFixtureLegacy());

    fireEvent.click(await screen.findByRole("button", { name: "Guardar estos datos" }));

    await hashEs("#inicio");
    const [planId, datos] = repositorio.reemplazarDatosDelPlan.mock.calls[0] ?? [];
    expect(planId).toBe(ID_PLAN);
    expect(datos?.progreso.length).toBeGreaterThan(0);
    expect(repositorio.listarMateriales).not.toHaveBeenCalled();
    const claves = invalidar.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
    expect(claves).toEqual(
      expect.arrayContaining([
        JSON.stringify(["plan", ID_PLAN]),
        JSON.stringify(["progreso", ID_PLAN]),
        JSON.stringify(["historial", ID_PLAN]),
        JSON.stringify(["materiales"]),
      ]),
    );
  });

  it("si reemplazar falla, dice que no se guardó nada, no restaura materiales y deja reintentar", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.reemplazarDatosDelPlan.mockRejectedValueOnce(new Error("rpc caída"));
    await abrirSelector(repositorio);
    elegirArchivo(respaldoNuevo([LINK("a")]));

    fireEvent.click(await screen.findByRole("button", { name: "Guardar estos datos" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toBe("No se guardó nada. rpc caída");
    expect(repositorio.listarMateriales).not.toHaveBeenCalled();
    expect(repositorio.agregarMaterial).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#onboarding");

    fireEvent.click(screen.getByRole("button", { name: "Guardar estos datos" }));
    await screen.findByRole("button", { name: "Ir a Inicio" });
    expect(repositorio.agregarMaterial).toHaveBeenCalledOnce();
  });

  it("orden: reemplaza y después restaura materiales con las claves que devolvió", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    await abrirSelector(repositorio);
    elegirArchivo(respaldoNuevo([LINK("a")]));

    fireEvent.click(await screen.findByRole("button", { name: "Guardar estos datos" }));
    await screen.findByRole("button", { name: "Ir a Inicio" });

    const orden = (espia: { mock: { invocationCallOrder: number[] } }) =>
      espia.mock.invocationCallOrder[0] as number;
    expect(orden(repositorio.reemplazarDatosDelPlan)).toBeLessThan(
      orden(repositorio.listarMateriales),
    );
    expect(orden(repositorio.listarMateriales)).toBeLessThan(orden(repositorio.agregarMaterial));
  });

  it("muestra agregados, omitidos y fallidos, y reintentar no duplica ni pierde la cuenta", async () => {
    const existente = LINK("ya-estaba", "m0");
    const repositorio = repositorioFalso({
      inscripciones: [INSCRIPCION],
      materiales: [existente],
    });
    repositorio.agregarMaterial.mockImplementationOnce(async (nuevo) => {
      const material = materialDesde(nuevo, "nuevo-1");
      repositorio.base.materiales = [...repositorio.base.materiales, material];
      return material;
    });
    repositorio.agregarMaterial.mockRejectedValueOnce(new Error("falló"));
    await abrirSelector(repositorio);
    elegirArchivo(respaldoNuevo([existente, LINK("bien"), LINK("mal")]));

    fireEvent.click(await screen.findByRole("button", { name: "Guardar estos datos" }));

    await screen.findByText("Agregados", { selector: "dt" });
    expect(dato("Agregados")).toBe("1");
    expect(dato("Omitidos (ya estaban)")).toBe("1");
    expect(dato("Fallaron")).toBe("1");
    expect(within(screen.getByRole("alert")).getByText("mal")).toBeTruthy();
    expect(window.location.hash).toBe("#onboarding");

    fireEvent.click(screen.getByRole("button", { name: "Reintentar los que fallaron" }));

    await waitFor(() => expect(dato("Fallaron")).toBe("0"));
    expect(dato("Agregados")).toBe("2");
    expect(dato("Omitidos (ya estaban)")).toBe("1");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /Reintentar/ })).toBeNull();
    expect(repositorio.base.materiales.map((m) => m.titulo).sort()).toEqual([
      "bien",
      "mal",
      "ya-estaba",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Ir a Inicio" }));
    await hashEs("#inicio");
  });

  it("si un reintento encuentra el material ya guardado, lo cuenta como omitido sin duplicar", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.agregarMaterial.mockImplementationOnce(async (nuevo) => {
      // Se guardó, pero se perdió la respuesta.
      repositorio.base.materiales = [materialDesde(nuevo, "x")];
      throw new Error("timeout");
    });
    await abrirSelector(repositorio);
    elegirArchivo(respaldoNuevo([LINK("a")]));
    fireEvent.click(await screen.findByRole("button", { name: "Guardar estos datos" }));
    await screen.findByRole("button", { name: "Reintentar los que fallaron" });

    fireEvent.click(screen.getByRole("button", { name: "Reintentar los que fallaron" }));

    await waitFor(() => expect(dato("Fallaron")).toBe("0"));
    expect(dato("Omitidos (ya estaban)")).toBe("1");
    expect(repositorio.base.materiales).toHaveLength(1);
  });

  it("si no puede ni leer los materiales: los datos quedan guardados, avisa y reintenta", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.listarMateriales.mockRejectedValueOnce(new Error("sin red"));
    await abrirSelector(repositorio);
    elegirArchivo(respaldoNuevo([LINK("a")]));

    fireEvent.click(await screen.findByRole("button", { name: "Guardar estos datos" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toBe("No pude restaurar tus materiales: sin red");
    expect(screen.getByText(/ya están guardados/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    await waitFor(() => expect(dato("Agregados")).toBe("1"));
  });
});
