import type { MetricasAdmin, Perfil } from "@estudia/core";
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
};

function comoAdmin() {
  const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
  repositorio.obtenerPerfil.mockResolvedValue(ADMIN);
  repositorio.obtenerMetricasAdmin.mockResolvedValue(METRICAS);
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

describe("#admin", () => {
  it("un alumno no ve el enlace y, si entra por la URL, va a Inicio", async () => {
    window.location.hash = "admin";
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    renderConRepositorio(<Shell />, repositorio);
    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe("#inicio"));
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
    expect(repositorio.obtenerMetricasAdmin).not.toHaveBeenCalled();
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
});
