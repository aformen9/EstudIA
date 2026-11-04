import {
  alertaAnioCompleto,
  conteoPorEstado,
  estadoCorrelativas,
  materiasPorEstado,
  podesCursar,
  progresoCarrera,
  promedio,
  type DatosAlumno,
  type Material,
} from "@estudia/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ImportarRespaldo } from "../importacion/ImportarRespaldo";
import { Icono, type NombreIcono } from "../interfaz/Iconos";
import { prefiereMenosMovimiento } from "../interfaz/efectos";
import { VISTAS, type Vista } from "../navegacion/rutas";
import { GrillaRapida } from "../onboarding/GrillaRapida";
import { useAbrirMateria } from "../plan/abrirMateria";
import { ConPlan, consultas } from "../plan/planActivo";
import {
  enumerar,
  etiquetaPlan,
  extensionDeArchivo,
  formatoNota,
  lugarMateria,
  materialesRecientes,
  saludoDeHora,
  sinDatosCargados,
} from "../plan/presentacion";
import { useRepositorio } from "../sesion/sesion";
import { Contador, Mini, retardo } from "./comunes";

const RADIO_ANILLO = 74;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO_ANILLO;
const CANTIDAD_DISPONIBLES = 5;
const CANTIDAD_MATERIAL = 4;

function Anillo({ aprobado, cursado }: { aprobado: number; cursado: number }) {
  // Sin movimiento arranca en el valor final; si no, el arco se dibuja desde cero.
  const [dibujado, setDibujado] = useState(prefiereMenosMovimiento);
  useEffect(() => {
    if (dibujado) return;
    const cuadro = requestAnimationFrame(() => setDibujado(true));
    return () => cancelAnimationFrame(cuadro);
  }, [dibujado]);

  const desplazamiento = (porcentaje: number) =>
    dibujado ? CIRCUNFERENCIA * (1 - porcentaje / 100) : CIRCUNFERENCIA;
  const arco = { cx: 86, cy: 86, r: RADIO_ANILLO, strokeWidth: 14 };

  return (
    <div className="ring">
      <svg viewBox="0 0 172 172" aria-hidden="true">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent-2)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <circle className="track" {...arco} />
        <circle
          className="arc a2"
          {...arco}
          strokeDasharray={CIRCUNFERENCIA}
          style={{ strokeDashoffset: desplazamiento(cursado) }}
        />
        <circle
          className="arc a1"
          {...arco}
          strokeDasharray={CIRCUNFERENCIA}
          style={{ strokeDashoffset: desplazamiento(aprobado) }}
        />
        <g
          className="cg"
          style={{ transform: `rotate(${dibujado ? (360 * aprobado) / 100 : 0}deg)` }}
        >
          <circle className="comet" cx={86 + RADIO_ANILLO} cy="86" r="4.5" />
        </g>
      </svg>
      <div className="ring-c">
        <b>
          <Contador valor={aprobado} />
        </b>
        <span>% aprobado</span>
      </div>
    </div>
  );
}

function Portada({ datos }: { datos: DatosAlumno }) {
  const repositorio = useRepositorio();
  const { data: perfil } = useQuery(consultas.perfil(repositorio));
  const { total, porEstado, porcentajeAprobado, porcentajeCursado } = progresoCarrera(datos);
  const nombre = perfil?.nombre?.trim().split(" ")[0];
  const saludo = saludoDeHora(new Date().getHours());
  return (
    <section className="card hero glass tilt rise">
      <Anillo aprobado={porcentajeAprobado} cursado={porcentajeCursado} />
      <div className="hero-txt">
        <div>
          <div className="eyebrow">
            {saludo}
            {nombre ? `, ${nombre}` : ""}
          </div>
          <h2>
            Llevás{" "}
            <span className="grad">
              {porEstado.aprobada} de {total}
            </span>{" "}
            materias aprobadas
          </h2>
        </div>
        <p className="sub">{etiquetaPlan(datos)}</p>
        <div className="legend">
          <span>
            <i style={{ background: "var(--accent)" }}></i>
            {porcentajeAprobado} % aprobado
          </span>
          <span>
            <i style={{ background: "color-mix(in srgb, var(--accent-2) 40%, transparent)" }}></i>
            {porcentajeCursado} % cursado
          </span>
        </div>
      </div>
    </section>
  );
}

function Kpi({
  vista,
  clase,
  icono,
  numero,
  decimales,
  pie,
  indice,
}: {
  vista: Vista;
  clase: string;
  icono: NombreIcono;
  numero: number | null;
  decimales?: number;
  pie: string;
  indice: number;
}) {
  return (
    <a href={`#${vista}`} className={`kpi tilt ${clase} rise`} style={retardo(indice)}>
      <span className="ico">
        <Icono nombre={icono} />
      </span>
      <span className="lbl">{VISTAS[vista]}</span>
      <span className="num">
        <Contador valor={numero} decimales={decimales} />
      </span>
      <span className="foot">{pie}</span>
    </a>
  );
}

