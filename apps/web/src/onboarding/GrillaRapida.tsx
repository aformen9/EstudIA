import {
  agruparMaterias,
  conteoPorEstado,
  ESTADOS_MATERIA,
  estadoDe,
  type DatosAlumno,
  type EstadoMateria,
  type Materia,
} from "@estudia/core";
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { ETIQUETAS_ESTADO, lugarMateria } from "../plan/presentacion";
import { useGuardarProgreso, type EstadoGuardadoFila } from "../plan/useGuardarProgreso";
import { useGuardado } from "../sesion/sesion";

function FilaMateria({
  planId,
  materia,
  estado,
  alCambiarEstado,
  reintentos,
}: {
  planId: string;
  materia: Materia;
  estado: EstadoMateria;
  alCambiarEstado: (materiaId: string, estado: EstadoGuardadoFila) => void;
  reintentos: RefObject<Map<string, () => void>>;
}) {
  const { guardar, reintentar, error } = useGuardarProgreso(planId, materia.id, (e) =>
    alCambiarEstado(materia.id, e),
  );
  const idTitulo = useId();

  useEffect(() => {
    const mapa = reintentos.current;
    mapa.set(materia.id, reintentar);
    return () => {
      mapa.delete(materia.id);
    };
  });

  return (
    <div className="grilla-fila">
      <span className="grilla-nombre" id={idTitulo}>
        {materia.nombre}
      </span>
      <div className="grilla-ops" role="radiogroup" aria-labelledby={idTitulo}>
        {ESTADOS_MATERIA.map((opcion) => (
          <label className={`grilla-op p-${opcion}`} key={opcion}>
            <input
              type="radio"
              name={`estado-${materia.id}`}
              checked={estado === opcion}
              onChange={() => guardar({ estado: opcion })}
            />
            <span>{ETIQUETAS_ESTADO[opcion]}</span>
          </label>
        ))}
      </div>
      {error && (
        <div className="grilla-error" role="alert">
          <p className="msg err">
            No se guardó {materia.nombre}: sigue en {ETIQUETAS_ESTADO[estado]}. {error.message}
          </p>
          <button className="btn sm" type="button" onClick={reintentar}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}

type AccionSalida = "volver" | "terminar";

/**
 * Marca el estado de cada materia, sin notas. Cada cambio se guarda solo. Antes de salir espera los
 * guardados en camino y, si alguno falló, avisa: si no, el cambio se perdería sin que se note.
 */
export function GrillaRapida({
  datos,
  alVolver,
  alTerminar,
}: {
  datos: DatosAlumno;
  alVolver: () => void;
  alTerminar: () => void;
}) {
  const almacen = useGuardado();
  const conteo = conteoPorEstado(datos);
  const [filas, setFilas] = useState<Record<string, EstadoGuardadoFila>>({});
  // Pidió salir. Qué pasa ahora se deduce de cómo están las filas, sin guardarlo aparte.
  const [salida, setSalida] = useState<{ accion: AccionSalida } | null>(null);
  const salidaEjecutada = useRef<typeof salida>(null);
  const reintentos = useRef(new Map<string, () => void>());
  const botonReintentar = useRef<HTMLButtonElement>(null);

  const fallidas = Object.keys(filas).filter((id) => filas[id]?.fallo);
  const fallos = fallidas.length;
  const guardando = Object.values(filas).some((f) => f.guardando);
  const esperando = salida !== null && guardando;
  const avisando = salida !== null && !guardando && fallos > 0;
  const lista = salida !== null && !guardando && fallos === 0;

  const alCambiarEstado = useCallback((materiaId: string, estado: EstadoGuardadoFila) => {
    setFilas((actuales) => ({ ...actuales, [materiaId]: estado }));
  }, []);

  useEffect(() => {
    if (!lista || salidaEjecutada.current === salida) return;
    salidaEjecutada.current = salida;
    if (salida?.accion === "volver") alVolver();
    else alTerminar();
  }, [lista, salida, alVolver, alTerminar]);

  useEffect(() => {
    if (avisando) botonReintentar.current?.focus();
  }, [avisando]);

  function reintentarFallidas() {
    fallidas.forEach((id) => reintentos.current.get(id)?.());
  }

  function salirIgual() {
    // Ya le avisamos y eligió salir: recargar después no le vuelve a preguntar por estas filas.
    almacen.resolverFilas(fallidas);
    setSalida(null);
    if (salida?.accion === "volver") alVolver();
    else alTerminar();
  }

  return (
    <div className="grilla">
      <p className="sub">
        Cada cambio se guarda solo. Las notas las cargás después, en cada materia.
      </p>
      {agruparMaterias(datos.materias).map((grupo) => (
        <section
          className="grilla-grupo"
          key={`${grupo.anio}-${grupo.cuatrimestre}`}
          aria-label={lugarMateria(grupo)}
        >
          <div className="group-t">
            <h3>{lugarMateria(grupo)}</h3>
            <span>
              {grupo.materias.length} materia{grupo.materias.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="list">
            {grupo.materias.map((materia) => (
              <FilaMateria
                key={materia.id}
                planId={datos.plan.id}
                materia={materia}
                estado={estadoDe(datos, materia.id)}
                alCambiarEstado={alCambiarEstado}
                reintentos={reintentos}
              />
            ))}
          </div>
        </section>
      ))}
      <div className="grilla-pie">
        {avisando ? (
          <div className="confirm grilla-aviso" role="alert">
            <span>
              {fallos === 1 ? "1 materia no se guardó" : `${fallos} materias no se guardaron`}
            </span>
            <span className="acciones">
              <button
                className="btn sm"
                type="button"
                ref={botonReintentar}
                onClick={reintentarFallidas}
              >
                Reintentar
              </button>
              <button className="btn sm danger" type="button" onClick={salirIgual}>
                Salir igual
              </button>
            </span>
          </div>
        ) : (
          <>
            {esperando ? (
              <p className="grilla-conteo" role="status">
                Terminando de guardar…
              </p>
            ) : (
              <p className="grilla-conteo">
                {ESTADOS_MATERIA.map((e) => `${ETIQUETAS_ESTADO[e]}: ${conteo[e]}`).join(" · ")}
              </p>
            )}
            <div className="acciones">
              <button
                className="btn ghost"
                type="button"
                disabled={esperando}
                onClick={() => setSalida({ accion: "volver" })}
              >
                Volver
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={esperando}
                onClick={() => setSalida({ accion: "terminar" })}
              >
                Listo, ir a Inicio
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
