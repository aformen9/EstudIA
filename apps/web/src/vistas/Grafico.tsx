import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/** Mitad del ancho máximo del tooltip, y lo mínimo que necesita arriba para no quedar cortado. */
const MARGEN_LATERAL = 130;
const MARGEN_SUPERIOR = 70;

interface EstadoTooltip {
  texto: string;
  x: number;
  y: number;
}

interface ContextoDeGrafico {
  activa: number;
  setActiva: (indice: number) => void;
  mostrar: (texto: string, x: number, y: number) => void;
  ocultar: () => void;
}

const Contexto = createContext<ContextoDeGrafico | null>(null);

/**
 * Parte de un gráfico con tooltip: un punto o una barra. Se puede ver con el mouse, tocándola o con
 * el foco del teclado. `children` lleva lo visible y, si conviene, un área invisible más grande.
 */
export function Marca({
  indice,
  texto,
  children,
}: {
  indice: number;
  texto: string;
  children: ReactNode;
}) {
  const grafico = useContext(Contexto);
  if (!grafico) throw new Error("Marca va adentro de un Grafico");
  const { activa, setActiva, mostrar, ocultar } = grafico;

  function alApuntar(e: PointerEvent) {
    if (e.pointerType !== "touch") mostrar(texto, e.clientX, e.clientY);
  }

  return (
    <g
      className="marca"
      data-marca=""
      data-tip=""
      role="img"
      aria-label={texto.replace("\n", ". ")}
      tabIndex={indice === activa ? 0 : -1}
      onPointerEnter={alApuntar}
      onPointerMove={alApuntar}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") ocultar();
      }}
      onClick={(e) => mostrar(texto, e.clientX, e.clientY)}
      onFocus={(e) => {
        setActiva(indice);
        const caja = e.currentTarget.getBoundingClientRect();
        mostrar(texto, caja.left + caja.width / 2, caja.top);
      }}
      onBlur={ocultar}
    >
      {children}
    </g>
  );
}

export interface TablaDeGrafico {
  columnas: string[];
  filas: (string | number)[][];
}

/**
 * Lienzo de un gráfico. Es una sola parada de Tab: con las flechas se recorren sus marcas. El nombre,
 * el resumen y la tabla son la alternativa para quien no ve el gráfico.
 */
export function Grafico({
  nombre,
  resumen,
  tabla,
  ancho,
  alto,
  anchoMinimo,
  total,
  children,
}: {
  nombre: string;
  resumen: string;
  tabla: TablaDeGrafico;
  ancho: number;
  alto: number;
  anchoMinimo?: number;
  /** Cantidad de marcas. */
  total: number;
  children: ReactNode;
}) {
  const idResumen = useId();
  const lienzo = useRef<SVGSVGElement>(null);
  const [elegida, setActiva] = useState(0);
  const [tooltip, setTooltip] = useState<EstadoTooltip | null>(null);
  const activa = Math.min(elegida, Math.max(0, total - 1));
  const abierto = tooltip !== null;

  const contexto = useMemo<ContextoDeGrafico>(
    () => ({
      activa,
      setActiva,
      mostrar: (texto, x, y) => setTooltip({ texto, x, y }),
      ocultar: () => setTooltip(null),
    }),
    [activa],
  );

  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setTooltip(null);
    function alTocar(e: Event) {
      // En el táctil queda abierto hasta tocar otra cosa.
      if (!(e.target instanceof Element) || !e.target.closest("[data-marca]")) cerrar();
    }
    function alTeclear(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") cerrar();
    }
    // Pasar de marca con el teclado puede desplazar el gráfico: el tooltip la acompaña.
    function alDesplazar() {
      const enfocada = document.activeElement?.closest("[data-marca]");
      if (!enfocada || !lienzo.current?.contains(enfocada)) return cerrar();
      const caja = enfocada.getBoundingClientRect();
      if (caja.bottom < 0 || caja.top > window.innerHeight) return cerrar();
      setTooltip((actual) => actual && { ...actual, x: caja.left + caja.width / 2, y: caja.top });
    }
    document.addEventListener("pointerdown", alTocar);
    document.addEventListener("keydown", alTeclear);
    window.addEventListener("scroll", alDesplazar, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", alTocar);
      document.removeEventListener("keydown", alTeclear);
      window.removeEventListener("scroll", alDesplazar, { capture: true });
    };
  }, [abierto]);

  function alTeclear(e: KeyboardEvent) {
    const marcas = [...(lienzo.current?.querySelectorAll<SVGGElement>("[data-marca]") ?? [])];
    const destinos: Record<string, number> = {
      ArrowRight: activa + 1,
      ArrowDown: activa + 1,
      ArrowLeft: activa - 1,
      ArrowUp: activa - 1,
      Home: 0,
      End: marcas.length - 1,
    };
    const destino = destinos[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    marcas[Math.min(Math.max(destino, 0), marcas.length - 1)]?.focus();
  }

  return (
    <>
      <div className="chart">
        <svg
          ref={lienzo}
          viewBox={`0 0 ${ancho} ${alto}`}
          role="group"
          aria-label={nombre}
          aria-describedby={idResumen}
          style={anchoMinimo ? { minWidth: anchoMinimo } : undefined}
          onKeyDown={alTeclear}
        >
          <Contexto.Provider value={contexto}>{children}</Contexto.Provider>
        </svg>
      </div>
      <p className="sr-solo" id={idResumen}>
        {resumen}
      </p>
      <div className="sr-solo">
        <table>
          <caption>{nombre}</caption>
          <thead>
            <tr>
              {tabla.columnas.map((columna) => (
                <th key={columna} scope="col">
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabla.filas.map((fila, i) => (
              <tr key={i}>
                {fila.map((celda, j) => (
                  <td key={j}>{celda}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* En el body: adentro de una tarjeta con transform, `position: fixed` no sería contra la ventana. */}
      {tooltip &&
        createPortal(
          <div
            className="tip"
            role="tooltip"
            style={{
              left: Math.min(
                window.innerWidth - MARGEN_LATERAL,
                Math.max(MARGEN_LATERAL, tooltip.x),
              ),
              top: Math.max(MARGEN_SUPERIOR, tooltip.y),
            }}
          >
            {tooltip.texto}
          </div>,
          document.body,
        )}
    </>
  );
}
