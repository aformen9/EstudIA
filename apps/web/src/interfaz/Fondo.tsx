import { useEffect, useRef } from "react";
import { iniciarConstelacion, iniciarEfectosDePuntero } from "./efectos";

/** Fondo animado (manchas, grilla, constelación), confeti y efectos de puntero de toda la app. */
export function Fondo() {
  const estrellas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const apagarPuntero = iniciarEfectosDePuntero();
    const apagarConstelacion = estrellas.current ? iniciarConstelacion(estrellas.current) : null;
    return () => {
      apagarPuntero();
      apagarConstelacion?.();
    };
  }, []);

  return (
    <>
      <div className="blobs" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <i className="grid-fx"></i>
      </div>
      <canvas id="stars" ref={estrellas} aria-hidden="true"></canvas>
      <canvas id="confetti" aria-hidden="true"></canvas>
    </>
  );
}
