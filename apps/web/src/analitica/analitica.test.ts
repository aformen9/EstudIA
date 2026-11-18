import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cargarAnalitica,
  debeMedir,
  registrarEvento,
  registrarVisita,
  reiniciarAnalitica,
  UMAMI,
} from "./analitica";

const PRODUCCION = { produccion: true, dominio: "estudia-liard.vercel.app", noRastrear: null };

const script = () => document.querySelector<HTMLScriptElement>(`script[src="${UMAMI.script}"]`);

beforeEach(() => {
  script()?.remove();
  reiniciarAnalitica();
});
afterEach(() => {
  delete window.umami;
});

describe("cuándo se mide", () => {
  it("solo en producción, en el dominio de producción y sin Do Not Track", () => {
    expect(debeMedir(PRODUCCION)).toBe(true);
    expect(debeMedir({ ...PRODUCCION, produccion: false })).toBe(false);
    expect(debeMedir({ ...PRODUCCION, dominio: "localhost" })).toBe(false);
    expect(debeMedir({ ...PRODUCCION, dominio: "estudia-git-rama-aformen9.vercel.app" })).toBe(
      false,
    );
    expect(debeMedir({ ...PRODUCCION, noRastrear: "1" })).toBe(false);
    expect(debeMedir({ ...PRODUCCION, noRastrear: "yes" })).toBe(false);
    expect(debeMedir({ ...PRODUCCION, noRastrear: "0" })).toBe(true);
  });
});

describe("cargarAnalitica", () => {
  it("en producción agrega el script con el sitio, el dominio y Do Not Track", () => {
    cargarAnalitica(PRODUCCION);
    const s = script();
    expect(s?.src).toBe("https://cloud.umami.is/script.js");
    expect(s?.defer).toBe(true);
    expect(s?.dataset).toMatchObject({
      websiteId: "5148073e-39e9-406c-9b71-42fe3abb7f00",
      domains: "estudia-liard.vercel.app",
      doNotTrack: "true",
      autoPageview: "false",
      excludeSearch: "true",
    });
  });

  it("no lo agrega en desarrollo, en una vista previa ni con Do Not Track", () => {
    cargarAnalitica({ ...PRODUCCION, produccion: false });
    cargarAnalitica({ ...PRODUCCION, dominio: "localhost" });
    cargarAnalitica({ ...PRODUCCION, noRastrear: "1" });
    expect(script()).toBeNull();
  });

  it("en el entorno de los tests (desarrollo) no carga nada", () => {
    cargarAnalitica();
    expect(script()).toBeNull();
  });

  it("no lo agrega dos veces y, al cargar, manda la visita que estaba pendiente", () => {
    registrarVisita("inicio", "Inicio · EstudIA");
    cargarAnalitica(PRODUCCION);
    cargarAnalitica(PRODUCCION);
    expect(document.querySelectorAll(`script[src="${UMAMI.script}"]`)).toHaveLength(1);
    const track = vi.fn();
    window.umami = { track };
    script()?.dispatchEvent(new Event("load"));
    expect(track).toHaveBeenCalledOnce();
  });
});

describe("eventos y visitas", () => {
  it("sin el script no hace nada ni falla", () => {
    expect(() =>
      registrarEvento({ nombre: "reportar", datos: { tipo: "problema" } }),
    ).not.toThrow();
    expect(() => registrarVisita("inicio", "Inicio · EstudIA")).not.toThrow();
  });

  it("manda el evento con sus datos cerrados", () => {
    const track = vi.fn();
    window.umami = { track };
    registrarEvento({ nombre: "onboarding", datos: { paso: "carrera" } });
    expect(track).toHaveBeenCalledWith("onboarding", { paso: "carrera" });
  });

  it("no repite la misma visita seguida", () => {
    const track = vi.fn();
    window.umami = { track };
    registrarVisita("inicio", "Inicio · EstudIA");
    registrarVisita("inicio", "Inicio · EstudIA");
    registrarVisita("materias", "Materias · EstudIA");
    expect(track).toHaveBeenCalledTimes(2);
  });

  it("la visita lleva solo la ruta de la vista y el título", () => {
    const track = vi.fn();
    window.umami = { track };
    registrarVisita("materias", "Materias · EstudIA");
    const armar = track.mock.calls[0]?.[0] as (base: object) => object;
    expect(armar({ website: "x", url: "/#materias?algo", referrer: "" })).toEqual({
      website: "x",
      url: "/materias",
      title: "Materias · EstudIA",
      referrer: "",
    });
  });
});
