import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const DURACION_AVISO_MS = 2800;
const AVISO = "Próximamente vas a poder abrir cada materia desde acá.";

const ContextoAbrirMateria = createContext<(materiaId: string) => void>(() => {});

/**
 * Único punto de entrada para abrir una materia: todas las filas llaman a `useAbrirMateria()`.
 * El panel llega en la tanda 4; hasta entonces solo avisa, para que tocar una fila no parezca roto.
 */
export function ProveedorAbrirMateria({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const abrirMateria = useCallback(() => {
    setAviso(AVISO);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(null), DURACION_AVISO_MS);
  }, []);

  return (
    <ContextoAbrirMateria.Provider value={abrirMateria}>
      {children}
      {/* La región existe antes que el aviso: si no, los lectores de pantalla no lo anuncian. */}
      <div role="status">{aviso && <div className="toast">{aviso}</div>}</div>
    </ContextoAbrirMateria.Provider>
  );
}

export function useAbrirMateria(): (materiaId: string) => void {
  return useContext(ContextoAbrirMateria);
}
