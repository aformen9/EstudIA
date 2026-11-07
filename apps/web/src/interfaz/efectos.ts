/* Efectos de la referencia: brillo que sigue al mouse, inclinación 3D, botones imán, constelación y confeti. */

/** Sin `matchMedia` (jsdom) se comporta como si pidiera menos movimiento: no arranca animaciones. */
export function prefiereMenosMovimiento(): boolean {
  return (
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const CON_BRILLO = ".card, .kpi, .subj, .mcard, .mini";
/**
 * Tarjetas que pueden tener listas largas. Escribir `--mx` y `--my` en ellas recalcula a todos sus
 * descendientes (las heredan) y repinta el fondo entero. El brillo va en una capa hija (`CapaBrillo`)
 * que se mueve solo con `transform`.
 */
const CON_CAPA = ".card.onboarding";
/** La mitad del lado de `.brillo-capa`: para centrarla en el puntero. */
const RADIO_CAPA = 420;

function capaDe(tarjeta: HTMLElement): HTMLElement | null {
  return tarjeta.querySelector<HTMLElement>(":scope > .brillo-recorte > .brillo-capa");
}

function moverCapa(tarjeta: HTMLElement, clientX: number, clientY: number) {
  const capa = capaDe(tarjeta);
  if (!capa) return;
  const r = tarjeta.getBoundingClientRect();
  const x = clientX - r.left - tarjeta.clientLeft - RADIO_CAPA;
  const y = clientY - r.top - tarjeta.clientTop - RADIO_CAPA;
  capa.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  capa.style.opacity = "1";
}

function limpiarBrillo(el: HTMLElement) {
  if (el.matches(CON_CAPA)) {
    const capa = capaDe(el);
    if (capa) capa.style.opacity = "0";
    return;
  }
  el.style.setProperty("--mx", "-500px");
  el.style.setProperty("--my", "-500px");
  el.style.removeProperty("--rx");
  el.style.removeProperty("--ry");
}

/** Devuelve la función que los apaga. */
export function iniciarEfectosDePuntero(): () => void {
  if (prefiereMenosMovimiento()) return () => {};
  let ultimo: HTMLElement | null = null;
  let cuadro = 0;
  let evento: PointerEvent | null = null;

  function aplicar() {
    cuadro = 0;
    const objetivo = evento?.target;
    if (!evento || !(objetivo instanceof Element)) return;
    const { clientX, clientY, pointerType } = evento;

    const el = objetivo.closest<HTMLElement>(CON_BRILLO);
    if (ultimo && ultimo !== el) limpiarBrillo(ultimo);
    ultimo = el;
    if (el?.matches(CON_CAPA)) {
      moverCapa(el, clientX, clientY);
    } else if (el) {
      const r = el.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
      if (el.classList.contains("tilt") && pointerType === "mouse") {
        const k = el.classList.contains("hero") ? 4 : 12;
        el.style.setProperty("--ry", `${((x / r.width - 0.5) * k).toFixed(2)}deg`);
        el.style.setProperty("--rx", `${(-(y / r.height - 0.5) * k).toFixed(2)}deg`);
      }
    }

    const boton = objetivo.closest<HTMLElement>(".btn.primary");
    document.querySelectorAll<HTMLElement>(".btn.primary").forEach((b) => {
      if (b !== boton) {
        b.style.removeProperty("--bx");
        b.style.removeProperty("--by");
      }
    });
    if (boton && pointerType === "mouse") {
      const r = boton.getBoundingClientRect();
      boton.style.setProperty("--bx", `${((clientX - r.left - r.width / 2) * 0.25).toFixed(1)}px`);
      boton.style.setProperty("--by", `${((clientY - r.top - r.height / 2) * 0.35).toFixed(1)}px`);
    }
  }

  function alMover(e: PointerEvent) {
    evento = e;
    if (!cuadro) cuadro = requestAnimationFrame(aplicar);
  }
  function alSalir() {
    if (ultimo) limpiarBrillo(ultimo);
  }

  document.addEventListener("pointermove", alMover, { passive: true });
  document.addEventListener("pointerleave", alSalir);
  return () => {
    cancelAnimationFrame(cuadro);
    document.removeEventListener("pointermove", alMover);
    document.removeEventListener("pointerleave", alSalir);
  };
}

function conAlfa(color: string | undefined, alfa: number): string {
  const m = color?.match(/^#([0-9a-f]{6})$/i);
  if (!m?.[1]) return color ?? "transparent";
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alfa})`;
}

function coloresDelTema(variables: string[]): string[] {
  const estilos = getComputedStyle(document.documentElement);
  return variables.map((v) => estilos.getPropertyValue(v).trim());
}

const VARIABLES_CONSTELACION = ["--accent", "--accent-2", "--lav"];

/** Constelación del fondo. Devuelve la función que la apaga. */
export function iniciarConstelacion(lienzo: HTMLCanvasElement): () => void {
  const ctx = prefiereMenosMovimiento() ? null : lienzo.getContext("2d");
  if (!ctx) return () => {};
  const c = ctx;

  let colores = coloresDelTema(VARIABLES_CONSTELACION);
  let ancho = 0;
  let alto = 0;
  let estrellas: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    t: number;
    /** Índice del color, para que siga al modo claro/oscuro. */
    i: number;
  }[] = [];
  const mouse = { x: -9999, y: -9999 };
  let cuadro = 0;

  function medir() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ancho = window.innerWidth;
    alto = window.innerHeight;
    lienzo.width = ancho * dpr;
    lienzo.height = alto * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cantidad = Math.round(Math.min(90, (ancho * alto) / 16000));
    estrellas = Array.from({ length: cantidad }, () => ({
      x: Math.random() * ancho,
      y: Math.random() * alto,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.6 + 0.6,
      t: Math.random() * 6.28,
      i: Math.floor(Math.random() * VARIABLES_CONSTELACION.length),
    }));
  }

  function alMover(e: PointerEvent) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }

  function dibujar() {
    c.clearRect(0, 0, ancho, alto);
    for (const p of estrellas) {
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const d = Math.hypot(dx, dy);
      if (d < 140) {
        p.vx += (dx / d) * 0.03;
        p.vy += (dy / d) * 0.03;
      }
      p.vx = p.vx * 0.985 + (Math.random() - 0.5) * 0.01;
      p.vy = p.vy * 0.985 + (Math.random() - 0.5) * 0.01;
      p.x = (p.x + p.vx + ancho) % ancho;
      p.y = (p.y + p.vy + alto) % alto;
      p.t += 0.02;
    }
    estrellas.forEach((a, indice) => {
      for (let j = indice + 1; j < estrellas.length; j++) {
        const b = estrellas[j];
        if (!b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 120) {
          c.strokeStyle = conAlfa(colores[a.i], (1 - d / 120) * 0.22);
          c.lineWidth = 0.8;
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        }
      }
    });
    for (const p of estrellas) {
      c.fillStyle = conAlfa(colores[p.i], 0.45 + Math.sin(p.t) * 0.3);
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, 6.283);
      c.fill();
    }
  }

  function animar() {
    if (!document.hidden) dibujar();
    cuadro = requestAnimationFrame(animar);
  }

  medir();
  window.addEventListener("resize", medir);
  window.addEventListener("pointermove", alMover, { passive: true });
  const observador = new MutationObserver(() => {
    colores = coloresDelTema(VARIABLES_CONSTELACION);
  });
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  animar();

  return () => {
    cancelAnimationFrame(cuadro);
    observador.disconnect();
    window.removeEventListener("resize", medir);
    window.removeEventListener("pointermove", alMover);
  };
}

/** Festejo al aprobar una materia. Usa el `<canvas id="confetti">` de `Fondo`. */
export function lanzarConfeti(): void {
  if (prefiereMenosMovimiento()) return;
  const lienzo = document.getElementById("confetti");
  if (!(lienzo instanceof HTMLCanvasElement)) return;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return;
  const c = ctx;

  const dpr = window.devicePixelRatio || 1;
  const { innerWidth: ancho, innerHeight: alto } = window;
  lienzo.width = ancho * dpr;
  lienzo.height = alto * dpr;
  c.scale(dpr, dpr);

  const colores = coloresDelTema(["--accent", "--accent-2", "--lav", "--ok", "--cur"]);
  const papeles = Array.from({ length: 140 }, () => ({
    x: ancho / 2,
    y: alto * 0.45,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 15 - 4,
    r: Math.random() * 6 + 4,
    a: Math.random() * 6,
    va: (Math.random() - 0.5) * 0.4,
    color: colores[Math.floor(Math.random() * colores.length)] ?? "",
  }));

  const inicio = performance.now();
  function cuadro(t: number) {
    c.clearRect(0, 0, ancho, alto);
    for (const p of papeles) {
      p.vy += 0.42;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.a += p.va;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.a);
      c.fillStyle = p.color;
      c.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      c.restore();
    }
    if (t - inicio < 2600) requestAnimationFrame(cuadro);
    else c.clearRect(0, 0, ancho, alto);
  }
  cuadro(inicio);
}
