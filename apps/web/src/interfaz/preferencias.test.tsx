import type { Perfil } from "@estudia/core";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { INSCRIPCION, renderConRepositorio, repositorioFalso } from "../pruebas/entornoVistas";
import { Shell } from "./Shell";

const PERFIL: Perfil = {
  id: "u",
  nombre: "Ana Pérez",
  avatarUrl: null,
  esAdmin: false,
  acento: null,
  tema: null,
};

function conPerfil(preferencias: Pick<Perfil, "acento" | "tema">) {
  const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
  repositorio.obtenerPerfil.mockResolvedValue({ ...PERFIL, ...preferencias });
  return repositorio;
}

/** El dispositivo antes de entrar: lo que dejó el script de index.html. */
function dispositivo(tema: "light" | "dark", acento?: string) {
  document.documentElement.dataset.theme = tema;
  if (acento) document.documentElement.dataset.accent = acento;
  else delete document.documentElement.dataset.accent;
}

beforeEach(() => {
  window.location.hash = "inicio";
  localStorage.clear();
  window.scrollTo = () => {};
});

describe("acento y modo entre dispositivos", () => {
  it("al entrar aplica lo del perfil y lo deja como copia local", async () => {
    dispositivo("dark");
    const repositorio = conPerfil({ acento: "naranja", tema: "light" });
    renderConRepositorio(<Shell />, repositorio);

    await waitFor(() => expect(document.documentElement.dataset.accent).toBe("naranja"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("estudia.acento")).toBe("naranja");
    expect(localStorage.getItem("estudia.theme")).toBe("light");
    expect(repositorio.actualizarPerfil).not.toHaveBeenCalled();
  });

  it("si el perfil no tiene nada guardado, sube lo del dispositivo", async () => {
    dispositivo("light", "verde");
    const repositorio = conPerfil({ acento: null, tema: null });
    renderConRepositorio(<Shell />, repositorio);

    await waitFor(() =>
      expect(repositorio.actualizarPerfil).toHaveBeenCalledExactlyOnceWith({
        acento: "verde",
        tema: "light",
      }),
    );
    expect(document.documentElement.dataset.accent).toBe("verde");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("cambiar el modo lo manda al perfil", async () => {
    dispositivo("dark");
    const repositorio = conPerfil({ acento: "azul", tema: "dark" });
    renderConRepositorio(<Shell />, repositorio);

    await screen.findAllByText("Ana Pérez"); // el perfil ya llegó y se sincronizó
    fireEvent.click(screen.getByRole("button", { name: "Modo claro" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    await waitFor(() =>
      expect(repositorio.actualizarPerfil).toHaveBeenCalledExactlyOnceWith({ tema: "light" }),
    );
  });

  it("si no se puede guardar en el perfil, el cambio queda en el dispositivo", async () => {
    dispositivo("dark");
    const repositorio = conPerfil({ acento: "azul", tema: "dark" });
    repositorio.actualizarPerfil.mockRejectedValue(new Error("sin red"));
    renderConRepositorio(<Shell />, repositorio);

    await screen.findAllByText("Ana Pérez"); // el perfil ya llegó y se sincronizó
    fireEvent.click(screen.getByRole("button", { name: "Modo claro" }));
    await waitFor(() => expect(repositorio.actualizarPerfil).toHaveBeenCalled());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("estudia.theme")).toBe("light");
    expect(screen.getByRole("button", { name: "Modo oscuro" })).toBeTruthy();
  });
});
