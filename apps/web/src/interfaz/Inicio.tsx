import { progresoCarrera, promedio } from "@estudia/core";
import { VISTAS } from "../navegacion/rutas";
import { ConPlan } from "../plan/planActivo";
import { etiquetaPlan, formatoNota } from "../plan/presentacion";

/** Provisorio: el Inicio de la referencia llega en la tanda 3. Por ahora muestra que el plan cargó. */
export function Inicio() {
  return (
    <>
      <header className="view-h">
        <h1>{VISTAS.inicio}</h1>
      </header>
      <ConPlan>
        {(datos) => {
          const { porEstado, total } = progresoCarrera(datos);
          return (
            <section className="card rise">
              <h2>
                Llevás {porEstado.aprobada} de {total} materias aprobadas
              </h2>
              <p className="sub">
                {etiquetaPlan(datos)} · Promedio {formatoNota(promedio(datos, false).promedio)}
              </p>
            </section>
          );
        }}
      </ConPlan>
    </>
  );
}
