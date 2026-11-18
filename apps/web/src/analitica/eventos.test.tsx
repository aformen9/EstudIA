import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../interfaz/Shell";
import { INSCRIPCION, renderConRepositorio, repositorioFalso } from "../pruebas/entornoVistas";
import { reiniciarAnalitica } from "./analitica";

let track: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  window.scrollTo = () => {};
  reiniciarAnalitica();
  track = vi.fn<(...args: unknown[]) => void>();
  window.umami = { track } as unknown as Window["umami"];
});
afterEach(() => {
  delete window.umami;
});

/** Todo lo que se mandó, en texto, para buscar datos que no deberían salir. */
const enviado = () =>
  JSON.stringify(
    track.mock.calls.map((c) => (typeof c[0] === "function" ? c[0]({ website: "w" }) : c)),
  );

describe("eventos de la app", () => {
  it("el onboarding manda el paso en el que está, sin datos del alumno", async () => {
    renderConRepositorio(<Shell />, repositorioFalso());
    await waitFor(() => expect(track).toHaveBeenCalledWith("onboarding", { paso: "universidad" }));
    expect(enviado()).not.toMatch(/Ana|Pérez|@|"u"|uuid/);
  });

  it("cada vista es una visita con su ruta, y reportar manda solo el tipo", async () => {
    window.location.hash = "materias";
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    renderConRepositorio(<Shell />, repositorio);
    await screen.findByRole("heading", { name: "Materias" });
    const visita = track.mock.calls.find((c) => typeof c[0] === "function")?.[0] as (
      base: object,
    ) => { url: string };
    expect(visita({ website: "w" }).url).toBe("/materias");

    fireEvent.click(screen.getByRole("button", { name: /Reportar un problema/ }));
    const dialogo = within(await screen.findByRole("dialog", { name: /Reportar/ }));
    fireEvent.change(dialogo.getByLabelText("Contanos qué pasó"), {
      target: { value: "Mi mail es ana@mail.com y no anda" },
    });
    fireEvent.click(dialogo.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(track).toHaveBeenCalledWith("reportar", { tipo: "problema" }));
    expect(enviado()).not.toContain("ana@mail.com");
  });
});
