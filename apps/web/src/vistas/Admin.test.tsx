import type { MetricasAdmin, Perfil } from "@estudia/core";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../interfaz/Shell";
import { INSCRIPCION, renderConRepositorio, repositorioFalso } from "../pruebas/entornoVistas";

const ADMIN: Perfil = {
  id: "u",
  nombre: "Agu",
  avatarUrl: null,
  esAdmin: true,
  acento: "azul",
  tema: "dark",
};

const METRICAS: MetricasAdmin = {
  alumnos: 12,
  alumnosNuevos7Dias: 3,
  alumnosConInscripcionActiva: 10,
  alumnosConMaterias: 8,
  alumnosActivos7Dias: 5,
  inscripcionesPorPlan: [{ universidad: "UCA", carrera: "LCD", plan: "7023", alumnos: 10 }],
  materiasConProgreso: 240,
  instancias: 400,
  materiasPropias: 4,
  materiales: { archivo: 20, link: 7, nota: 9 },
  documentos: 18,
  reportes: 2,
  reportes7Dias: 1,
  embudo: { registrados: 12, eligieronCarrera: 10, cargaronMaterias: 8, importaronRespaldo: 3 },
};

function comoAdmin() {
  const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
  repositorio.obtenerPerfil.mockResolvedValue(ADMIN);
  repositorio.obtenerMetricasAdmin.mockResolvedValue(METRICAS);
  repositorio.obtenerEstadoServicio.mockResolvedValue({
    monitores: [
      { nombre: "estudia-liard.vercel.app", estado: "arriba", uptime7: 100, uptime30: 99.95 },
      { nombre: "EstudIA Supabase", estado: "caido", uptime7: 97.5, uptime30: null },
    ],
    actualizado: "2026-11-17T20:00:00Z",
  });
  repositorio.listarReportesAdmin.mockResolvedValue([
    {
      id: "r1",
      createdAt: "2026-11-16T15:00:00Z",
      tipo: "problema",
      texto: "No carga Materiales",
      vista: "materiales",
      contacto: "ana@mail.com",
      navegador: "Safari 18",
      sistema: "iOS 18",
      versionApp: "abc1234",
    },
    {
      id: "r2",
      createdAt: "2026-11-15T15:00:00Z",
      tipo: "sugerencia",
      texto: "Modo examen",
      vista: null,
      contacto: null,
      navegador: "Chrome 131",
      sistema: "Android 14",
      versionApp: "abc1234",
    },
  ]);
  return repositorio;
}

