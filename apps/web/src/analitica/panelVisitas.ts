/**
 * Enlace para compartir del panel de Umami (solo lectura), para la tarjeta "Visitas" de #admin.
 * Lo devuelve la Edge Function `estado-servicio` solo al admin (secreto de Supabase `UMAMI_SHARE_URL`):
 * no está en el código ni en el bundle.
 *
 * La función ya lo valida; acá se vuelve a mirar antes de embeberlo: solo un enlace https de
 * cloud.umami.is con /share/.
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
