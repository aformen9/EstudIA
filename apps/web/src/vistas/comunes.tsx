import {
  estadoCorrelativas,
  progresoDe,
  estadoDe,
  type DatosAlumno,
  type Materia,
} from "@estudia/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icono, type NombreIcono } from "../interfaz/Iconos";
import { prefiereMenosMovimiento } from "../interfaz/efectos";
import { useAbrirMateria } from "../plan/abrirMateria";
import { consultas } from "../plan/planActivo";
import {
  agruparMaterias,
  cantidad,
  ETIQUETAS_ESTADO,
  formatoNota,
  lugarMateria,
} from "../plan/presentacion";
import { useRepositorio } from "../sesion/sesion";

const MAX_RETARDO = 14;
const DURACION_CONTADOR_MS = 1100;

/** Retardo de la aparición escalonada, con tope para que las listas largas no tarden en verse. */
export function retardo(i: number): CSSProperties {
  return { "--i": Math.min(i, MAX_RETARDO) } as CSSProperties;
}

function formatoFijo(valor: number, decimales: number): string {
  return valor.toLocaleString("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/** Número que sube desde 0, como `countUp` de la referencia. Sin valor muestra "–". */
export function Contador({ valor, decimales = 0 }: { valor: number | null; decimales?: number }) {
  const [mostrado, setMostrado] = useState(0);
  const animar = valor != null && !prefiereMenosMovimiento();

  useEffect(() => {
    if (!animar) return;
    const inicio = performance.now();
    let cuadro = requestAnimationFrame(function paso(ahora) {
      const avance = Math.min(1, (ahora - inicio) / DURACION_CONTADOR_MS);
      setMostrado(valor * (1 - Math.pow(1 - avance, 3)));
      if (avance < 1) cuadro = requestAnimationFrame(paso);
    });
    return () => cancelAnimationFrame(cuadro);
  }, [animar, valor]);

  if (valor == null) return <>–</>;
  return <>{formatoFijo(animar ? mostrado : valor, decimales)}</>;
}

export function EncabezadoVista({
  seccion,
  titulo,
  children,
}: {
  seccion: string;
  titulo: string;
  children?: ReactNode;
}) {
  return (
    <header className="view-h rise">
      <div>
        <div className="eyebrow">{seccion}</div>
        <h1>{titulo}</h1>
      </div>
      {children}
    </header>
  );
}

export function CajaVacia({
  icono,
  titulo,
  texto,
}: {
  icono: NombreIcono;
  titulo: string;
  texto: string;
}) {
  return (
    <section className="card empty rise">
      <span className="big">
        <Icono nombre={icono} />
      </span>
      <h3>{titulo}</h3>
      <p className="sub">{texto}</p>
    </section>
  );
}

function EtiquetaCorrelativas({ datos, materia }: { datos: DatosAlumno; materia: Materia }) {
  const estado = estadoDe(datos, materia.id);
  if (estado === "pendiente") {
    const cursar = estadoCorrelativas(datos, materia, "cursar");
    if (cursar.vacio) return null;
    return cursar.ok ? (
      <span className="tag can">
        <Icono nombre="spark" />
        Podés cursarla
      </span>
    ) : (
      <span className="tag lock">
        <Icono nombre="lock" />
        {cursar.n > 1 ? `Te faltan ${cursar.n} requisitos` : "Te falta 1 requisito"}
      </span>
    );
  }
  if (estado === "final" || estado === "cursando") {
    const rendir = estadoCorrelativas(datos, materia, "rendir");
    if (rendir.vacio) return null;
    if (rendir.ok) {
      return estado === "final" ? (
        <span className="tag can">
          <Icono nombre="spark" />
          Podés rendirla
        </span>
      ) : null;
    }
    return (
      <span className="tag lock">
        <Icono nombre="lock" />
        {rendir.n > 1 ? `Para rendir te faltan ${rendir.n}` : "Para rendir te falta 1"}
      </span>
    );
  }
  return null;
}

/** Fila de una materia en las listas, como `rowHTML` de la referencia. */
export function FilaMateria({
  datos,
  materia,
  indice,
  conLugar = true,
}: {
  datos: DatosAlumno;
  materia: Materia;
  indice: number;
  conLugar?: boolean;
}) {
  const repositorio = useRepositorio();
  const abrirMateria = useAbrirMateria();
  const { data: materiales } = useQuery(consultas.materiales(repositorio));
  const estado = estadoDe(datos, materia.id);
  const progreso = progresoDe(datos, materia.id);
  const cuantos = materiales?.filter((m) => m.materiaId === materia.id).length ?? 0;
  const anual = materia.anio !== 0 && materia.cuatrimestre == null;

  const meta: ReactNode[] = [];
  if (conLugar) meta.push(lugarMateria(materia));
  else if (anual) meta.push("Anual");
  if (progreso?.notaCursada != null && estado !== "aprobada") {
    meta.push(`cursada ${formatoNota(progreso.notaCursada)}`);
  }
  if (cuantos > 0) {
    meta.push(
      <span className="tag mat" key="material">
        <Icono nombre="folder" />
        {cuantos}
        <span className="sr-solo"> de material</span>
      </span>,
    );
  }

  return (
    <button
      className={`subj s-${estado} rise`}
      style={retardo(indice)}
      type="button"
      onClick={() => abrirMateria(materia.id)}
    >
      <span className="nm">
        <b>{materia.nombre}</b>
        {meta.length > 0 && (
          <small>
            {meta.map((parte, i) => (
              <span key={i}>
                {i > 0 && "· "}
                {parte}
              </span>
            ))}
          </small>
        )}
      </span>
      <EtiquetaCorrelativas datos={datos} materia={materia} />
      {estado === "aprobada" && progreso?.nota != null ? (
        <span className="grade">{formatoNota(progreso.nota)}</span>
      ) : (
        <span className={`pill p-${estado}`}>{ETIQUETAS_ESTADO[estado]}</span>
      )}
    </button>
  );
}

/** Materias por año y cuatrimestre, como `grouped` de la referencia. */
export function GruposDeMaterias({
  datos,
  materias,
  desde = 0,
}: {
  datos: DatosAlumno;
  materias: Materia[];
  desde?: number;
}) {
  let i = desde;
  return (
    <>
      {agruparMaterias(materias).map((grupo) => (
        <section className="grupo-materias" key={grupo.titulo} aria-label={grupo.titulo}>
          <div className="group-t rise" style={retardo(i++)}>
            <h3>{grupo.titulo}</h3>
            <span>{cantidad(grupo.materias.length, "materia", "materias")}</span>
          </div>
          <div className="list">
            {grupo.materias.map((materia) => (
              <FilaMateria
                key={materia.id}
                datos={datos}
                materia={materia}
                indice={i++}
                conLugar={false}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** Fila chica de las tarjetas de Inicio. */
export function Mini({
  materiaId,
  titulo,
  detalle,
  children,
}: {
  materiaId: string;
  titulo: string;
  detalle: string;
  children?: ReactNode;
}) {
  const abrirMateria = useAbrirMateria();
  return (
    <button className="mini" type="button" onClick={() => abrirMateria(materiaId)}>
      <span className="nm">
        {titulo}
        <small>{detalle}</small>
      </span>
      {children ?? <Icono nombre="arrow" />}
    </button>
  );
}
