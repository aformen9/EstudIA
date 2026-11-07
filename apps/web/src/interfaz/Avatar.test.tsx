import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sesionFalsa } from "../pruebas/clienteFalso";
import { INSCRIPCION, renderConRepositorio, repositorioFalso } from "../pruebas/entornoVistas";
import { Avatar, fotosDeUsuario } from "./Avatar";
import { Shell } from "./Shell";

const FOTO = "https://lh3.googleusercontent.com/a/foto";

const OTRA = "https://lh3.googleusercontent.com/a/otra";

describe("fotosDeUsuario", () => {
  it("avatar_url primero y después picture, sin repetir", () => {
    expect(fotosDeUsuario({ avatar_url: FOTO, picture: OTRA })).toEqual([FOTO, OTRA]);
    expect(fotosDeUsuario({ avatar_url: FOTO, picture: FOTO })).toEqual([FOTO]);
    expect(fotosDeUsuario({ picture: FOTO })).toEqual([FOTO]);
    expect(fotosDeUsuario({ avatar_url: "", picture: FOTO })).toEqual([FOTO]);
  });

  it("sin foto da una lista vacía", () => {
    expect(fotosDeUsuario({})).toEqual([]);
    expect(fotosDeUsuario(undefined)).toEqual([]);
    expect(fotosDeUsuario({ avatar_url: 7 })).toEqual([]);
  });

  it.each([
    "http://lh3.googleusercontent.com/a/foto",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "foto.png",
  ])("%s no sirve: si avatar_url es así, se usa picture", (url) => {
    expect(fotosDeUsuario({ avatar_url: url })).toEqual([]);
    expect(fotosDeUsuario({ picture: url })).toEqual([]);
    expect(fotosDeUsuario({ avatar_url: url, picture: FOTO })).toEqual([FOTO]);
  });
});

describe("Avatar", () => {
  it("muestra la foto decorativa, con referrerpolicy, y sin la inicial", () => {
    const { container } = render(<Avatar nombre="Ana" fotos={[FOTO]} />);
    const imagen = container.querySelector("img") as HTMLImageElement;
    expect(imagen.getAttribute("src")).toBe(FOTO);
    expect(imagen.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(imagen.getAttribute("alt")).toBe("");
    expect(container.textContent).toBe("");
  });

  it("sin foto muestra la inicial", () => {
    const { container } = render(<Avatar nombre="ana" fotos={[]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("A");
  });

  it("si avatar_url no carga prueba con picture, y recién después la inicial", () => {
    const { container } = render(<Avatar nombre="Ana" fotos={[FOTO, OTRA]} />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(OTRA);
    expect(container.textContent).toBe("");

    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("una foto nueva se vuelve a intentar", () => {
    const { container, rerender } = render(<Avatar nombre="Ana" fotos={[FOTO]} />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    rerender(<Avatar nombre="Ana" fotos={[`${FOTO}2`]} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(`${FOTO}2`);
  });
});

describe("Avatar en el menú", () => {
  const sesionCon = (user_metadata: Record<string, unknown>) => {
    const sesion = sesionFalsa();
    return { ...sesion, user: { ...sesion.user, user_metadata } };
  };

  it("el menú muestra la foto de la sesión", async () => {
    const { container } = renderConRepositorio(
      <Shell />,
      repositorioFalso({ inscripciones: [INSCRIPCION] }),
      { sesion: sesionCon({ picture: FOTO }) },
    );
    const marca = container.querySelector(".brand") as HTMLElement;
    await within(marca).findByText("Ana Pérez");
    expect(marca.querySelector(".avatar img")?.getAttribute("src")).toBe(FOTO);
  });

  it("sin foto, el menú muestra la inicial del nombre", async () => {
    const { container } = renderConRepositorio(
      <Shell />,
      repositorioFalso({ inscripciones: [INSCRIPCION] }),
    );
    await waitFor(() => expect(container.querySelector(".avatar")?.textContent).toBe("A"));
  });
});
