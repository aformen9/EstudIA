/**
 * Lógica de la Edge Function `estado-servicio`, sin nada propio de Deno: se prueba con Vitest.
 *
 * - Solo para admins: sin token responde 401; con un token que no es de un admin, 403. Nunca le
 *   pregunta a UptimeRobot antes de saber que es admin.
 * - La clave de UptimeRobot solo se usa para el pedido: nunca va en la respuesta ni en un log.
 * - Guarda la respuesta 5 minutos: la API gratis de UptimeRobot permite 10 pedidos por minuto.
 */

/** El mismo contrato que packages/core/src/admin/estadoServicio.ts: si cambia, cambian los dos. */
export type EstadoMonitor = "arriba" | "caido" | "pausado" | "sin_datos";

export interface Monitor {
  nombre: string;
  estado: EstadoMonitor;
  uptime7: number | null;
  uptime30: number | null;
}

export interface EstadoServicio {
  monitores: Monitor[];
  actualizado: string;
}

export type Admin = "si" | "no" | "sin_sesion";

export interface Dependencias {
  /** `UPTIMEROBOT_API_KEY`, el secreto de Supabase. */
  clave: string | undefined;
  /** Pregunta a la base, con el token del usuario, si es admin. */
  esAdmin(token: string): Promise<Admin>;
  /** POST a getMonitors de UptimeRobot. Devuelve el JSON tal cual. */
  pedirMonitores(clave: string): Promise<unknown>;
  ahora(): number;
  /** Orígenes que pueden llamar desde el navegador. */
  origenes: readonly string[];
}

export const CACHE_MS = 5 * 60 * 1000;
export const URL_UPTIMEROBOT = "https://api.uptimerobot.com/v2/getMonitors";

/** Cuerpo del pedido a UptimeRobot: disponibilidad de los últimos 7 y 30 días. */
export function cuerpoPedido(clave: string): string {
  return new URLSearchParams({
    api_key: clave,
    format: "json",
    custom_uptime_ratios: "7-30",
  }).toString();
}

// Códigos de UptimeRobot: 0 pausado, 1 todavía sin chequear, 2 arriba, 8 parece caído, 9 caído.
function estado(codigo: unknown): EstadoMonitor {
  if (codigo === 2) return "arriba";
  if (codigo === 8 || codigo === 9) return "caido";
  if (codigo === 0) return "pausado";
  return "sin_datos";
}

function porcentaje(texto: string | undefined): number | null {
  if (texto === undefined || texto.trim() === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export class ErrorUptimeRobot extends Error {}

/**
 * Se queda solo con nombre, estado y porcentajes: la URL monitoreada (la de Supabase lleva la
 * publishable key) y el resto de los datos de UptimeRobot no salen de la función.
 */
export function aEstadoServicio(respuesta: unknown, ahora: number): EstadoServicio {
  const r = respuesta as { stat?: unknown; monitors?: unknown } | null;
  if (!r || r.stat !== "ok" || !Array.isArray(r.monitors)) {
    throw new ErrorUptimeRobot("UptimeRobot no respondió ok");
  }
  const monitores = r.monitors.map((m: Record<string, unknown>): Monitor => {
    const ratios =
      typeof m.custom_uptime_ratio === "string" ? m.custom_uptime_ratio.split("-") : [];
    return {
      nombre: typeof m.friendly_name === "string" ? m.friendly_name.slice(0, 80) : "Sin nombre",
      estado: estado(m.status),
      uptime7: porcentaje(ratios[0]),
      uptime30: porcentaje(ratios[1]),
    };
  });
  return { monitores, actualizado: new Date(ahora).toISOString() };
}

function json(cuerpo: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function crearManejador(deps: Dependencias): (pedido: Request) => Promise<Response> {
  let cache: { datos: EstadoServicio; hasta: number } | null = null;

  return async (pedido) => {
    const origen = pedido.headers.get("Origin");
    const cors: Record<string, string> = {
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      Vary: "Origin",
    };
    if (origen && deps.origenes.includes(origen)) cors["Access-Control-Allow-Origin"] = origen;

    if (pedido.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (pedido.method !== "GET" && pedido.method !== "POST") {
      return json({ error: "Método no permitido." }, 405, cors);
    }

    const token = /^Bearer\s+(\S+)$/i.exec(pedido.headers.get("Authorization") ?? "")?.[1];
    if (!token) return json({ error: "Hace falta una sesión." }, 401, cors);

    let admin: Admin;
    try {
      admin = await deps.esAdmin(token);
    } catch {
      return json({ error: "No pude comprobar la sesión." }, 502, cors);
    }
    if (admin === "sin_sesion") return json({ error: "Hace falta una sesión." }, 401, cors);
    if (admin !== "si") return json({ error: "Solo para admins." }, 403, cors);

    const ahora = deps.ahora();
    if (cache && ahora < cache.hasta) return json(cache.datos, 200, cors);

    if (!deps.clave) {
      return json({ error: "Falta configurar la clave de UptimeRobot." }, 503, cors);
    }
    try {
      const datos = aEstadoServicio(await deps.pedirMonitores(deps.clave), ahora);
      cache = { datos, hasta: ahora + CACHE_MS };
      return json(datos, 200, cors);
    } catch {
      // Sin detalles: el error de fetch o de UptimeRobot podría traer el pedido.
      return json({ error: "No pude consultar UptimeRobot." }, 502, cors);
    }
  };
}
