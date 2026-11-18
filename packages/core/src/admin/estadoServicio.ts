/**
 * Lo que devuelve la Edge Function `estado-servicio` (solo para admins): el estado y la disponibilidad
 * de cada monitor de UptimeRobot, y el enlace del panel de visitas de Umami. Nunca incluye la clave de
 * UptimeRobot ni la URL que se monitorea.
 * El mismo contrato está en supabase/functions/estado-servicio/logica.ts: si cambia, cambian los dos.
 */
export type EstadoMonitor = "arriba" | "caido" | "pausado" | "sin_datos";

export interface Monitor {
  nombre: string;
  estado: EstadoMonitor;
  /** Porcentaje de disponibilidad (0 a 100), o null si UptimeRobot no lo informó. */
  uptime7: number | null;
  uptime30: number | null;
}

export interface Uptime {
  monitores: Monitor[];
  /** Cuándo se le preguntó a UptimeRobot (ISO 8601). Puede tener hasta 5 minutos. */
  actualizado: string;
}

export interface EstadoServicio {
  /** Si UptimeRobot falló, el aviso para mostrar en esa tarjeta. */
  uptime: Uptime | { error: string };
  /** Enlace de solo lectura del panel de Umami (secreto `UMAMI_SHARE_URL`), o null. */
  panelVisitas: string | null;
}

/** Página pública de UptimeRobot: la ve cualquiera, no muestra datos de los alumnos. */
export const PAGINA_ESTADO_SERVICIO = "https://stats.uptimerobot.com/pypY6ca17D";
