import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { prefiereMenosMovimiento } from "../interfaz/efectos";
import { vistaDesdeHash, type Vista } from "./rutas";

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
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);

  return vista;
}
