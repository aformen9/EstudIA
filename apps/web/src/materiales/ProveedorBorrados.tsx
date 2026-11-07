import { useEffect, useState, type ReactNode } from "react";
import { ContextoBorrados, crearBorradosPendientes } from "./borradosPendientes";
import { useBorradoReal } from "./useMateriales";

/**
 * Vive en el `Shell`: desmontarlo (cerrar sesión, otra cuenta) cancela lo que no venció. Alcanza con el
 * primer `borrar`: el `Shell` se monta de nuevo si cambia la cuenta, y lo demás que usa no cambia.
 */
export function ProveedorBorrados({ children }: { children: ReactNode }) {
  const borrar = useBorradoReal();
  const [borrados] = useState(() => crearBorradosPendientes(borrar));
  useEffect(() => {
    // Salir de la página también cancela. Si no, al volver con Atrás el navegador la restaura de su
    // caché, el plazo ya está vencido y el material se borra sin que se pueda deshacer.
    const alSalir = () => borrados.cancelarTodo();
    window.addEventListener("pagehide", alSalir);
    return () => {
      window.removeEventListener("pagehide", alSalir);
      borrados.cancelarTodo();
    };
  }, [borrados]);
  return <ContextoBorrados.Provider value={borrados}>{children}</ContextoBorrados.Provider>;
}
