import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { prefiereMenosMovimiento } from "../interfaz/efectos";
import { vistaDesdeHash, type Vista } from "./rutas";

const EVENTO_REEMPLAZO = "estudia:vista-reemplazada";

/** Corrige la URL sin sumar una entrada al historial ni animar: la vista visible ya es la correcta. */
export function reemplazarVista(vista: Vista): void {
  window.history.replaceState(null, "", `#${vista}`);
  window.dispatchEvent(new Event(EVENTO_REEMPLAZO));
}

/** La vista actual según el hash, con la transición entre vistas de la referencia. */
export function useVista(): Vista {
  const [vista, setVista] = useState<Vista>(() => vistaDesdeHash(window.location.hash));

  useEffect(() => {
    function alCambiar() {
      const cambiar = () => {
        flushSync(() => setVista(vistaDesdeHash(window.location.hash)));
        window.scrollTo({ top: 0 });
      };
      if (typeof document.startViewTransition === "function" && !prefiereMenosMovimiento()) {
        document.startViewTransition(cambiar);
      } else {
        cambiar();
      }
    }
    const alReemplazar = () => setVista(vistaDesdeHash(window.location.hash));
    window.addEventListener("hashchange", alCambiar);
    window.addEventListener(EVENTO_REEMPLAZO, alReemplazar);
    return () => {
      window.removeEventListener("hashchange", alCambiar);
      window.removeEventListener(EVENTO_REEMPLAZO, alReemplazar);
    };
  }, []);

  return vista;
}
