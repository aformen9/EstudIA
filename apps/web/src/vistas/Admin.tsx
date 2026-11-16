import type { MetricasAdmin, ReporteAdmin } from "@estudia/core";
import { useQuery } from "@tanstack/react-query";
import { useRepositorio } from "../sesion/sesion";
import { EncabezadoVista, retardo } from "./comunes";

/** Solo totales (decisión del 2026-11-16): nunca datos de un alumno. */
function Metricas({ m }: { m: MetricasAdmin }) {
  const datos: [string, number][] = [
    ["Alumnos", m.alumnos],
    ["Nuevos en 7 días", m.alumnosNuevos7Dias],
    ["Activos en 7 días", m.alumnosActivos7Dias],
    ["Con plan activo", m.alumnosConInscripcionActiva],
    ["Con materias cargadas", m.alumnosConMaterias],
    ["Materias con progreso", m.materiasConProgreso],
    ["Instancias", m.instancias],
    ["Materias propias", m.materiasPropias],
    ["Archivos", m.materiales.archivo],
    ["Links", m.materiales.link],
    ["Notas", m.materiales.nota],
    ["Documentos", m.documentos],
    ["Reportes", m.reportes],
    ["Reportes en 7 días", m.reportes7Dias],
  ];
  return (
    <>
      <section className="card rise" style={retardo(1)}>
        <h2>Totales</h2>
        <dl className="admin-datos">
          {datos.map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt>{etiqueta}</dt>
              <dd>{valor.toLocaleString("es-AR")}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="card rise" style={retardo(2)}>
        <h2>Alumnos por plan activo</h2>
        {m.inscripcionesPorPlan.length === 0 ? (
          <p className="sub">Todavía nadie activó un plan.</p>
        ) : (
          <table className="admin-tabla">
            <thead>
              <tr>
                <th scope="col">Universidad</th>
                <th scope="col">Carrera</th>
                <th scope="col">Plan</th>
                <th scope="col">Alumnos</th>
              </tr>
            </thead>
            <tbody>
              {m.inscripcionesPorPlan.map((fila) => (
                <tr key={`${fila.universidad}-${fila.carrera}-${fila.plan}`}>
                  <td>{fila.universidad ?? "—"}</td>
                  <td>{fila.carrera ?? "—"}</td>
                  <td>{fila.plan}</td>
                  <td>{fila.alumnos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

function Reportes({ reportes }: { reportes: ReporteAdmin[] }) {
  return (
    <section className="card rise" style={retardo(3)}>
      <h2>Últimos reportes</h2>
      {reportes.length === 0 ? (
        <p className="sub">No hay reportes.</p>
      ) : (
        <ul className="admin-reportes">
          {reportes.map((r) => (
            <li key={r.id}>
              <p className="admin-reporte-meta">
                <span className={`est ${r.tipo === "problema" ? "e-final" : "e-cursando"}`}>
                  {r.tipo === "problema" ? "Problema" : "Sugerencia"}
                </span>
                <time dateTime={r.createdAt}>{FECHA.format(new Date(r.createdAt))}</time>
                {r.vista && <span>en #{r.vista}</span>}
              </p>
              <p className="admin-reporte-texto">{r.texto}</p>
              <p className="admin-reporte-tec">
                {[r.navegador, r.sistema, r.versionApp && `versión ${r.versionApp}`]
                  .filter(Boolean)
                  .join(" · ")}
                {r.contacto && (
                  <>
                    {" · "}
                    <a href={`mailto:${r.contacto}`}>{r.contacto}</a>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Admin() {
  const repositorio = useRepositorio();
  const metricas = useQuery({
    queryKey: ["admin", "metricas"],
    queryFn: () => repositorio.obtenerMetricasAdmin(),
  });
  const reportes = useQuery({
    queryKey: ["admin", "reportes"],
    queryFn: () => repositorio.listarReportesAdmin(50),
  });
  const error = metricas.error ?? reportes.error;

  return (
    <>
      <EncabezadoVista seccion="Solo para admins" titulo="Admin" />
      {error && (
        <p className="msg err" role="alert">
          {error.message}
        </p>
      )}
      {metricas.data && <Metricas m={metricas.data} />}
      {reportes.data && <Reportes reportes={reportes.data} />}
      {(metricas.isPending || reportes.isPending) && !error && <p className="sub">Cargando…</p>}
    </>
  );
}