function Kpis({ datos }: { datos: DatosAlumno }) {
  const conteo = conteoPorEstado(datos);
  const sinAplazos = promedio(datos, false).promedio;
  const conAplazos = promedio(datos, true).promedio;
  return (
    <div className="kpis">
      <Kpi
        vista="aprobadas"
        clase="k-ok"
        icono="check"
        numero={conteo.aprobada}
        pie={`de ${datos.materias.length} materias`}
        indice={1}
      />
      <Kpi
        vista="cursando"
        clase="k-cur"
        icono="clock"
        numero={conteo.cursando}
        pie="este cuatrimestre"
        indice={2}
      />
      <Kpi
        vista="finales"
        clase="k-fin"
        icono="flag"
        numero={conteo.final}
        pie="cursada aprobada"
        indice={3}
      />
      <Kpi
        vista="pendientes"
        clase="k-pend"
        icono="list"
        numero={conteo.pendiente}
        pie="por cursar"
        indice={4}
      />
      <Kpi
        vista="promedio"
        clase="k-avg"
        icono="chart"
        numero={sinAplazos == null ? null : Math.round(sinAplazos * 100) / 100}
        decimales={2}
        pie={`con aplazos ${formatoNota(conAplazos)}`}
        indice={5}
      />
    </div>
  );
}

function Tarjeta({
  titulo,
  vista,
  indice,
  children,
}: {
  titulo: string;
  vista: Vista;
  indice: number;
  children: ReactNode;
}) {
  return (
    <section className="card rise" style={retardo(indice)}>
      <div className="card-h">
        <h2>{titulo}</h2>
        <a className="btn sm ghost" href={`#${vista}`} aria-label={`Ver todo: ${titulo}`}>
          Ver todo <Icono nombre="arrow" />
        </a>
      </div>
      {children}
    </section>
  );
}

function IconoMaterial({ material }: { material: Material }) {
  return (
    <span className={`ftype ${material.tipo}`}>
      {material.tipo === "archivo" ? (
        extensionDeArchivo(material.titulo)
      ) : (
        <Icono nombre={material.tipo === "link" ? "link" : "note"} />
      )}
    </span>
  );
}

function FilaMaterial({ datos, material }: { datos: DatosAlumno; material: Material }) {
  const abrirMateria = useAbrirMateria();
  const materia = datos.materias.find((m) => m.id === material.materiaId);
  const contenido = (
    <>
      <IconoMaterial material={material} />
      <span className="nm">
        {material.titulo}
        <small>
          {materia?.nombre ?? (material.materiaId === null ? "Sin materia" : "De otro plan")}
        </small>
      </span>
    </>
  );
  // Sin una materia de este plan para abrir, lleva a la lista de materiales.
  if (!materia) {
    return (
      <a className="mini" href="#materiales">
        {contenido}
      </a>
    );
  }
  return (
    <button className="mini" type="button" onClick={() => abrirMateria(materia.id)}>
      {contenido}
    </button>
  );
}

function MaterialReciente({ datos }: { datos: DatosAlumno }) {
  const repositorio = useRepositorio();
  const consulta = useQuery(consultas.materiales(repositorio));
  if (!consulta.data) {
    if (consulta.error) {
      return (
        <>
          <p className="msg err" role="alert">
            No pude leer tu material: {consulta.error.message}
          </p>
          <div className="acciones">
            <button className="btn sm" type="button" onClick={() => void consulta.refetch()}>
              Reintentar
            </button>
          </div>
        </>
      );
    }
    return <p className="sub">Cargando…</p>;
  }
  const recientes = materialesRecientes(consulta.data, CANTIDAD_MATERIAL);
  if (!recientes.length) {
    return (
      <p className="sub">Subí apuntes, links o notas desde cada materia o desde Materiales.</p>
    );
  }
  return (
    <div className="mini-list">
      {recientes.map((material) => (
        <FilaMaterial key={material.id} datos={datos} material={material} />
      ))}
    </div>
  );
}

function detalleFinal(datos: DatosAlumno, materia: DatosAlumno["materias"][number]): string {
  const { ok, faltan } = estadoCorrelativas(datos, materia, "rendir");
  if (ok) return "Podés rendirla";
  return `Antes tenés que aprobar ${faltan.map((f) => f.materia.nombre).join(", ")}`;
}

