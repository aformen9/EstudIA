import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { VISTAS, type Vista } from "./navegacion/rutas";
import { clienteConFetchFalso, ID_ALUMNO, sesionFalsa } from "./pruebas/clienteFalso";

const URL_LOCAL = "http://127.0.0.1:54321";

type Avisar = (evento: AuthChangeEvent, sesion: Session | null) => void;

/** Cliente cuya sesión maneja el test: `avisar` hace lo que Supabase al cambiar la sesión. */
const ID_PLAN = "00000000-0000-4000-8000-000000000002";

const FILAS: Record<string, unknown> = {
  perfiles: { id: ID_ALUMNO, nombre: "Ana Pérez", avatar_url: null, es_admin: false },
  inscripciones: [{ id: "i", plan_id: ID_PLAN, activa: true }],
  planes: {
    id: ID_PLAN,
    carrera_id: "c",
    version: "7023",
    estado: "publicado",
    nota_min: 1,
    nota_max: 10,
    nota_aprobacion: 4,
    cuatrimestres_por_anio: 2,
    cierre_cuatrimestres: [],
    carreras: { sigla: "LCD", universidades: { sigla: "UCA" } },
  },
};

function conexionFalsa(sesionInicial: Session | null) {
  const { cliente, pedidos } = clienteConFetchFalso(({ url }) => ({
    cuerpo: FILAS[url.pathname.split("/").at(-1) ?? ""] ?? [],
  }));
  let avisar: Avisar = () => {};
  vi.spyOn(cliente.auth, "onAuthStateChange").mockImplementation((callback) => {
    avisar = (evento, sesion) => void callback(evento, sesion);
    avisar("INITIAL_SESSION", sesionInicial);
    return {
      data: { subscription: { id: "s", callback, unsubscribe: () => {} } },
    } as ReturnType<SupabaseClient["auth"]["onAuthStateChange"]>;
  });
  return {
    conexion: { cliente, url: URL_LOCAL },
    pedidos,
    avisar: (...a: Parameters<Avisar>) => avisar(...a),
  };
}

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
  window.scrollTo = () => {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("sin variables de entorno avisa en vez de romperse", () => {
    render(<App conexion={null} />);
    expect(screen.getByRole("heading", { name: "Falta conectar Supabase" })).toBeTruthy();
  });

  it("sin sesión muestra el login, y con Google vuelve a la misma página", async () => {
    const { conexion } = conexionFalsa(null);
    const oauth = vi
      .spyOn(conexion.cliente.auth, "signInWithOAuth")
      .mockResolvedValue({ data: { provider: "google", url: "u" }, error: null });
    render(<App conexion={conexion} />);

    expect(screen.getByRole("heading", { name: "EstudIA" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Entrar con Google" }));

    expect(oauth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    // En desarrollo y con URL local aparece también el login de prueba.
    expect(await screen.findByRole("button", { name: /usuario de prueba/ })).toBeTruthy();
  });

  it("muestra el error si no se puede abrir Google", async () => {
    const { conexion } = conexionFalsa(null);
    vi.spyOn(conexion.cliente.auth, "signInWithOAuth").mockResolvedValue({
      data: { provider: "google", url: null },
      error: { message: "falló" } as never,
    });
    render(<App conexion={conexion} />);
    fireEvent.click(screen.getByRole("button", { name: "Entrar con Google" }));
    expect((await screen.findByRole("alert")).textContent).toContain("falló");
  });

  it("con sesión muestra el cascarón con el nombre del perfil", async () => {
    const { conexion } = conexionFalsa(sesionFalsa());
    render(<App conexion={conexion} />);
    expect(await screen.findByText("Ana Pérez")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Inicio" })).toBeTruthy();
    expect(document.title).toBe("Inicio · EstudIA");
  });

  it.each(
    (Object.entries(VISTAS) as [Vista, string][]).filter(([vista]) => vista !== "onboarding"),
  )("la ruta #%s muestra su vista", async (vista, titulo) => {
    window.location.hash = vista;
    const { conexion } = conexionFalsa(sesionFalsa());
    render(<App conexion={conexion} />);
    expect(await screen.findByRole("heading", { name: titulo })).toBeTruthy();
  });

  it("con inscripción activa, #onboarding cae en Inicio", async () => {
    window.location.hash = "onboarding";
    const { conexion } = conexionFalsa(sesionFalsa());
    render(<App conexion={conexion} />);
    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe("#inicio"));
  });

  it("navega al cambiar el hash, marca el enlace activo y pasa el foco al contenido", async () => {
    const { conexion } = conexionFalsa(sesionFalsa());
    render(<App conexion={conexion} />);
    await screen.findByRole("heading", { name: "Inicio" });

    await act(async () => {
      window.location.hash = "promedio";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(screen.getByRole("heading", { name: "Promedio" })).toBeTruthy();
    const enlace = screen.getByRole("link", { name: /^Promedio/ });
    expect(enlace.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Inicio" }).getAttribute("aria-current")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("alterna el tema y lo recuerda", async () => {
    const { conexion } = conexionFalsa(sesionFalsa());
    render(<App conexion={conexion} />);
    fireEvent.click(await screen.findByRole("button", { name: "Modo oscuro" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("estudia.theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Modo claro" })).toBeTruthy();
  });

  it("cierra la sesión desde el menú y vuelve al login sin los datos de la cuenta", async () => {
    const { conexion, avisar, pedidos } = conexionFalsa(sesionFalsa());
    const salir = vi.spyOn(conexion.cliente.auth, "signOut").mockResolvedValue({ error: null });
    render(<App conexion={conexion} />);
    await screen.findByText("Ana Pérez");

    fireEvent.click(screen.getByRole("button", { name: "Respaldo y ajustes" }));
    fireEvent.click(screen.getByRole("button", { name: /Cerrar sesión/ }));
    const dialogo = within(await screen.findByRole("dialog", { name: "Cerrar sesión" }));
    expect(salir).not.toHaveBeenCalled();
    fireEvent.click(dialogo.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(salir).toHaveBeenCalledOnce());
    expect(salir).toHaveBeenCalledWith({ scope: "local" });

    act(() => avisar("SIGNED_OUT", null));
    expect(await screen.findByRole("button", { name: "Entrar con Google" })).toBeTruthy();

    // La cuenta siguiente vuelve a pedir su perfil: no reutiliza lo cacheado.
    const pedidosAntes = pedidos.length;
    act(() => avisar("SIGNED_IN", sesionFalsa()));
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(pedidosAntes));
  });

  it("abre el menú en el celular y lo cierra con Escape", async () => {
    const { conexion } = conexionFalsa(sesionFalsa());
    const { container } = render(<App conexion={conexion} />);
    const abrir = await screen.findByRole("button", { name: "Abrir el menú" });

    fireEvent.click(abrir);
    expect(container.querySelector(".shell")?.classList.contains("open")).toBe(true);
    expect(abrir.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector(".shell")?.classList.contains("open")).toBe(false);
    expect(document.activeElement).toBe(abrir);
  });
});
