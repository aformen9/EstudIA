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

/**
 * Con filas sin guardar, recargar o cerrar la pestaña muestra el aviso nativo, en cualquier vista.
 * Sin filas fallidas no se registra: el listener solo, sin necesidad, le quita a la página el bfcache.
 */
export function useAvisoAlRecargar(): void {
  const almacen = useGuardado();
  const hayFallidas = useSyncExternalStore(
    almacen.suscribir,
    () => almacen.leer().filasFallidas.length > 0,
  );
  useEffect(() => {
    if (!hayFallidas) return;
    function alSalir(evento: BeforeUnloadEvent) {
      evento.preventDefault();
      evento.returnValue = "";
    }
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [hayFallidas]);
}
