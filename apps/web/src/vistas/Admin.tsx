import {
  PAGINA_ESTADO_SERVICIO,
  pasosEmbudo,
  type EmbudoOnboarding,
  type EstadoMonitor,
  type MetricasAdmin,
  type ReporteAdmin,
} from "@estudia/core";
import { useQuery } from "@tanstack/react-query";
import { urlPanelVisitas } from "../analitica/panelVisitas";
import { useRepositorio } from "../sesion/sesion";
import { EncabezadoVista, retardo } from "./comunes";

const CINCO_MINUTOS = 5 * 60 * 1000;

function Embudo({ embudo }: { embudo: EmbudoOnboarding }) {
  return (
    <section className="card rise" style={retardo(2)}>
      <h2>Embudo del onboarding</h2>
      <ol className="admin-embudo">
        {pasosEmbudo(embudo).map((paso) => (
          <li key={paso.etiqueta}>
            <div className="admin-embudo-fila">
              <span>{paso.etiqueta}</span>
              <span className="admin-embudo-valor">
                {paso.alumnos.toLocaleString("es-AR")}
                {paso.porcentaje !== null && <small> · {paso.porcentaje}%</small>}
              </span>
            </div>
            <div className="admin-embudo-barra" aria-hidden="true">
              <span style={{ width: `${paso.porcentaje ?? 0}%` }} />
            </div>
          </li>
        ))}
      </ol>
      <p className="sub admin-nota">
        Importaron un respaldo: cuenta desde el 17/11/2026. Los porcentajes son sobre los
        registrados.
      </p>
    </section>
  );
}

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
      <Embudo embudo={m.embudo} />
      <section className="card rise" style={retardo(3)}>
        <h2>Alumnos por plan activo</h2>
        {m.inscripcionesPorPlan.length === 0 ? (
          <p className="sub">Todavía nadie activó un plan.</p>
        ) : (
          <div className="admin-tabla-scroll">
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
          </div>
        )}
      </section>
    </>
  );
}

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

const ESTADOS: Record<EstadoMonitor, { texto: string; clase: string }> = {
  arriba: { texto: "Funciona", clase: "e-aprobada" },
  caido: { texto: "Caído", clase: "e-final" },
  pausado: { texto: "Pausado", clase: "e-pendiente" },
  sin_datos: { texto: "Sin datos", clase: "e-pendiente" },
};

const porcentaje = (n: number | null) =>
  n === null ? "—" : `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;

/** Una sola llamada a la Edge Function para las dos tarjetas (misma clave de consulta). */
function useEstadoServicio() {
  const repositorio = useRepositorio();
  return useQuery({
    queryKey: ["admin", "estado-servicio"],
    queryFn: () => repositorio.obtenerEstadoServicio(),
    staleTime: CINCO_MINUTOS,
    retry: false,
  });
}

const sinPunto = (texto: string) => texto.replace(/\.$/, "");

/** Si UptimeRobot o la función fallan, solo esta tarjeta avisa: el resto de #admin carga igual. */
function EstadoDelServicio() {
  const estado = useEstadoServicio();
  const uptime = estado.data?.uptime;
  const error = estado.error?.message ?? (uptime && "error" in uptime ? uptime.error : null);
  const datos = uptime && "monitores" in uptime ? uptime : null;
  return (
    <section className="card rise" style={retardo(4)} aria-labelledby="admin-estado">
      <h2 id="admin-estado">Estado del servicio</h2>
      {estado.isPending && <p className="sub">Cargando…</p>}
      {error && (
        <p className="msg err" role="status">
          {sinPunto(error)}. El resto de esta página no depende de esto.
        </p>
      )}
      {datos && (
        <>
          <div className="admin-tabla-scroll">
            <table className="admin-tabla">
              <thead>
                <tr>
                  <th scope="col">Monitor</th>
                  <th scope="col">Estado</th>
                  <th scope="col">7 días</th>
                  <th scope="col">30 días</th>
                </tr>
              </thead>
              <tbody>
                {datos.monitores.map((m) => (
                  <tr key={m.nombre}>
                    <td>{m.nombre}</td>
                    <td>
                      <span className={`admin-tipo ${ESTADOS[m.estado].clase}`}>
                        {ESTADOS[m.estado].texto}
                      </span>
                    </td>
                    <td>{porcentaje(m.uptime7)}</td>
                    <td>{porcentaje(m.uptime30)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub admin-nota">
            Datos de UptimeRobot del{" "}
            <time dateTime={datos.actualizado}>{FECHA.format(new Date(datos.actualizado))}</time>.
            Se actualizan cada 5 minutos.
          </p>
        </>
      )}
      <p className="admin-nota">
        <a href={PAGINA_ESTADO_SERVICIO} target="_blank" rel="noopener noreferrer">
          Página pública de estado
        </a>
      </p>
    </section>
  );
}

/**
 * Panel de Umami de solo lectura, embebido. El enlace lo devuelve la Edge Function solo al admin
 * (secreto de Supabase `UMAMI_SHARE_URL`): no está en el código.
 */
function Visitas() {
  const estado = useEstadoServicio();
  const url = urlPanelVisitas(estado.data?.panelVisitas ?? undefined);
  return (
    <section className="card rise" style={retardo(5)}>
      <h2>Visitas</h2>
      {estado.isPending ? (
        <p className="sub">Cargando…</p>
      ) : estado.error ? (
        <p className="msg err" role="status">
          No pude traer el panel de visitas: {sinPunto(estado.error.message)}.
        </p>
      ) : url ? (
        <>
          <iframe
            className="admin-visitas"
            src={url}
            title="Panel de visitas de Umami"
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
          <p className="admin-nota">
            <a href={url} target="_blank" rel="noopener noreferrer">
              Abrir el panel en otra pestaña
            </a>
          </p>
        </>
      ) : (
        <p className="sub">
          Falta configurar el secreto <code>UMAMI_SHARE_URL</code> en Supabase.
        </p>
      )}
    </section>
  );
}

function Reportes({ reportes }: { reportes: ReporteAdmin[] }) {
  return (
    <section className="card rise" style={retardo(6)}>
      <h2>Últimos reportes</h2>
      {reportes.length === 0 ? (
        <p className="sub">No hay reportes.</p>
      ) : (
        <ul className="admin-reportes">
          {reportes.map((r) => (
            <li key={r.id}>
              <p className="admin-reporte-meta">
                <span className={`admin-tipo ${r.tipo === "problema" ? "e-final" : "e-cursando"}`}>
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
      <EstadoDelServicio />
      <Visitas />
      {reportes.data && <Reportes reportes={reportes.data} />}
      {(metricas.isPending || reportes.isPending) && !error && <p className="sub">Cargando…</p>}
    </>
  );
}
