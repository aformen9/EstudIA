import { useEffect, useState, useSyncExternalStore } from "react";
import { useGuardado } from "../sesion/sesion";
import { textoGuardado } from "./almacenGuardado";

function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);
  useEffect(() => {
    const alCambiar = () => setEnLinea(navigator.onLine);
    window.addEventListener("online", alCambiar);
    window.addEventListener("offline", alCambiar);
    return () => {
      window.removeEventListener("online", alCambiar);
      window.removeEventListener("offline", alCambiar);
    };
  }, []);
  return enLinea;
}

export function IndicadorGuardado() {
  const almacen = useGuardado();
  const estado = useSyncExternalStore(almacen.suscribir, almacen.leer);
  const { clase, texto } = textoGuardado(estado, useEnLinea());
  return (
    <div className={`save-state ${clase}`} role="status">
      <span className="dot"></span>
      <span>{texto}</span>
    </div>
  );
}

/** Mientras `activo`, el indicador no puede decir "Guardado en la nube". */
export function useFalloVisible(activo: boolean): void {
  const almacen = useGuardado();
  useEffect(() => (activo ? almacen.marcarFallo() : undefined), [activo, almacen]);
}
