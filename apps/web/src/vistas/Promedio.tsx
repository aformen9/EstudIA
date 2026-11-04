import {
  distribucionNotas,
  listaAplazos,
  notasDe,
  promedio,
  promedioEnElTiempo,
  promedioPorArea,
  promedioPorCuatrimestre,
  type DatosAlumno,
} from "@estudia/core";
import { ConPlan } from "../plan/planActivo";
import { cantidad, formatoNota } from "../plan/presentacion";
import { Contador, EncabezadoVista, Mini, retardo } from "./comunes";
import {
  GraficoDistribucion,
  GraficoEnElTiempo,
  GraficoPorArea,
  GraficoPorCuatrimestre,
} from "./Graficos";

function dosDecimales(valor: number | null): number | null {
  return valor == null ? null : Math.round(valor * 100) / 100;
}

function SinDatos({ texto = "Sin datos." }: { texto?: string }) {
  return <p className="sub">{texto}</p>;
}

function ContenidoPromedio({ datos, conAplazos }: { datos: DatosAlumno; conAplazos: boolean }) {
  const notas = notasDe(datos, conAplazos);
  const enElTiempo = promedioEnElTiempo(datos, conAplazos);
  const porCuatrimestre = promedioPorCuatrimestre(datos, conAplazos);
  const porArea = promedioPorArea(datos, conAplazos);
  const aplazos = listaAplazos(datos);
  return (
    <>
      <section
        className="card hero glass rise"
        style={{ ...retardo(1), gridTemplateColumns: "minmax(0, 1fr)" }}
      >
        <div className="stat-row">
          <div>
            <span>Promedio {conAplazos ? "con" : "sin"} aplazos</span>
            <b className="big-num" style={{ fontSize: "3.6rem", color: "var(--accent)" }}>
              <Contador valor={dosDecimales(promedio(datos, conAplazos).promedio)} decimales={2} />
            </b>
          </div>
          <div>
            <span>{conAplazos ? "Sin aplazos" : "Con aplazos"}</span>
            <b className="big-num k-avg">
              <Contador valor={dosDecimales(promedio(datos, !conAplazos).promedio)} decimales={2} />
            </b>
          </div>
          <div>
            <span>Notas que cuentan</span>
            <b className="big-num">
              <Contador valor={notas.length} />
            </b>
          </div>
          <div>
            <span>Aplazos</span>
            <b className="big-num k-fin">
              <Contador valor={aplazos.length} />
            </b>
          </div>
        </div>
        <p className="sub">
          Igual que SIU: cuenta la nota final de cada materia aprobada (examen o promoción).
          &quot;Con aplazos&quot; suma también los finales reprobados; los ausentes no cuentan.
        </p>
      </section>
      <section className="card rise" style={retardo(2)}>
        <div className="card-h">
          <h2>Tu promedio a lo largo del tiempo</h2>
          <span className="sub">acumulado, final por final</span>
        </div>
        {enElTiempo.length > 1 ? (
          <GraficoEnElTiempo puntos={enElTiempo} plan={datos.plan} />
        ) : (
          <SinDatos texto="Todavía no hay suficientes notas." />
        )}
      </section>
      <div className="grid2">
        <section className="card rise" style={retardo(3)}>
          <div className="card-h">
            <h2>Por cuatrimestre</h2>
          </div>
          {porCuatrimestre.length ? (
            <GraficoPorCuatrimestre filas={porCuatrimestre} plan={datos.plan} />
          ) : (
            <SinDatos />
          )}
        </section>
        <section className="card rise" style={retardo(4)}>
          <div className="card-h">
            <h2>Distribución de notas</h2>
            <span className="sub">{cantidad(notas.length, "nota", "notas")}</span>
          </div>
          <GraficoDistribucion barras={distribucionNotas(datos, conAplazos)} />
        </section>
      </div>
      <div className="grid2">
        <section className="card rise" style={retardo(5)}>
          <div className="card-h">
            <h2>Por área</h2>
          </div>
          {porArea.length ? <GraficoPorArea filas={porArea} plan={datos.plan} /> : <SinDatos />}
        </section>
        <section className="card rise" style={retardo(6)}>
          <div className="card-h">
            <h2>Aplazos</h2>
          </div>
          {aplazos.length ? (
            <div className="mini-list">
              {aplazos.map(({ materia, nota, notaMateria }, i) => (
                <Mini
                  key={`${materia.id}-${i}`}
                  materiaId={materia.id}
                  titulo={materia.nombre}
                  detalle={
                    notaMateria == null
                      ? "todavía sin aprobar"
                      : `después aprobada con ${formatoNota(notaMateria)}`
                  }
                >
                  <span className="pill p-final">{formatoNota(nota)}</span>
                </Mini>
              ))}
            </div>
          ) : (
            <p className="sub">No tenés aplazos. 💪</p>
          )}
        </section>
      </div>
    </>
  );
}

export function Promedio({
  conAplazos,
  alCambiar,
}: {
  conAplazos: boolean;
  alCambiar: (conAplazos: boolean) => void;
}) {
  return (
    <>
      <EncabezadoVista seccion="Tu carrera" titulo="Promedio">
        <div className="seg" role="group" aria-label="Cómo calcular">
          <button
            type="button"
            className={conAplazos ? undefined : "on"}
            aria-pressed={!conAplazos}
            onClick={() => alCambiar(false)}
          >
            Sin aplazos
          </button>
          <button
            type="button"
            className={conAplazos ? "on" : undefined}
            aria-pressed={conAplazos}
            onClick={() => alCambiar(true)}
          >
            Con aplazos
          </button>
        </div>
      </EncabezadoVista>
      <ConPlan>
        {/* Con `key`, al cambiar de cálculo los gráficos se vuelven a dibujar, como en la referencia. */}
        {(datos) => (
          <ContenidoPromedio key={String(conAplazos)} datos={datos} conAplazos={conAplazos} />
        )}
      </ConPlan>
    </>
  );
}
