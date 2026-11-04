import { QueryClient } from "@tanstack/react-query";

/**
 * `networkMode: "always"`: sin conexión, TanStack Query pausaría las escrituras y las mandaría al volver.
 * Eso es una cola offline, y no la hay (arquitectura §11): el pedido falla y el alumno se entera.
 */
export function crearClienteQuery(reintentosDeLectura = 3): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { networkMode: "always", staleTime: 30_000, retry: reintentosDeLectura },
      mutations: { networkMode: "always" },
    },
  });
}
