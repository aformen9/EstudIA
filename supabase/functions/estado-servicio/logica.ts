/**
 * Lógica de la Edge Function `estado-servicio`, sin nada propio de Deno: se prueba con Vitest.
 *
 * - Solo para admins: sin token responde 401; con un token que no es de un admin, 403. Nunca le
 *   pregunta a UptimeRobot antes de saber que es admin.
 * - La clave de UptimeRobot solo se usa para el pedido: nunca va en la respuesta ni en un log.
 * - El enlace del panel de visitas de Umami (secreto `UMAMI_SHARE_URL`) solo se le devuelve al admin.
 * - Si UptimeRobot falla, igual responde 200 con el error en `uptime` y el enlace del panel: así
 *   #admin muestra el aviso solo en esa tarjeta.
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

export interface Uptime {
  monitores: Monitor[];
  actualizado: string;
}

export interface EstadoServicio {
  uptime: Uptime | { error: string };
  /** Enlace de solo lectura del panel de Umami, o null si no está configurado o no es válido. */
  panelVisitas: string | null;
}

export type Admin = "si" | "no" | "sin_sesion";

export interface Dependencias {
  /** `UPTIMEROBOT_API_KEY`, el secreto de Supabase. */
  clave: string | undefined;
  /** `UMAMI_SHARE_URL`, el secreto de Supabase. */
  panelVisitas: string | undefined;
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
 * Solo un enlace https de cloud.umami.is con /share/: un secreto mal cargado no termina embebiendo
 * otra página en #admin.
 */
export function validarPanelVisitas(valor: string | undefined): string | null {
  if (!valor) return null;
  try {
    const url = new URL(valor.trim());
    if (url.protocol !== "https:" || url.hostname !== "cloud.umami.is") return null;
    if (!url.pathname.includes("/share/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Se queda solo con nombre, estado y porcentajes: la URL monitoreada (la de Supabase lleva la
 * publishable key) y el resto de los datos de UptimeRobot no salen de la función.
 */
export function aUptime(respuesta: unknown, ahora: number): Uptime {
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
  let cache: { datos: Uptime; hasta: number } | null = null;
  const panelVisitas = validarPanelVisitas(deps.panelVisitas);

  // Solo se llama después de comprobar que es admin.
  async function uptime(ahora: number): Promise<EstadoServicio["uptime"]> {
    if (cache && ahora < cache.hasta) return cache.datos;
    if (!deps.clave) return { error: "Falta configurar la clave de UptimeRobot." };
    try {
      const datos = aUptime(await deps.pedirMonitores(deps.clave), ahora);
      cache = { datos, hasta: ahora + CACHE_MS };
      return datos;
    } catch {
      // Sin detalles: el error de fetch o de UptimeRobot podría traer el pedido.
      return { error: "No pude consultar UptimeRobot." };
    }
  }

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

    const respuesta: EstadoServicio = { uptime: await uptime(deps.ahora()), panelVisitas };
    return json(respuesta, 200, cors);
  };
}
