import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CargaDiferida, diferido } from "../interfaz/CargaDiferida";
import type { LugarInicial } from "../panel/PanelMateria";
import { useDatosAlumno } from "./planActivo";

const PanelMateria = diferido(async () => (await import("../panel/PanelMateria")).PanelMateria);

const DURACION_AVISO_MS = 2800;

interface AccionesPanel {
  abrirMateria: (materiaId: string) => void;
  abrirNueva: (lugar: LugarInicial) => void;
  avisar: (texto: string) => void;
}

const ContextoPanel = createContext<AccionesPanel>({
  abrirMateria: () => {},
  abrirNueva: () => {},
  avisar: () => {},
});

type Abierto = { materiaId: string } | { nueva: LugarInicial } | null;

/** Único punto de entrada al panel de materia: todas las filas llaman a `useAbrirMateria()`. */
export function ProveedorAbrirMateria({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  const plan = useDatosAlumno();

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const avisar = useCallback((texto: string) => {
    setAviso(texto);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(null), DURACION_AVISO_MS);
  }, []);

  const acciones = useMemo(
    () => ({
      abrirMateria: (materiaId: string) => setAbierto({ materiaId }),
      abrirNueva: (nueva: LugarInicial) => setAbierto({ nueva }),
      avisar,
    }),
    [avisar],
  );

  const datos = plan.estado === "listo" ? plan.datos : null;
  const materia =
    abierto && "materiaId" in abierto
      ? (datos?.materias.find((m) => m.id === abierto.materiaId) ?? null)
      : null;
  const hayPanel = datos && abierto && (materia !== null || "nueva" in abierto);

  return (
    <ContextoPanel.Provider value={acciones}>
      {children}
      {hayPanel && (
        <CargaDiferida clase="toast" key={materia?.id ?? "nueva"}>
          <PanelMateria
            datos={datos}
            materia={materia}
            lugarInicial={"nueva" in abierto ? abierto.nueva : { anio: 1, cuatrimestre: 1 }}
            alCerrar={() => setAbierto(null)}
            avisar={avisar}
          />
        </CargaDiferida>
      )}
      {/* La región existe antes que el aviso: si no, los lectores de pantalla no lo anuncian. */}
      <div role="status">{aviso && <div className="toast">{aviso}</div>}</div>
    </ContextoPanel.Provider>
  );
}

export function useAbrirMateria(): (materiaId: string) => void {
  return useContext(ContextoPanel).abrirMateria;
}

export function useAbrirNuevaMateria(): (lugar: LugarInicial) => void {
  return useContext(ContextoPanel).abrirNueva;
}

export function useAviso(): (texto: string) => void {
  return useContext(ContextoPanel).avisar;
}