beforeEach(() => {
  localStorage.clear();
  window.scrollTo = () => {};
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const tarjeta = async (titulo: string) =>
  within((await screen.findByRole("heading", { name: titulo })).closest("section") as HTMLElement);

describe("#admin", () => {
  it("un alumno no ve el enlace y, si entra por la URL, va a Inicio", async () => {
    window.location.hash = "admin";
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    renderConRepositorio(<Shell />, repositorio);
    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe("#inicio"));
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
    expect(repositorio.obtenerMetricasAdmin).not.toHaveBeenCalled();
    expect(repositorio.obtenerEstadoServicio).not.toHaveBeenCalled();
  });

  it("el admin ve el enlace, los totales y los reportes, con el mail solo si lo dejaron", async () => {
    window.location.hash = "admin";
    renderConRepositorio(<Shell />, comoAdmin());

    expect(await screen.findByRole("heading", { name: "Admin" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Admin" })).toBeTruthy();

    const totales = await screen.findByRole("heading", { name: "Totales" });
    const seccion = within(totales.closest("section") as HTMLElement);
    expect(seccion.getByText("Activos en 7 días").nextElementSibling?.textContent).toBe("5");
    expect(seccion.getByText("Alumnos").nextElementSibling?.textContent).toBe("12");

    const reportes = within(
      (await screen.findByRole("heading", { name: "Últimos reportes" })).closest(
        "section",
      ) as HTMLElement,
    );
    expect(reportes.getByText("No carga Materiales")).toBeTruthy();
    expect(reportes.getByRole("link", { name: "ana@mail.com" }).getAttribute("href")).toBe(
      "mailto:ana@mail.com",
    );
    expect(reportes.getAllByRole("link")).toHaveLength(1);
    expect(reportes.getByText(/Chrome 131 · Android 14 · versión abc1234/)).toBeTruthy();
  });

  it("muestra el embudo del onboarding con el porcentaje sobre los registrados", async () => {
    window.location.hash = "admin";
    renderConRepositorio(<Shell />, comoAdmin());
    const embudo = await tarjeta("Embudo del onboarding");
    const pasos = embudo.getAllByRole("listitem").map((li) => li.textContent);
    expect(pasos).toEqual([
      "Se registraron12 · 100%",
      "Eligieron carrera10 · 83%",
      "Cargaron al menos una materia8 · 67%",
      "Importaron un respaldo3 · 25%",
    ]);
    expect(embudo.getByText(/cuenta desde el 17\/11\/2026/)).toBeTruthy();
  });

  it("muestra cada monitor con su estado y la disponibilidad de 7 y 30 días", async () => {
    window.location.hash = "admin";
    renderConRepositorio(<Shell />, comoAdmin());
    const estado = await tarjeta("Estado del servicio");
    const filas = (await estado.findAllByRole("row")).slice(1).map((f) => f.textContent);
    expect(filas).toEqual([
      "estudia-liard.vercel.appFunciona100%99,95%",
      "EstudIA SupabaseCaído97,5%—",
    ]);
    expect(
      estado.getByRole("link", { name: "Página pública de estado" }).getAttribute("href"),
    ).toBe("https://stats.uptimerobot.com/pypY6ca17D");
  });

  it("si falla el estado del servicio, avisa en esa tarjeta y el resto carga igual", async () => {
    window.location.hash = "admin";
    const repositorio = comoAdmin();
    repositorio.obtenerEstadoServicio.mockRejectedValue(
      new Error("No se pudo leer el estado del servicio: No pude consultar UptimeRobot."),
    );
    renderConRepositorio(<Shell />, repositorio);

    const estado = await tarjeta("Estado del servicio");
    expect((await estado.findByRole("status")).textContent).toContain(
      "No pude consultar UptimeRobot",
    );
    expect(estado.getByRole("link", { name: "Página pública de estado" })).toBeTruthy();
    expect(await tarjeta("Totales")).toBeTruthy();
    expect(await tarjeta("Embudo del onboarding")).toBeTruthy();
    expect(await tarjeta("Últimos reportes")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("embebe el panel de Umami si VITE_UMAMI_SHARE_URL es un enlace para compartir", async () => {
    vi.stubEnv("VITE_UMAMI_SHARE_URL", "https://cloud.umami.is/analytics/eu/share/Prueba123");
    window.location.hash = "admin";
    renderConRepositorio(<Shell />, comoAdmin());
    const visitas = await tarjeta("Visitas");
    const panel = visitas.getByTitle("Panel de visitas de Umami");
    expect(panel.getAttribute("src")).toBe("https://cloud.umami.is/analytics/eu/share/Prueba123");
    expect(panel.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(
      visitas.getByRole("link", { name: "Abrir el panel en otra pestaña" }).getAttribute("target"),
    ).toBe("_blank");
  });

  it("sin la variable, o con otra URL, no embebe nada", async () => {
    vi.stubEnv("VITE_UMAMI_SHARE_URL", "https://otro.com/share/x");
    window.location.hash = "admin";
    renderConRepositorio(<Shell />, comoAdmin());
    const visitas = await tarjeta("Visitas");
    expect(visitas.queryByTitle("Panel de visitas de Umami")).toBeNull();
    expect(visitas.getByText(/Falta configurar/)).toBeTruthy();
  });
});

describe("link Estado del servicio", () => {
  it("está al final del menú lateral y abre la página pública en otra pestaña", async () => {
    window.location.hash = "inicio";
    renderConRepositorio(<Shell />, repositorioFalso({ inscripciones: [INSCRIPCION] }));
    const link = await screen.findByRole("link", { name: "Estado del servicio" });
    expect(link.getAttribute("href")).toBe("https://stats.uptimerobot.com/pypY6ca17D");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.parentElement?.lastElementChild).toBe(link);
  });

  it("el enlace del panel de Umami no aparece fuera de #admin", async () => {
    vi.stubEnv("VITE_UMAMI_SHARE_URL", "https://cloud.umami.is/analytics/eu/share/Prueba123");
    window.location.hash = "inicio";
    const { container } = renderConRepositorio(
      <Shell />,
      repositorioFalso({ inscripciones: [INSCRIPCION] }),
    );
    await screen.findByRole("heading", { name: "Inicio" });
    expect(container.innerHTML).not.toContain("share/Prueba123");
  });
});
