import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Shell } from "../interfaz/Shell";
import { archivosDeUsuario } from "../materiales/archivosLocales";
import { ID_ALUMNO } from "../pruebas/clienteFalso";
import { hacerFallarIndexedDb } from "../pruebas/indexedDbFalso";
import { INSCRIPCION, renderConRepositorio, repositorioFalso } from "../pruebas/entornoVistas";

const MIOS = archivosDeUsuario(ID_ALUMNO);
const AJENOS = archivosDeUsuario("otra-cuenta");

const archivo = (sha256: string) => ({
  sha256,
  nombre: `${sha256}.pdf`,
  mime: "application/pdf",
  bytes: 3,
  contenido: new Blob(["abc"]),
});

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  window.scrollTo = () => {};
});

async function abrirDialogoDesdeMenu() {
  const resultado = renderConRepositorio(
    <Shell />,
    repositorioFalso({ inscripciones: [INSCRIPCION] }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Respaldo y ajustes" }));
  fireEvent.click(screen.getByRole("button", { name: /Cerrar sesión/ }));
  const dialogo = within(await screen.findByRole("dialog", { name: "Cerrar sesión" }));
  return { ...resultado, dialogo };
}

const confirmar = (dialogo: ReturnType<typeof within>) =>
  fireEvent.click(dialogo.getByRole("button", { name: "Cerrar sesión" }));

const casilla = (dialogo: ReturnType<typeof within>) =>
  dialogo.getByRole("checkbox", {
    name: "Borrar también mis archivos de este dispositivo",
  }) as HTMLInputElement;

describe("diálogo de cerrar sesión", () => {
  it("la casilla viene desmarcada, con el aviso; destildada cierra sin borrar", async () => {
    await MIOS.guardar(archivo("a"));
    const { dialogo, signOut } = await abrirDialogoDesdeMenu();

    expect(casilla(dialogo).checked).toBe(false);
    expect(dialogo.getByText(/no se pueden recuperar/)).toBeTruthy();
    expect(dialogo.getByText(/solo en este dispositivo/)).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();

    confirmar(dialogo);

    await waitFor(() => expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" }));
    expect(await MIOS.contar()).toBe(1);
  });

  it("marcada borra los archivos de este usuario y nunca los de otra cuenta", async () => {
    await MIOS.guardar(archivo("a"));
    await MIOS.guardar(archivo("b"));
    await AJENOS.guardar(archivo("a"));
    const { dialogo, signOut } = await abrirDialogoDesdeMenu();

    fireEvent.click(casilla(dialogo));
    confirmar(dialogo);

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(await MIOS.contar()).toBe(0);
    expect(await AJENOS.contar()).toBe(1);
    expect(await AJENOS.leer("a")).not.toBeNull();
  });

  it("si el borrado falla avisa, no cierra la sesión y los archivos siguen", async () => {
    await MIOS.guardar(archivo("a"));
    const { dialogo, signOut } = await abrirDialogoDesdeMenu();
    hacerFallarIndexedDb("clear");

    fireEvent.click(casilla(dialogo));
    confirmar(dialogo);

    const alerta = await dialogo.findByRole("alert");
    expect(alerta.textContent).toContain("No pude borrar tus archivos");
    expect(alerta.textContent).toContain("siguen en este dispositivo");
    expect(signOut).not.toHaveBeenCalled();
    expect(await MIOS.contar()).toBe(1);

    // Se puede reintentar.
    confirmar(dialogo);
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(await MIOS.contar()).toBe(0);
  });

  it("si borró pero no pudo cerrar la sesión, dice las dos cosas", async () => {
    await MIOS.guardar(archivo("a"));
    const { dialogo, signOut } = await abrirDialogoDesdeMenu();
    signOut.mockResolvedValueOnce({ error: { message: "sin red" } });

    fireEvent.click(casilla(dialogo));
    confirmar(dialogo);

    const alerta = await dialogo.findByRole("alert");
    expect(alerta.textContent).toContain("ya se borraron");
    expect(alerta.textContent).toContain("no pude cerrar la sesión: sin red");
  });

  it("sin archivos en este dispositivo no hay casilla, pero sí se confirma", async () => {
    await AJENOS.guardar(archivo("a"));
    const { dialogo, signOut } = await abrirDialogoDesdeMenu();

    expect(dialogo.queryByRole("checkbox")).toBeNull();
    expect(dialogo.queryByText(/no se pueden recuperar/)).toBeNull();
    expect(dialogo.getByText(/solo en este dispositivo/)).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();

    confirmar(dialogo);
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(await AJENOS.contar()).toBe(1);
  });

  it("si no puede saber si hay archivos, muestra la casilla", async () => {
    const resultado = renderConRepositorio(
      <Shell />,
      repositorioFalso({ inscripciones: [INSCRIPCION] }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Respaldo y ajustes" }));
    hacerFallarIndexedDb("count");
    fireEvent.click(screen.getByRole("button", { name: /Cerrar sesión/ }));
    const dialogo = within(await screen.findByRole("dialog", { name: "Cerrar sesión" }));
    expect(casilla(dialogo).checked).toBe(false);
    expect(resultado.signOut).not.toHaveBeenCalled();
  });

  it("Cancelar y Escape no cierran la sesión, y el foco vuelve al botón del menú", async () => {
    const { dialogo, signOut } = await abrirDialogoDesdeMenu();
    fireEvent.click(dialogo.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(signOut).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Respaldo y ajustes" }));

    fireEvent.click(screen.getByRole("button", { name: "Respaldo y ajustes" }));
    fireEvent.click(screen.getByRole("button", { name: /Cerrar sesión/ }));
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("cerrar sesión durante el onboarding", () => {
  it("sin archivos en este dispositivo cierra directo, sin diálogo", async () => {
    await AJENOS.guardar(archivo("a"));
    const { signOut } = renderConRepositorio(<Shell />, repositorioFalso());
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("con archivos aparece el diálogo, y marcada solo borra los suyos", async () => {
    await MIOS.guardar(archivo("a"));
    await AJENOS.guardar(archivo("a"));
    const { signOut } = renderConRepositorio(<Shell />, repositorioFalso());
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar sesión" }));

    const dialogo = within(await screen.findByRole("dialog", { name: "Cerrar sesión" }));
    expect(signOut).not.toHaveBeenCalled();
    fireEvent.click(casilla(dialogo));
    confirmar(dialogo);

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(await MIOS.contar()).toBe(0);
    expect(await AJENOS.contar()).toBe(1);
  });

  it("con archivos y la casilla sin marcar no borra", async () => {
    await MIOS.guardar(archivo("a"));
    const { signOut } = renderConRepositorio(<Shell />, repositorioFalso());
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
    const dialogo = within(await screen.findByRole("dialog", { name: "Cerrar sesión" }));
    confirmar(dialogo);
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(await MIOS.contar()).toBe(1);
  });

  it("si no puede saber si hay archivos, pregunta", async () => {
    const { signOut } = renderConRepositorio(<Shell />, repositorioFalso());
    const boton = await screen.findByRole("button", { name: "Cerrar sesión" });
    hacerFallarIndexedDb("count");
    await act(async () => {
      fireEvent.click(boton);
    });
    expect(await screen.findByRole("dialog", { name: "Cerrar sesión" })).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
  });
});
