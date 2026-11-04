import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { clienteConFetchFalso } from "../pruebas/clienteFalso";
import LoginDePrueba, {
  EMAIL_DE_PRUEBA,
  TEXTO_DEL_BOTON,
  entrarConUsuarioDePrueba,
  urlEsLocal,
} from "./loginDePrueba";

describe("urlEsLocal", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "https://localhost"])(
    "acepta %s",
    (url) => expect(urlEsLocal(url)).toBe(true),
  );

  it.each([
    "https://abc.supabase.co",
    "http://localhost.ejemplo.com",
    "http://127.0.0.1.ejemplo.com",
    "http://ejemplo.com/localhost",
    "http://localhost@ejemplo.com",
    "no es una url",
    "",
  ])("rechaza %j", (url) => expect(urlEsLocal(url)).toBe(false));
});

describe("entrarConUsuarioDePrueba", () => {
  it("fuera de local se niega sin hacer ningún pedido", async () => {
    const { cliente, pedidos } = clienteConFetchFalso(() => ({ cuerpo: {} }));
    await expect(entrarConUsuarioDePrueba(cliente, "https://abc.supabase.co")).rejects.toThrow(
      "solo funciona contra Supabase local",
    );
    expect(pedidos).toEqual([]);
  });

  it("si el usuario no existe lo crea con signup", async () => {
    const { cliente } = clienteConFetchFalso(() => ({ cuerpo: {} }));
    const ingreso = vi.spyOn(cliente.auth, "signInWithPassword").mockResolvedValue({
      data: { user: null, session: null, weakPassword: null },
      error: { code: "invalid_credentials", message: "no" } as never,
    });
    const alta = vi.spyOn(cliente.auth, "signUp").mockResolvedValue({
      data: { user: null, session: {} as never },
      error: null,
    });
    await entrarConUsuarioDePrueba(cliente, "http://127.0.0.1:54321");
    expect(ingreso).toHaveBeenCalledOnce();
    expect(alta.mock.calls[0]?.[0]).toMatchObject({ email: EMAIL_DE_PRUEBA });
  });

  it("otro error no intenta dar de alta", async () => {
    const { cliente } = clienteConFetchFalso(() => ({ cuerpo: {} }));
    vi.spyOn(cliente.auth, "signInWithPassword").mockResolvedValue({
      data: { user: null, session: null, weakPassword: null },
      error: { code: "over_request_rate_limit", message: "muchos pedidos" } as never,
    });
    const alta = vi.spyOn(cliente.auth, "signUp");
    await expect(entrarConUsuarioDePrueba(cliente, "http://127.0.0.1:54321")).rejects.toThrow(
      "muchos pedidos",
    );
    expect(alta).not.toHaveBeenCalled();
  });
});

describe("LoginDePrueba", () => {
  it("muestra el botón contra Supabase local", () => {
    const { cliente } = clienteConFetchFalso(() => ({ cuerpo: {} }));
    render(<LoginDePrueba cliente={cliente} url="http://127.0.0.1:54321" />);
    expect(screen.getByRole("button", { name: TEXTO_DEL_BOTON })).toBeTruthy();
  });

  it("no muestra nada contra otra URL", () => {
    const { cliente } = clienteConFetchFalso(() => ({ cuerpo: {} }));
    const { container } = render(<LoginDePrueba cliente={cliente} url="https://abc.supabase.co" />);
    expect(container.innerHTML).toBe("");
  });
});
