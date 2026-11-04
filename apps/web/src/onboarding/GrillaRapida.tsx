import {
  conteoPorEstado,
  ESTADOS_MATERIA,
  estadoDe,
  type DatosAlumno,
  type EstadoMateria,
  type Materia,
} from "@estudia/core";
import { useId } from "react";
import { agruparMaterias, ETIQUETAS_ESTADO } from "../plan/presentacion";
import { useGuardarProgreso } from "../plan/useGuardarProgreso";

function FilaMateria({
  planId,
  materia,
  estado,
}: {
  planId: string;
  materia: Materia;
  estado: EstadoMateria;
}) {
  const { guardar, reintentar, error } = useGuardarProgreso(planId, materia.id);
  const idTitulo = useId();
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

/** Marca el estado de cada materia, sin notas. Cada cambio se guarda solo. */
export function GrillaRapida({
  datos,
  alVolver,
  alTerminar,
}: {
  datos: DatosAlumno;
  alVolver: () => void;
  alTerminar: () => void;
}) {
  const conteo = conteoPorEstado(datos);
  return (
    <div className="grilla">
      <p className="sub">
        Cada cambio se guarda solo. Las notas las cargás después, en cada materia.
      </p>
      {agruparMaterias(datos.materias).map(({ titulo, materias }) => (
        <section className="grilla-grupo" key={titulo} aria-label={titulo}>
          <div className="group-t">
            <h3>{titulo}</h3>
            <span>
              {materias.length} materia{materias.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="list">
            {materias.map((materia) => (
              <FilaMateria
                key={materia.id}
                planId={datos.plan.id}
                materia={materia}
                estado={estadoDe(datos, materia.id)}
              />
            ))}
          </div>
        </section>
      ))}
      <div className="grilla-pie">
        <p className="grilla-conteo">
          {ESTADOS_MATERIA.map((e) => `${ETIQUETAS_ESTADO[e]}: ${conteo[e]}`).join(" · ")}
        </p>
        <div className="acciones">
          <button className="btn ghost" type="button" onClick={alVolver}>
            Volver
          </button>
          <button className="btn primary" type="button" onClick={alTerminar}>
            Listo, ir a Inicio
          </button>
        </div>
      </div>
    </div>
  );
}
