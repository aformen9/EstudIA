// Edge Function `estado-servicio` (Deno). Solo conecta la lógica de ./logica.ts con el entorno:
// las variables de Supabase, el secreto UPTIMEROBOT_API_KEY y fetch. No loguea nada.
import { type Admin, crearManejador, cuerpoPedido, URL_UPTIMEROBOT } from "./logica.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
// Para llamar a la API de la base con el token del usuario: la clave pública (publishable, o la
// anon de antes si el proyecto todavía no tiene claves nuevas).
function clavePublica(): string {
  try {
    const claves = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<
      string,
      string
    >;
    if (claves.default) return claves.default;
  } catch {
    // Sigue con la anon.
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}
const CLAVE_PUBLICA = clavePublica();

async function esAdmin(token: string): Promise<Admin> {
  // Con el token del usuario: la base valida la firma y `es_admin()` mira su perfil.
  const respuesta = await fetch(`${URL_SUPABASE}/rest/v1/rpc/es_admin`, {
    method: "POST",
    headers: {
      apikey: CLAVE_PUBLICA,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (respuesta.status === 401 || respuesta.status === 403) return "sin_sesion";
  if (!respuesta.ok) throw new Error("es_admin falló");
  return (await respuesta.json()) === true ? "si" : "no";
}

async function pedirMonitores(clave: string): Promise<unknown> {
  const respuesta = await fetch(URL_UPTIMEROBOT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: cuerpoPedido(clave),
    signal: AbortSignal.timeout(8000),
  });
  if (!respuesta.ok) throw new Error("UptimeRobot falló");
  return await respuesta.json();
}

Deno.serve(
  crearManejador({
    clave: Deno.env.get("UPTIMEROBOT_API_KEY"),
    esAdmin,
    pedirMonitores,
    ahora: () => Date.now(),
    origenes: [
      "https://estudia-liard.vercel.app",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
  }),
);
