import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { formatoNota } from "../plan/presentacion";
import { lanzarConfeti } from "./efectos";

export interface DatosFestejo {
  materia: string;
  nota: number | null;
}

/** Cuánto dura en pantalla si nadie lo cierra antes. */
export const DURACION_FESTEJO_MS = 4000;

let actual: (DatosFestejo & { id: number }) | null = null;
let proximo = 1;
const oyentes = new Set<() => void>();

function avisarCambio() {
  oyentes.forEach((oyente) => oyente());
}

/** Festeja haber aprobado una materia. Lo pide el panel de materia, nunca la grilla ni importar. */
export function festejar(datos: DatosFestejo): void {
  actual = { ...datos, id: proximo++ };
  avisarCambio();
}

function terminar() {
  actual = null;
  avisarCambio();
}

function suscribir(alCambiar: () => void) {
  oyentes.add(alCambiar);
  return () => oyentes.delete(alCambiar);
}

/**
 * Pantalla completa con blur, el texto atrás y el confeti adelante. Se cierra sola, al tocar o con
 * cualquier tecla. Con "menos movimiento" no hay confeti ni animación: queda el texto.
 */
export function CapaFestejo() {
  const festejo = useSyncExternalStore(suscribir, () => actual);
  if (!festejo) return null;
  return <Festejo key={festejo.id} datos={festejo} />;
}

function Festejo({ datos }: { datos: DatosFestejo }) {
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    lanzarConfeti(lienzo.current);
    const reloj = setTimeout(terminar, DURACION_FESTEJO_MS);
    const alTeclear = () => terminar();
    // En el próximo turno: la tecla que guardó el panel no tiene que cerrarlo.
    const espera = setTimeout(() => document.addEventListener("keydown", alTeclear), 0);
    return () => {
      clearTimeout(reloj);
      clearTimeout(espera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, []);

  return createPortal(
    <div className="festejo" role="status" onClick={terminar}>
      <div className="fest-t">
        <h2>¡Felicitaciones!</h2>
        <p>Aprobaste</p>
        <strong>{datos.materia}</strong>
        {datos.nota != null && (
          <span className="fn">
            con un <b>{formatoNota(datos.nota)}</b>
          </span>
        )}
        <small>Tocá en cualquier lado para seguir</small>
      </div>
      <canvas ref={lienzo} aria-hidden="true" />
    </div>,
    document.body,
  );
}