function Panorama({ datos, alCargar, alImportar }: { datos: DatosAlumno } & AccionesCarga) {
  const finales = materiasPorEstado(datos, "final");
  const enCurso = materiasPorEstado(datos, "cursando");
  const disponibles = podesCursar(datos).slice(0, CANTIDAD_DISPONIBLES);
  const alerta = alertaAnioCompleto(datos);
  return (
    <>
      <Portada datos={datos} />
      {sinDatosCargados(datos) && <AccesosDeCarga alCargar={alCargar} alImportar={alImportar} />}
      <Kpis datos={datos} />
      {alerta && (
        <div className="alert rise" style={retardo(6)}>
          <Icono nombre="lock" />
          <p>
            <b>
              Para cursar {alerta.anioBloqueado}° año necesitás todo {alerta.anioRequerido}° año
              aprobado.
            </b>{" "}
            Te falta{alerta.pendientes.length > 1 ? "n" : ""}:{" "}
            {enumerar(alerta.pendientes.map((m) => m.nombre))}.
          </p>
        </div>
      )}
      <div className="grid2">
        <Tarjeta titulo="Finales por rendir" vista="finales" indice={7}>
          {finales.length ? (
            <div className="mini-list">
              {finales.map((m) => (
                <Mini
                  key={m.id}
                  materiaId={m.id}
                  titulo={m.nombre}
                  detalle={detalleFinal(datos, m)}
                />
              ))}
            </div>
          ) : (
            <p className="sub">No tenés finales pendientes. 🎉</p>
          )}
        </Tarjeta>
        <Tarjeta titulo="Este cuatrimestre" vista="cursando" indice={8}>
          {enCurso.length ? (
            <div className="mini-list">
              {enCurso.map((m) => (
                <Mini key={m.id} materiaId={m.id} titulo={m.nombre} detalle={lugarMateria(m)} />
              ))}
            </div>
          ) : (
            <p className="sub">No tenés materias en curso.</p>
          )}
        </Tarjeta>
        <Tarjeta titulo="Podés anotarte" vista="pendientes" indice={9}>
          {disponibles.length ? (
            <div className="mini-list">
              {disponibles.map((m) => (
                <Mini key={m.id} materiaId={m.id} titulo={m.nombre} detalle={lugarMateria(m)} />
              ))}
            </div>
          ) : (
            <p className="sub">Por ahora ninguna materia pendiente tiene todas sus correlativas.</p>
          )}
        </Tarjeta>
        <Tarjeta titulo="Material reciente" vista="materiales" indice={10}>
          <MaterialReciente datos={datos} />
        </Tarjeta>
      </div>
    </>
  );
}

interface AccionesCarga {
  alCargar: () => void;
  alImportar: () => void;
}

/** Para quien tiene plan activo y nada cargado, por ejemplo si recargó en el último paso del onboarding. */
function AccesosDeCarga({ alCargar, alImportar }: AccionesCarga) {
  return (
    <section className="card onboarding rise">
      <h2>Todavía no cargaste tus materias</h2>
      <div className="caminos">
        <button className="camino" type="button" onClick={alCargar}>
          <b>Cargar materias</b>
          <small>Marcás el estado de cada materia, sin notas.</small>
        </button>
        <button className="camino" type="button" onClick={alImportar}>
          <b>Importar respaldo</b>
          <small>Un archivo .json de EstudIA o de Mi Plan de Estudio.</small>
        </button>
      </div>
    </section>
  );
}

type Subvista = "grilla" | "importar";

const TITULOS_SUBVISTA: Record<Subvista, string> = {
  grilla: "Marcá cómo vas en cada materia",
  importar: "Importá tu respaldo",
};

function CargaDeDatos({
  datos,
  subvista,
  alSalir,
}: {
  datos: DatosAlumno;
  subvista: Subvista;
  alSalir: () => void;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);
  return (
    <section className="card onboarding rise">
      <h2 ref={titulo} tabIndex={-1}>
        {TITULOS_SUBVISTA[subvista]}
      </h2>
      {subvista === "grilla" ? (
        <GrillaRapida datos={datos} alVolver={alSalir} alTerminar={alSalir} />
      ) : (
        <ImportarRespaldo datos={datos} alCancelar={alSalir} alTerminar={alSalir} />
      )}
    </section>
  );
}

/**
 * La carga desde Inicio es una subvista y no una ruta: al recargar se vuelve a Inicio, que decide
 * de nuevo si mostrar los accesos, así que nadie queda en un paso sin salida.
 */
export function Inicio() {
  const [subvista, setSubvista] = useState<Subvista | null>(null);
  const encabezado = useRef<HTMLHeadingElement>(null);

  function salirDeSubvista() {
    setSubvista(null);
    // El control que tenía el foco desaparece: que no se pierda en la página.
    encabezado.current?.focus();
  }

  return (
    <>
      {/* La referencia no muestra el nombre de esta vista: el título visible es el de la portada. */}
      <h1 className="sr-solo" ref={encabezado} tabIndex={-1}>
        {VISTAS.inicio}
      </h1>
      <ConPlan>
        {(datos) =>
          subvista ? (
            <CargaDeDatos datos={datos} subvista={subvista} alSalir={salirDeSubvista} />
          ) : (
            <Panorama
              datos={datos}
              alCargar={() => setSubvista("grilla")}
              alImportar={() => setSubvista("importar")}
            />
          )
        }
      </ConPlan>
    </>
  );
}
