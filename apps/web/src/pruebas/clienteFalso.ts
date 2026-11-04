import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

export const ID_ALUMNO = "00000000-0000-4000-8000-000000000001";

export function sesionFalsa(): Session {
  return {
    access_token: "token",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: ID_ALUMNO,
      email: "alumna@ejemplo.test",
      aud: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

export interface PedidoRegistrado {
  metodo: string;
  url: URL;
  cuerpo: unknown;
}

type Responder = (pedido: PedidoRegistrado) => { estado?: number; cuerpo: unknown };

/** Cliente real de Supabase con `fetch` falso: los tests ven exactamente los pedidos HTTP que hace. */
export function clienteConFetchFalso(responder: Responder): {
  cliente: SupabaseClient;
  pedidos: PedidoRegistrado[];
} {
  const pedidos: PedidoRegistrado[] = [];
  const fetchFalso: typeof fetch = async (entrada, opciones) => {
    const texto = typeof opciones?.body === "string" ? opciones.body : null;
    const pedido = {
      metodo: opciones?.method ?? "GET",
      url: new URL(String(entrada)),
      cuerpo: texto ? JSON.parse(texto) : null,
    };
    pedidos.push(pedido);
    const { estado = 200, cuerpo } = responder(pedido);
    return new Response(JSON.stringify(cuerpo), {
      status: estado,
      headers: { "Content-Type": "application/json" },
    });
  };
  const cliente = createClient("http://127.0.0.1:54321", "clave-falsa", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchFalso },
  });
  vi.spyOn(cliente.auth, "getSession").mockResolvedValue({
    data: { session: sesionFalsa() },
    error: null,
  });
  return { cliente, pedidos };
}
