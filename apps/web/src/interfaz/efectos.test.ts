import { afterEach, describe, expect, it, vi } from "vitest";
import { iniciarEfectosDePuntero, lanzarConfeti } from "./efectos";

function conPreferencia(reduce: boolean) {
  vi.stubGlobal("matchMedia", (consulta: string) => ({
    matches: consulta.includes("reduce") ? reduce : false,
  }));
  window.matchMedia = globalThis.matchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "matchMedia");
  document.body.innerHTML = "";
});

describe("confeti", () => {
  it("no dibuja nada con prefers-reduced-motion", () => {
    conPreferencia(true);
    document.body.innerHTML = '<canvas id="confetti"></canvas>';
    const contexto = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    lanzarConfeti();
    expect(contexto).not.toHaveBeenCalled();
  });

  it("sin esa preferencia dibuja", () => {
    conPreferencia(false);
    document.body.innerHTML = '<canvas id="confetti"></canvas>';
    const contexto = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    lanzarConfeti();
    expect(contexto).toHaveBeenCalledWith("2d");
  });
});

describe("brillo que sigue al puntero", () => {
  const TARJETA_LARGA = `
    <section class="card onboarding" id="larga">
      <span class="brillo-recorte"><span class="brillo-capa" id="capa"></span></span>
      <div class="grilla-fila"><span id="adentro">Materia</span></div>
    </section>
    <a class="kpi" id="chica"></a>`;

  function mover(objetivo: Element, clientX: number, clientY: number) {
    objetivo.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX, clientY }));
  }

  function preparar() {
    conPreferencia(false);
    vi.stubGlobal("requestAnimationFrame", (hacer: FrameRequestCallback) => {
      hacer(0);
      // Como ya corrió, no queda ningún cuadro pendiente.
      return 0;
    });
    document.body.innerHTML = TARJETA_LARGA;
    const elemento = (id: string) => document.getElementById(id) as HTMLElement;
    return {
      larga: elemento("larga"),
      capa: elemento("capa"),
      adentro: elemento("adentro"),
      chica: elemento("chica"),
    };
  }

  it("en la tarjeta larga no escribe --mx ni --my: mueve la capa con transform", () => {
    const { larga, capa, adentro } = preparar();
    const apagar = iniciarEfectosDePuntero();
    mover(adentro, 500, 600);
    apagar();

    expect(larga.style.getPropertyValue("--mx")).toBe("");
    expect(larga.style.getPropertyValue("--my")).toBe("");
    expect(capa.style.transform).toBe("translate3d(80px, 180px, 0)");
    expect(capa.style.opacity).toBe("1");
  });

  it("al salir de la tarjeta larga oculta la capa, sin escribir las variables", () => {
    const { larga, capa, adentro, chica } = preparar();
    const apagar = iniciarEfectosDePuntero();
    mover(adentro, 500, 600);
    mover(chica, 10, 10);
    apagar();

    expect(capa.style.opacity).toBe("0");
    expect(larga.style.getPropertyValue("--mx")).toBe("");
  });

  it("las tarjetas chicas siguen como estaban", () => {
    const { chica } = preparar();
    const apagar = iniciarEfectosDePuntero();
    mover(chica, 10, 20);
    apagar();
    expect(chica.style.getPropertyValue("--mx")).toBe("10px");
    expect(chica.style.getPropertyValue("--my")).toBe("20px");
  });

  it("con prefers-reduced-motion no hace nada", () => {
    const { larga, capa, adentro } = preparar();
    conPreferencia(true);
    const apagar = iniciarEfectosDePuntero();
    mover(adentro, 500, 600);
    apagar();
    expect(capa.style.transform).toBe("");
    expect(larga.style.getPropertyValue("--mx")).toBe("");
  });
});
