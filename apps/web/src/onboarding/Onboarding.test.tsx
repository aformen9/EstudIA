import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Shell } from "../interfaz/Shell";
import {
  hashEs,
  ID_PLAN,
  INSCRIPCION,
  pasarPasosDelCatalogo,
  renderConRepositorio,
  repositorioFalso,
} from "../pruebas/entornoVistas";

const TITULO = "Elegí tu carrera";

async function irAHash(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  window.scrollTo = () => {};
});

describe("redirección obligatoria", () => {
  it("sin inscripción activa manda al onboarding, sin menú ni Ajustes, y el botón cierra la sesión", async () => {
    window.location.hash = "materias";
    const { signOut } = renderConRepositorio(<Shell />, repositorioFalso());

    expect(await screen.findByRole("heading", { name: TITULO })).toBeTruthy();
    expect(window.location.hash).toBe("#onboarding");
    expect(screen.queryByRole("navigation")).toBeNull();

    expect(screen.queryByRole("button", { name: "Respaldo y ajustes" })).toBeNull();
    expect(screen.getByRole("button", { name: "Modo oscuro" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Ajustes/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" }));
  });

  it.each(["materias", "ajustes", "inicio", "constructor"])(
    "tampoco se sale con el hash a mano: #%s",
    async (hash) => {
      renderConRepositorio(<Shell />, repositorioFalso());
      await screen.findByRole("heading", { name: TITULO });

      await irAHash(hash);

      expect(screen.getByRole("heading", { name: TITULO })).toBeTruthy();
      await hashEs("#onboarding");
    },
  );

  it("mientras carga la inscripción no muestra ninguna vista ni el menú", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    let responder = () => {};
    repositorio.listarInscripciones.mockImplementation(
      () => new Promise((r) => (responder = () => r([INSCRIPCION]))),
    );
    window.location.hash = "promedio";
    renderConRepositorio(<Shell />, repositorio);

    await waitFor(() => expect(repositorio.listarInscripciones).toHaveBeenCalled());
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByText("Cargando tu plan…")).toBeTruthy();
    // Todavía no sabe nada: no toca la URL.
    expect(window.location.hash).toBe("#promedio");

    act(() => responder());
    expect(await screen.findByRole("heading", { name: "Promedio" })).toBeTruthy();
    expect(window.location.hash).toBe("#promedio");
  });

  it("si falla la lectura muestra el error en vez de mandarlo al onboarding, y reintenta", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.listarInscripciones.mockRejectedValueOnce(new Error("sin red"));
    renderConRepositorio(<Shell />, repositorio);

    expect((await screen.findByRole("alert")).textContent).toContain("sin red");
    expect(screen.queryByRole("heading", { name: TITULO })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeTruthy();
  });

  it("con inscripción activa, #onboarding vuelve a Inicio y no atrapa a nadie", async () => {
    window.location.hash = "onboarding";
    renderConRepositorio(<Shell />, repositorioFalso({ inscripciones: [INSCRIPCION] }));

    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeTruthy();
    await hashEs("#inicio");

    await irAHash("materias");
    expect(screen.getByRole("heading", { name: "Materias" })).toBeTruthy();
    expect(window.location.hash).toBe("#materias");
  });

  it("con inscripciones viejas pero ninguna activa, también va al onboarding", async () => {
    renderConRepositorio(
      <Shell />,
      repositorioFalso({ inscripciones: [{ ...INSCRIPCION, activa: false }] }),
    );
    expect(await screen.findByRole("heading", { name: TITULO })).toBeTruthy();
  });
});

describe("pasos del onboarding", () => {
  it("con una sola opción la muestra para confirmarla y no la saltea", async () => {
    const repositorio = repositorioFalso();
    renderConRepositorio(<Shell />, repositorio);

    const uca = await screen.findByRole<HTMLInputElement>("radio", { name: /UCA/ });
    expect(uca.checked).toBe(true);
    expect(screen.getByText(/única opción/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "¿En qué universidad estudiás?" })).toBeTruthy();
    // Espera la confirmación: no pidió las carreras ni activó nada.
    await new Promise((r) => setTimeout(r));
    expect(repositorio.listarCarreras).not.toHaveBeenCalled();
    expect(repositorio.activarPlan).not.toHaveBeenCalled();
  });

  it("con varias opciones hay que elegir una, y pasa el foco al título del paso", async () => {
    const repositorio = repositorioFalso();
    repositorio.listarUniversidades.mockResolvedValue([
      { id: "a", nombre: "Uni A", sigla: "A", sede: null, estado: "publicado" },
      { id: "b", nombre: "Uni B", sigla: "B", sede: null, estado: "publicado" },
    ]);
    renderConRepositorio(<Shell />, repositorio);

    await screen.findByRole("radio", { name: /Uni B/ });
    const seguir = screen.getByRole<HTMLButtonElement>("button", { name: "Seguir" });
    expect(seguir.disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /Uni B/ }));
    fireEvent.click(seguir);

    const titulo = await screen.findByRole("heading", { name: "¿Qué carrera?" });
    expect(repositorio.listarCarreras).toHaveBeenCalledWith("b");
    await screen.findByRole("radio", { name: /Ciencias de Datos/ });
    expect(document.activeElement).toBe(titulo);
  });

  it("recorre universidad → carrera → plan, activa el plan y ofrece los dos caminos", async () => {
    const repositorio = repositorioFalso();
    renderConRepositorio(<Shell />, repositorio);

    await pasarPasosDelCatalogo();

    expect(repositorio.activarPlan).toHaveBeenCalledExactlyOnceWith(ID_PLAN);
    // Ya tiene inscripción activa, pero no lo saca de este paso.
    expect(window.location.hash).toBe("#onboarding");
    expect(screen.getByRole("button", { name: /Grilla rápida/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Importar respaldo/ })).toBeTruthy();
    // El menú sigue oculto mientras dure el onboarding, y el botón sigue diciendo "Cerrar sesión".
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
    // No está atrapado: con el plan activo, cualquier otra vista funciona y vuelve el menú normal.
    await irAHash("materias");
    expect(await screen.findByRole("heading", { name: "Materias" })).toBeTruthy();
    await hashEs("#materias");
    expect(screen.getByRole("navigation")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Respaldo y ajustes" })).toBeTruthy();
  });

  it("Volver conserva lo elegido, y cambiar de universidad olvida la carrera", async () => {
    const repositorio = repositorioFalso();
    repositorio.listarUniversidades.mockResolvedValue([
      { id: "a", nombre: "Uni A", sigla: null, sede: null, estado: "publicado" },
      { id: "b", nombre: "Uni B", sigla: null, sede: null, estado: "publicado" },
    ]);
    renderConRepositorio(<Shell />, repositorio);

    fireEvent.click(await screen.findByRole("radio", { name: /Uni B/ }));
    fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
    await screen.findByRole("radio", { name: /Ciencias de Datos/ });

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByRole<HTMLInputElement>("radio", { name: /Uni B/ }).checked).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /Uni A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
    await waitFor(() => expect(repositorio.listarCarreras).toHaveBeenCalledWith("a"));
  });

  it("si activarPlan falla lo dice y se queda en el paso, sin plan activo", async () => {
    const repositorio = repositorioFalso();
    repositorio.activarPlan.mockRejectedValueOnce(new Error("No se pudo activar el plan: x"));
    renderConRepositorio(<Shell />, repositorio);

    await screen.findByRole("radio", { name: /UCA/ });
    fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
    await screen.findByRole("radio", { name: /Ciencias/ });
    fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
    await screen.findByRole("radio", { name: /Plan 7023/ });
    fireEvent.click(screen.getByRole("button", { name: "Elegir este plan" }));

    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo activar el plan");
    expect(screen.getByRole("heading", { name: "¿Qué plan de estudios?" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Elegir este plan" }));
    await screen.findByRole("heading", { name: "¿Cómo querés cargar tus materias?" });
  });

  it("sin nada en el catálogo avisa, y un error se puede reintentar", async () => {
    const repositorio = repositorioFalso();
    repositorio.listarUniversidades.mockRejectedValueOnce(new Error("falló el catálogo"));
    repositorio.listarUniversidades.mockResolvedValue([]);
    renderConRepositorio(<Shell />, repositorio);

    expect((await screen.findByRole("alert")).textContent).toContain("falló el catálogo");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText(/Todavía no hay universidades/)).toBeTruthy();
  });
});

describe("datos del cascarón", () => {
  it("muestra la carrera y los contadores calculados con core", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const { container } = renderConRepositorio(<Shell />, repositorio);

    await within(container.querySelector(".brand") as HTMLElement).findByText(
      "Ciencias de Datos · Plan 7023",
    );
    const nav = within(container.querySelector("nav") as HTMLElement);
    expect(nav.getByRole("link", { name: /^Materias\s*50$/ })).toBeTruthy();
    expect(nav.getByRole("link", { name: /^Pendientes\s*50$/ })).toBeTruthy();
    expect(nav.getByRole("link", { name: /^Aprobadas\s*0$/ })).toBeTruthy();
    expect(nav.getByRole("link", { name: /^Promedio\s*–$/ })).toBeTruthy();
    await waitFor(() => expect(nav.getByRole("link", { name: /^Materiales\s*0$/ })).toBeTruthy());
  });
});
