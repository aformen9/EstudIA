/**
 * Enlace para compartir del panel de Umami (solo lectura), para la tarjeta "Visitas" de #admin.
 * Viene de la variable de entorno de Vercel `VITE_UMAMI_SHARE_URL`, no del código.
 *
 * Solo se acepta un enlace https de cloud.umami.is con /share/: así una variable mal cargada no
 * embebe otra página dentro de #admin.
 */
export function urlPanelVisitas(valor: string | undefined): string | null {
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
