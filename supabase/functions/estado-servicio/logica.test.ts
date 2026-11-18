import { describe, expect, it, vi } from "vitest";
import {
  aUptime,
  CACHE_MS,
  crearManejador,
  cuerpoPedido,
  type Admin,
  type Dependencias,
  validarPanelVisitas,
} from "./logica.ts";

const CLAVE = "ur-clave-secreta-123456";
const ORIGEN = "https://estudia-liard.vercel.app";
const PANEL = "https://cloud.umami.is/analytics/eu/share/PanelDePrueba";

const RESPUESTA_OK = {
  stat: "ok",
  monitors: [
    {
      id: 1,
      friendly_name: "estudia-liard.vercel.app",
      url: "https://estudia-liard.vercel.app",
      status: 2,
      custom_uptime_ratio: "99.990-99.950",
    },
    {
      id: 2,
      friendly_name: "EstudIA Supabase",
      url: "https://x.supabase.co/auth/v1/health?apikey=sb_publishable_abc",
      status: 9,
      custom_uptime_ratio: "97.500-98.000",
    },
  ],
};

function entorno(admin: Admin = "si", cambios: Partial<Dependencias> = {}) {
  let ahora = 1_000_000;
  const deps = {
    clave: CLAVE,
    panelVisitas: PANEL as string | undefined,
    esAdmin: vi.fn<(token: string) => Promise<Admin>>(async () => admin),
    pedirMonitores: vi.fn<(clave: string) => Promise<unknown>>(async () => RESPUESTA_OK),
    ahora: () => ahora,
    origenes: [ORIGEN],
    ...cambios,
  };
  const manejar = crearManejador(deps);
  const pedir = (token: string | null = "token-de-ana", metodo = "POST") =>
    manejar(
      new Request("https://x.supabase.co/functions/v1/estado-servicio", {
        method: metodo,
        headers: { Origin: ORIGEN, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }),
    );
  return { deps, pedir, avanzar: (ms: number) => (ahora += ms) };
}

async function texto(r: Response) {
  return JSON.stringify([...r.headers.entries()]) + (await r.text());
}

describe("estado-servicio: acceso", () => {
  it("sin token responde 401 y no le pregunta a nadie", async () => {
    const { deps, pedir } = entorno();
    const r = await pedir(null);
    expect(r.status).toBe(401);
    expect(await texto(r.clone())).not.toContain("PanelDePrueba");
    expect(deps.esAdmin).not.toHaveBeenCalled();
    expect(deps.pedirMonitores).not.toHaveBeenCalled();
  });

  it("con un token que la base rechaza responde 401", async () => {
    const { deps, pedir } = entorno("sin_sesion");
    const r = await pedir("vencido");
    expect(r.status).toBe(401);
    expect(await texto(r)).not.toContain("PanelDePrueba");
    expect(deps.pedirMonitores).not.toHaveBeenCalled();
  });

  it("un alumno (no admin) recibe 403, sin la clave ni el panel, y nunca se llama a UptimeRobot", async () => {
    const { deps, pedir } = entorno("no");
    const r = await pedir();
    expect(r.status).toBe(403);
    expect(deps.esAdmin).toHaveBeenCalledWith("token-de-ana");
    expect(deps.pedirMonitores).not.toHaveBeenCalled();
    const todo = await texto(r);
    expect(todo).not.toContain(CLAVE);
    expect(todo).not.toContain("PanelDePrueba");
    expect(todo).not.toContain("umami");
    expect(JSON.parse(todo.slice(todo.indexOf("]{") + 1))).toEqual({ error: "Solo para admins." });
  });

  it("un no admin no recibe el panel ni aunque un admin ya haya llenado la cache", async () => {
    let admin: Admin = "si";
    const { pedir } = entorno("si", { esAdmin: vi.fn(async () => admin) });
    expect(await (await pedir()).text()).toContain("PanelDePrueba");
    admin = "no";
    const r = await pedir();
    expect(r.status).toBe(403);
    expect(await r.text()).not.toContain("PanelDePrueba");
  });

  it("si no puede comprobar la sesión responde 502, sin detalles", async () => {
    const { pedir } = entorno("si", {
      esAdmin: vi.fn(async () => {
        throw new Error(`falló con ${CLAVE}`);
      }),
    });
    const r = await pedir();
    expect(r.status).toBe(502);
    expect(await texto(r)).not.toContain(CLAVE);
  });

  it("responde el preflight de CORS solo para los orígenes de la app", async () => {
    const { deps, pedir } = entorno();
    const r = await pedir(null, "OPTIONS");
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGEN);
    expect(deps.esAdmin).not.toHaveBeenCalled();

    const ajeno = await crearManejador({ ...deps, origenes: [] })(
      new Request("https://x/f", { method: "OPTIONS", headers: { Origin: "https://otro.com" } }),
    );
    expect(ajeno.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("estado-servicio: datos", () => {
  it("al admin le da estado, disponibilidad de 7 y 30 días y el panel, sin otras URLs ni la clave", async () => {
    const { deps, pedir } = entorno();
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(deps.pedirMonitores).toHaveBeenCalledWith(CLAVE);
    expect(await r.clone().json()).toEqual({
      uptime: {
        monitores: [
          { nombre: "estudia-liard.vercel.app", estado: "arriba", uptime7: 99.99, uptime30: 99.95 },
          { nombre: "EstudIA Supabase", estado: "caido", uptime7: 97.5, uptime30: 98 },
        ],
        actualizado: new Date(1_000_000).toISOString(),
      },
      panelVisitas: PANEL,
    });
    expect(await texto(r.clone())).not.toContain(CLAVE);
    const cuerpo = await r.text();
    expect(cuerpo).not.toContain("apikey");
    expect(cuerpo).not.toContain("sb_publishable");
    expect(cuerpo.replace(PANEL, "")).not.toContain("https://");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("dentro de los 5 minutos no vuelve a pedir; después sí", async () => {
    const { deps, pedir, avanzar } = entorno();
    await pedir();
    avanzar(CACHE_MS - 1);
    expect((await pedir()).status).toBe(200);
    expect(deps.pedirMonitores).toHaveBeenCalledTimes(1);
    avanzar(1);
    await pedir();
    expect(deps.pedirMonitores).toHaveBeenCalledTimes(2);
  });

  it("la cache no le sirve a un no admin", async () => {
    let admin: Admin = "si";
    const { deps, pedir } = entorno("si", { esAdmin: vi.fn(async () => admin) });
    await pedir();
    admin = "no";
    expect((await pedir()).status).toBe(403);
    expect(deps.pedirMonitores).toHaveBeenCalledTimes(1);
  });

  it("si UptimeRobot responde fail, avisa en uptime sin su error ni la clave, da el panel igual y no guarda nada", async () => {
    const { deps, pedir } = entorno("si", {
      pedirMonitores: vi.fn(async () => ({
        stat: "fail",
        error: { type: "invalid_parameter", message: `api_key ${CLAVE} is wrong` },
      })),
    });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(await r.clone().json()).toEqual({
      uptime: { error: "No pude consultar UptimeRobot." },
      panelVisitas: PANEL,
    });
    const todo = await texto(r);
    expect(todo).not.toContain(CLAVE);
    expect(todo).not.toContain("invalid_parameter");
    await pedir();
    expect(deps.pedirMonitores).toHaveBeenCalledTimes(2);
  });

  it("si el pedido a UptimeRobot tira error, avisa sin detalles", async () => {
    const { pedir } = entorno("si", {
      pedirMonitores: vi.fn(async () => {
        throw new Error(`timeout api_key=${CLAVE}`);
      }),
    });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect((await r.clone().json()).uptime).toEqual({ error: "No pude consultar UptimeRobot." });
    expect(await texto(r)).not.toContain(CLAVE);
  });

  it("sin la clave configurada avisa en uptime y no llama a UptimeRobot", async () => {
    const { deps, pedir } = entorno("si", { clave: undefined });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect((await r.json()).uptime).toEqual({ error: "Falta configurar la clave de UptimeRobot." });
    expect(deps.pedirMonitores).not.toHaveBeenCalled();
  });

  it("sin el secreto del panel, o con otra URL, panelVisitas es null", async () => {
    for (const panelVisitas of [undefined, "https://otro.com/share/x"]) {
      const { pedir } = entorno("si", { panelVisitas });
      expect((await (await pedir()).json()).panelVisitas).toBeNull();
    }
  });

  it("no loguea nada", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const { pedir } = entorno("si", {
      pedirMonitores: vi.fn(async () => {
        throw new Error(CLAVE);
      }),
    });
    await pedir();
    await entorno("no").pedir();
    for (const espia of espias) expect(espia).not.toHaveBeenCalled();
  });
});

describe("aUptime, validarPanelVisitas y cuerpoPedido", () => {
  it("mapea los códigos de UptimeRobot y tolera porcentajes que faltan", () => {
    const { monitores } = aUptime(
      {
        stat: "ok",
        monitors: [
          { friendly_name: "a", status: 0, custom_uptime_ratio: "" },
          { friendly_name: "b", status: 1 },
          { friendly_name: "c", status: 8, custom_uptime_ratio: "100.000-x" },
          { status: 2, custom_uptime_ratio: "150-99" },
        ],
      },
      0,
    );
    expect(monitores).toEqual([
      { nombre: "a", estado: "pausado", uptime7: null, uptime30: null },
      { nombre: "b", estado: "sin_datos", uptime7: null, uptime30: null },
      { nombre: "c", estado: "caido", uptime7: 100, uptime30: null },
      { nombre: "Sin nombre", estado: "arriba", uptime7: null, uptime30: 99 },
    ]);
  });

  it("pide los ratios de 7 y 30 días en JSON", () => {
    const cuerpo = new URLSearchParams(cuerpoPedido("k"));
    expect(Object.fromEntries(cuerpo)).toEqual({
      api_key: "k",
      format: "json",
      custom_uptime_ratios: "7-30",
    });
  });

  it("validarPanelVisitas solo acepta enlaces para compartir de Umami Cloud", () => {
    expect(validarPanelVisitas(` ${PANEL} `)).toBe(PANEL);
    for (const valor of [
      undefined,
      "",
      "no es una url",
      "http://cloud.umami.is/analytics/eu/share/x",
      "https://cloud.umami.is.ejemplo.com/share/x",
      "https://otro.com/share/x",
      "https://cloud.umami.is/websites/123",
      "javascript:alert(1)",
    ]) {
      expect(validarPanelVisitas(valor)).toBeNull();
    }
  });
});
