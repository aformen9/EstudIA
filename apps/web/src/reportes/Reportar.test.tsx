import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Shell } from "../interfaz/Shell";
import { INSCRIPCION, renderConRepositorio, repositorioFalso } from "../pruebas/entornoVistas";
import { ErrorDeReporte } from "../repositorio/errorReporte";

const conInscripcion = () => repositorioFalso({ inscripciones: [INSCRIPCION] });

beforeEach(() => {
  window.location.hash = "materiales";
  localStorage.clear();
  window.scrollTo = () => {};
});

async function abrirDesdeElMenu() {
  fireEvent.click(await screen.findByRole("button", { name: /Reportar un problema/ }));
  return within(await screen.findByRole("dialog", { name: "Reportar un problema o sugerencia" }));
}

describe("reportar un problema o sugerencia", () => {
  it("manda el reporte con la vista, la casilla y los datos técnicos, y agradece", async () => {
    const repositorio = conInscripcion();
    renderConRepositorio(<Shell />, repositorio);
    const dialogo = await abrirDesdeElMenu();

    const enviar = dialogo.getByRole("button", { name: "Enviar" }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    expect(dialogo.getByText("0 / 1000")).toBeTruthy();

    fireEvent.click(dialogo.getByRole("radio", { name: "Sugerencia" }));
    fireEvent.change(dialogo.getByLabelText("Contanos tu idea"), {
      target: { value: "  Que se pueda exportar a PDF  " },
    });
    expect(dialogo.getByText("27 / 1000")).toBeTruthy();
    const casilla = dialogo.getByRole("checkbox", { name: "Pueden contactarme por este reporte" });
    expect((casilla as HTMLInputElement).checked).toBe(false);
    fireEvent.click(casilla);
    fireEvent.click(enviar);

    await waitFor(() =>
      expect(repositorio.crearReporte).toHaveBeenCalledExactlyOnceWith({
        tipo: "sugerencia",
        texto: "Que se pueda exportar a PDF",
        vista: "materiales",
        contactable: true,
        navegador: expect.any(String),
        sistema: expect.any(String),
        versionApp: "local",
      }),
    );
    expect(await dialogo.findByText("¡Gracias! Lo vamos a leer.")).toBeTruthy();
  });

  it("la casilla de contacto viene desmarcada y, sin tocarla, no se manda el mail", async () => {
    const repositorio = conInscripcion();
    renderConRepositorio(<Shell />, repositorio);
    const dialogo = await abrirDesdeElMenu();
    fireEvent.change(dialogo.getByLabelText("Contanos qué pasó"), { target: { value: "No anda" } });
    fireEvent.click(dialogo.getByRole("button", { name: "Enviar" }));
    await waitFor(() =>
      expect(repositorio.crearReporte).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: "problema", contactable: false }),
      ),
    );
  });

  it("no deja enviar solo espacios ni más de 1000 caracteres", async () => {
    renderConRepositorio(<Shell />, conInscripcion());
    const dialogo = await abrirDesdeElMenu();
    const campo = dialogo.getByLabelText("Contanos qué pasó");
    const enviar = dialogo.getByRole("button", { name: "Enviar" }) as HTMLButtonElement;

    fireEvent.change(campo, { target: { value: "   " } });
    expect(enviar.disabled).toBe(true);
    fireEvent.change(campo, { target: { value: "a".repeat(1001) } });
    expect(enviar.disabled).toBe(true);
    expect(dialogo.getByText("1001 / 1000").className).toContain("excedido");
    fireEvent.change(campo, { target: { value: "a".repeat(1000) } });
    expect(enviar.disabled).toBe(false);
  });

  it("si la base lo rechaza por el tope del día, lo explica", async () => {
    const repositorio = conInscripcion();
    repositorio.crearReporte.mockRejectedValue(
      new ErrorDeReporte("Llegaste al máximo de 5 reportes por día. Probá de nuevo mañana."),
    );
    renderConRepositorio(<Shell />, repositorio);
    const dialogo = await abrirDesdeElMenu();
    fireEvent.change(dialogo.getByLabelText("Contanos qué pasó"), { target: { value: "x" } });
    fireEvent.click(dialogo.getByRole("button", { name: "Enviar" }));
    expect((await dialogo.findByRole("alert")).textContent).toContain("máximo de 5 reportes");
  });

  it("también se abre desde el menú de Ajustes", async () => {
    renderConRepositorio(<Shell />, conInscripcion());
    fireEvent.click(await screen.findByRole("button", { name: "Respaldo y ajustes" }));
    fireEvent.click(screen.getByRole("button", { name: /Reportar un problema\s*O mandarnos/ }));
    expect(
      await screen.findByRole("dialog", { name: "Reportar un problema o sugerencia" }),
    ).toBeTruthy();
  });

  it("durante el onboarding se abre desde la barra del onboarding", async () => {
    const repositorio = repositorioFalso();
    renderConRepositorio(<Shell />, repositorio);
    fireEvent.click(
      await screen.findByRole("button", { name: "Reportar un problema o sugerencia" }),
    );
    const dialogo = within(
      await screen.findByRole("dialog", { name: "Reportar un problema o sugerencia" }),
    );
    fireEvent.change(dialogo.getByLabelText("Contanos qué pasó"), { target: { value: "x" } });
    fireEvent.click(dialogo.getByRole("button", { name: "Enviar" }));
    await waitFor(() =>
      expect(repositorio.crearReporte).toHaveBeenCalledWith(
        expect.objectContaining({ vista: "onboarding" }),
      ),
    );
  });
});
