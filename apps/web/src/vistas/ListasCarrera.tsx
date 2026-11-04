import {
  dieces,
  estadoCorrelativas,
  materiasPorEstado,
  podesCursar,
  progresoDe,
  promedio,
  promocionadas,
  type DatosAlumno,
  type Materia,
} from "@estudia/core";
import { Icono } from "../interfaz/Iconos";
import { useAbrirMateria } from "../plan/abrirMateria";
import { ConPlan } from "../plan/planActivo";
import {
  cantidad,
  formatoFecha,
  formatoNota,
  lugarMateria,
  resumenFinal,
} from "../plan/presentacion";
import {
  CajaVacia,
  Contador,
  EncabezadoVista,
  FilaMateria,
  GruposDeMaterias,
  retardo,
} from "./comunes";

const SECCION = "Tu carrera";

function ContenidoAprobadas({ datos }: { datos: DatosAlumno }) {
  const aprobadas = materiasPorEstado(datos, "aprobada");
  const valorPromedio = promedio(datos, false).promedio;
  return (
    <>
      <section className="card rise" style={retardo(1)}>
        <div className="stat-row">
          <div>
            <span>Materias aprobadas</span>
            <b className="big-num k-ok">
              <Contador valor={aprobadas.length} />
            </b>
          </div>
          <div>
            <span>Promedio</span>
            <b className="big-num k-avg">
              <Contador
                valor={valorPromedio == null ? null : Math.round(valorPromedio * 100) / 100}
                decimales={2}
              />
            </b>
          </div>
          <div>
            <span>Dieces</span>
            <b className="big-num" style={{ color: "var(--accent)" }}>
              <Contador valor={dieces(datos).length} />
            </b>
          </div>
          <div>
            <span>Promocionadas</span>
            <b className="big-num" style={{ color: "var(--lav)" }}>
              <Contador valor={promocionadas(datos).length} />
            </b>
          </div>
        </div>
      </section>
      {aprobadas.length ? (
        <GruposDeMaterias datos={datos} materias={aprobadas} desde={2} />
      ) : (
        <CajaVacia
          icono="check"
          titulo="Todavía no hay aprobadas"
          texto="Cuando apruebes una materia, aparece acá."
        />
      )}
    </>
  );
}

export function Aprobadas() {
  return (
    <>
      <EncabezadoVista seccion={SECCION} titulo="Aprobadas" />
      <ConPlan>{(datos) => <ContenidoAprobadas datos={datos} />}</ConPlan>
    </>
  );
}

export function Cursando() {
  return (
    <>
      <EncabezadoVista seccion={SECCION} titulo="En curso" />
      <p className="sub rise" style={retardo(1)}>
        Cargá tus parciales en cada materia: cuando apruebes la cursada te sugiere pasarla a
        &quot;Final pendiente&quot;.
      </p>
      <ConPlan>
        {(datos) => {
          const lista = materiasPorEstado(datos, "cursando");
          return lista.length ? (
            <div className="list">
              {lista.map((materia, i) => (
                <FilaMateria key={materia.id} datos={datos} materia={materia} indice={i + 2} />
              ))}
            </div>
          ) : (
            <CajaVacia
              icono="clock"
              titulo="No tenés materias en curso"
              texto="Cuando te anotes, cambiá el estado de la materia a En curso."
            />
          );
        }}
      </ConPlan>
    </>
  );
}

function TarjetaFinal({
  datos,
  materia,
  indice,
}: {
  datos: DatosAlumno;
  materia: Materia;
  indice: number;
}) {
  const abrirMateria = useAbrirMateria();
  const rendir = estadoCorrelativas(datos, materia, "rendir");
  const notaCursada = progresoDe(datos, materia.id)?.notaCursada;
  const { cursadaAprobada, intentos } = resumenFinal(datos.historial, materia.id);
  return (
    <section className="card rise" style={retardo(indice)}>
      <div className="card-h">
        <div>
          <div className="eyebrow">{lugarMateria(materia)}</div>
          <h2>{materia.nombre}</h2>
        </div>
        {notaCursada != null && <span className="nota-cursada">{formatoNota(notaCursada)}</span>}
      </div>
      <p className="sub">
        Cursada aprobada{cursadaAprobada ? ` el ${formatoFecha(cursadaAprobada)}` : ""}
        {intentos.length > 0 &&
          ` · ${cantidad(intentos.length, "intento", "intentos")} de final (${intentos.join(", ")})`}
      </p>
      {rendir.ok ? (
        <span className="tag can">
          <Icono nombre="spark" />
          {rendir.vacio ? "Sin correlativas para rendir" : "Podés rendirla"}
        </span>
      ) : (
        <div className="alert">
          <Icono nombre="lock" />
          <p>
            Antes tenés que aprobar <b>{rendir.faltan.map((f) => f.materia.nombre).join(", ")}</b>.
          </p>
        </div>
      )}
      <button className="btn sm" type="button" onClick={() => abrirMateria(materia.id)}>
        Abrir materia <Icono nombre="arrow" />
      </button>
    </section>
  );
}

export function Finales() {
  return (
    <>
      <EncabezadoVista seccion={SECCION} titulo="Finales pendientes" />
      <ConPlan>
        {(datos) => {
          const lista = materiasPorEstado(datos, "final");
          return lista.length ? (
            <div className="grid2">
              {lista.map((materia, i) => (
                <TarjetaFinal key={materia.id} datos={datos} materia={materia} indice={i + 1} />
              ))}
            </div>
          ) : (
            <CajaVacia
              icono="flag"
              titulo="No tenés finales pendientes"
              texto="Todas las cursadas aprobadas ya tienen su final. 🎉"
            />
          );
        }}
      </ConPlan>
    </>
  );
}

function ContenidoPendientes({ datos }: { datos: DatosAlumno }) {
  const pendientes = materiasPorEstado(datos, "pendiente");
  if (!pendientes.length) {
    return (
      <CajaVacia
        icono="list"
        titulo="No te quedan materias pendientes"
        texto="¡Ya cursaste todo!"
      />
    );
  }
  const disponibles = podesCursar(datos);
  const idsDisponibles = new Set(disponibles.map((m) => m.id));
  const bloqueadas = pendientes.filter((m) => !idsDisponibles.has(m.id));
  let i = 1;
  return (
    <>
      <section className="grupo-materias" aria-label="Podés cursarlas">
        <div className="group-t rise" style={retardo(i++)}>
          <h3>Podés cursarlas</h3>
          <span>{disponibles.length}</span>
        </div>
        {disponibles.length ? (
          <div className="list">
            {disponibles.map((materia) => (
              <FilaMateria key={materia.id} datos={datos} materia={materia} indice={i++} />
            ))}
          </div>
        ) : (
          <p className="sub rise">Ninguna por ahora.</p>
        )}
      </section>
      <section className="grupo-materias" aria-label="Todavía no">
        <div className="group-t rise" style={retardo(i++)}>
          <h3>Todavía no</h3>
          <span>{bloqueadas.length}</span>
        </div>
        <div className="list">
          {bloqueadas.map((materia) => (
            <FilaMateria key={materia.id} datos={datos} materia={materia} indice={i++} />
          ))}
        </div>
      </section>
    </>
  );
}

export function Pendientes() {
  return (
    <>
      <EncabezadoVista seccion={SECCION} titulo="Pendientes" />
      <ConPlan>{(datos) => <ContenidoPendientes datos={datos} />}</ConPlan>
    </>
  );
}
