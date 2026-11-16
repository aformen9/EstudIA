import {
  agruparPorArchivo,
  estadoDe,
  materialesDeMateria,
  materialesDelPlan,
  type DatosAlumno,
  type Material,
  type Materia,
  type TarjetaMaterial as Tarjeta,
} from "@estudia/core";
import { useId, useState, type MouseEvent, type ReactNode } from "react";
import { Dialogo } from "../interfaz/Dialogo";
import { Icono } from "../interfaz/Iconos";
import { SelectorMateria, type OpcionGeneral } from "../interfaz/SelectorMateria";
import { useBorrados } from "../materiales/borradosPendientes";
import { AccionMaterial, SeccionMaterial } from "../materiales/ComponentesMaterial";
import { IconoMaterial } from "../materiales/IconoMaterial";
import { AgregarAMateria, opcionesDeMaterias } from "../materiales/ReferenciasMaterial";
import { useAccionesMaterial, useMaterialesDelAlumno } from "../materiales/useMateriales";
import { VistaPrevia } from "../materiales/VistaPrevia";
import { useAbrirMateria, useAviso } from "../plan/abrirMateria";
import { ConPlan, ErrorDeCarga } from "../plan/planActivo";
import { formatoFecha, formatoPeso, ICONO_ESTADO } from "../plan/presentacion";
import { CajaVacia, EncabezadoVista, retardo } from "./comunes";
import type { FiltrosMateriales, TipoFiltro } from "./filtros";

const TIPOS: [TipoFiltro, string][] = [
  ["todo", "Todo"],
  ["archivo", "Archivos"],
  ["link", "Links"],
  ["nota", "Notas"],
];

function textosDe(material: Material, nombreMateria: string | undefined): string[] {
  return [
    material.titulo,
    material.tipo === "nota" ? material.texto : "",
    material.tipo === "link" ? material.url : "",
    nombreMateria ?? "",
  ];
}

/** Valores del filtro que no son materias. Ningún uuid de materia los usa. */
const TODAS = "";
const SIN_MATERIA = "sin-materia";
const GENERALES: OpcionGeneral[] = [
  { id: TODAS, texto: "Todas las materias", icono: "folder" },
  { id: SIN_MATERIA, texto: "Sin materia", icono: "file" },
];

/** Lo que dice el aviso al borrar: con varias materias, de cuántas se borró. */
function textoDeBorrado(materiasConArchivo: number): string | undefined {
  return materiasConArchivo > 1 ? `Borrado de ${materiasConArchivo} materias ·` : undefined;
}

/** Saca el foco del botón que desaparece con la tarjeta: va a la tarjeta vecina o al contenido. */
function moverFoco(boton: HTMLElement) {
  const tarjeta = boton.closest("[data-material]");
  const vecina = tarjeta?.nextElementSibling ?? tarjeta?.previousElementSibling;
  (
    vecina?.querySelector<HTMLElement>(".txt-b") ??
    boton.closest<HTMLElement>("dialog") ??
    document.querySelector<HTMLElement>("main")
  )?.focus();
}

function EtiquetaMateria({
  datos,
  materia,
  referencia,
  esLaUltima,
}: {
  datos: DatosAlumno;
  materia: Materia;
  referencia: Material;
  esLaUltima: boolean;
}) {
  const abrirMateria = useAbrirMateria();
  const avisar = useAviso();
  const borrados = useBorrados();
  const { mover } = useAccionesMaterial();
  const estado = estadoDe(datos, materia.id);

  async function quitar(evento: MouseEvent<HTMLButtonElement>) {
    // La última materia no se borra: el archivo queda "sin materia".
    if (esLaUltima) {
      try {
        await mover(referencia, null);
        avisar(`“${referencia.titulo}” quedó sin materia.`);
      } catch (error) {
        avisar(
          `No pude quitarlo de ${materia.nombre}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return;
    }
    moverFoco(evento.currentTarget);
    borrados?.pedir(referencia, `Lo quitaste de ${materia.nombre} ·`);
  }

  return (
    <span className={`tagm e-${estado}`}>
      <Icono nombre={ICONO_ESTADO[estado]} />
      <button
        className="n"
        type="button"
        title={materia.nombre}
        onClick={() => abrirMateria(materia.id)}
      >
        {materia.nombre}
      </button>
      <button
        className="tagm-x"
        type="button"
        aria-label={`Quitar de ${materia.nombre}`}
        onClick={(e) => void quitar(e)}
      >
        <Icono nombre="x" />
      </button>
    </span>
  );
}

function Resaltado({ texto, buscado }: { texto: string; buscado: string }): ReactNode {
  const inicio = buscado ? texto.toLowerCase().indexOf(buscado) : -1;
  if (inicio < 0) return texto;
  return (
    <>
      {texto.slice(0, inicio)}
      <mark>{texto.slice(inicio, inicio + buscado.length)}</mark>
      {texto.slice(inicio + buscado.length)}
    </>
  );
}

function TarjetaMaterial({
  tarjeta,
  datos,
  materias,
  todos,
  buscado,
  indice,
  alFallar,
}: {
  tarjeta: Tarjeta;
  datos: DatosAlumno;
  materias: Map<string, Materia>;
  todos: Material[];
  buscado: string;
  indice: number;
  alFallar: (mensaje: string) => void;
}) {
  const avisar = useAviso();
  const borrados = useBorrados();
  const { principal: material, referencias } = tarjeta;
  const peso = material.tipo === "archivo" ? formatoPeso(material.documento.bytes) : "";
  const conMateria = referencias.flatMap((referencia) => {
    const materia = referencia.materiaId ? materias.get(referencia.materiaId) : undefined;
    return materia ? [{ referencia, materia }] : [];
  });
  const esArchivo = material.tipo === "archivo";

  function borrar(evento: MouseEvent<HTMLButtonElement>) {
    moverFoco(evento.currentTarget);
    borrados?.pedir(referencias, textoDeBorrado(conMateria.length));
  }

  return (
    <div
      className="mcard rise"
      style={retardo(indice + 3)}
      data-material={referencias.map((r) => r.id).join(" ")}
    >
      {material.tipo === "archivo" && <VistaPrevia material={material} />}
      <div className="mcard-top">
        {!esArchivo && <IconoMaterial material={material} />}
        <div className="t">
          <b title={material.titulo}>
            <Resaltado texto={material.titulo} buscado={buscado} />
          </b>
          <small>{[formatoFecha(material.createdAt), peso].filter(Boolean).join(" · ")}</small>
        </div>
      </div>
      {material.tipo === "nota" && (
        <div className="note-txt">
          <Resaltado texto={material.texto} buscado={buscado} />
        </div>
      )}
      <div className="tags">
        {conMateria.length ? (
          conMateria.map(({ referencia, materia }) => (
            <EtiquetaMateria
              key={referencia.id}
              datos={datos}
              materia={materia}
              referencia={referencia}
              esLaUltima={referencias.length === 1}
            />
          ))
        ) : (
          <span className="tagm sin">Sin materia</span>
        )}
        <AgregarAMateria
          material={material}
          todos={todos}
          datos={datos}
          alAvisar={avisar}
          clase="tag-mas"
        />
      </div>
      <div className="pie">
        <AccionMaterial material={material} alFallar={alFallar} />
        <button
          className="txt-b"
          type="button"
          aria-label={`${esArchivo ? "Borrar archivo" : "Borrar"} ${material.titulo}`}
          onClick={borrar}
        >
          {esArchivo ? "Borrar archivo" : "Borrar"}
        </button>
      </div>
    </div>
  );
}

/** La materia se elige entre las del plan activo; las que están en curso van primero. */
function DialogoSubir({
  datos,
  materiales,
  todos,
  inicial,
  alCerrar,
}: {
  datos: DatosAlumno;
  materiales: Material[];
  todos: Material[];
  inicial: string;
  alCerrar: () => void;
}) {
  const idTitulo = useId();
  const idSelector = useId();
  const opciones = opcionesDeMaterias(datos, datos.materias);
  const primera = opciones.find((o) => o.estado === "cursando") ?? opciones[0];
  const [materiaId, setMateriaId] = useState(
    opciones.some((o) => o.id === inicial) ? inicial : (primera?.id ?? ""),
  );
  return (
    <Dialogo idTitulo={idTitulo} alCerrar={alCerrar}>
      <div className="dlg">
        <div className="dlg-head">
          <div>
            <div className="eyebrow">Materiales</div>
            <h3 id={idTitulo}>Subir material</h3>
          </div>
          <button className="icon-btn" type="button" aria-label="Cerrar" onClick={alCerrar}>
            <Icono nombre="x" />
          </button>
        </div>
        {opciones.length ? (
          <>
            <div className="field">
              <span className="etiqueta" id={idSelector}>
                ¿De qué materia es?
              </span>
              <SelectorMateria
                idEtiqueta={idSelector}
                opciones={opciones}
                valor={materiaId}
                alCambiar={setMateriaId}
              />
            </div>
            <div className="sec">
              <SeccionMaterial
                materiaId={materiaId}
                materiales={materialesDeMateria(materiales, materiaId)}
                todos={todos}
                datos={datos}
              />
            </div>
          </>
        ) : (
          <p className="sub">Este plan todavía no tiene materias.</p>
        )}
      </div>
    </Dialogo>
  );
}

function ContenidoMateriales({
  datos,
  todos,
  filtros,
  alCambiar,
}: {
  datos: DatosAlumno;
  todos: Material[];
  filtros: FiltrosMateriales;
  alCambiar: (cambios: Partial<FiltrosMateriales>) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const materiales = materialesDelPlan(todos, datos.materias);
  const materias = new Map(datos.materias.map((m) => [m.id, m]));
  const nombreDe = (material: Material) =>
    material.materiaId ? materias.get(material.materiaId)?.nombre : undefined;

  const buscado = filtros.busqueda.trim().toLowerCase();
  const tarjetas = agruparPorArchivo(materiales);
  const enLaMateria = (t: Tarjeta) =>
    filtros.materiaId === TODAS ||
    t.referencias.some((m) =>
      filtros.materiaId === SIN_MATERIA ? m.materiaId === null : m.materiaId === filtros.materiaId,
    );
  const lista = tarjetas.filter(
    (t) =>
      (filtros.tipo === "todo" || t.principal.tipo === filtros.tipo) &&
      enLaMateria(t) &&
      (!buscado ||
        t.referencias.some((m) =>
          textosDe(m, nombreDe(m)).some((texto) => texto.toLowerCase().includes(buscado)),
        )),
  );
  const conMaterial = [...new Set(materiales.map((m) => m.materiaId))].flatMap((id) => {
    const materia = id ? materias.get(id) : undefined;
    return materia ? [materia] : [];
  });
  const cuantos = (tipo: TipoFiltro) =>
    tipo === "todo" ? tarjetas.length : tarjetas.filter((t) => t.principal.tipo === tipo).length;
  const idFiltro = useId();

  return (
    <>
      <EncabezadoVista seccion="Estudio" titulo="Materiales">
        <button className="btn primary" type="button" onClick={() => setSubiendo(true)}>
          <Icono nombre="upload" />
          Subir material
        </button>
      </EncabezadoVista>
      <div className="row-tools rise" style={retardo(1)}>
        <label className="search">
          <Icono nombre="search" />
          <input
            className="input"
            type="search"
            placeholder="Buscar en títulos, notas y materias…"
            aria-label="Buscar en títulos, notas y materias"
            value={filtros.busqueda}
            onChange={(e) => alCambiar({ busqueda: e.target.value })}
          />
        </label>
        <div className="filtro-materia">
          <span className="sr-solo" id={idFiltro}>
            Filtrar por materia
          </span>
          <SelectorMateria
            idEtiqueta={idFiltro}
            flotante
            tituloCelular="Filtrar por materia"
            generales={GENERALES}
            opciones={opcionesDeMaterias(datos, conMaterial)}
            valor={filtros.materiaId}
            alCambiar={(materiaId) => alCambiar({ materiaId })}
          />
        </div>
      </div>
      <div className="seg seg-materiales rise" style={retardo(2)} role="group" aria-label="Tipo">
        {TIPOS.map(([tipo, texto]) => (
          <button
            key={tipo}
            type="button"
            className={filtros.tipo === tipo ? "on" : undefined}
            aria-pressed={filtros.tipo === tipo}
            onClick={() => alCambiar({ tipo })}
          >
            {texto} <span className="muted">{cuantos(tipo)}</span>
          </button>
        ))}
      </div>
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
      {!materiales.length ? (
        <CajaVacia
          icono="folder"
          titulo="Todavía no subiste material"
          texto="Subí PDFs, apuntes, fotos, links a clases grabadas o notas, y encontralos acá."
        />
      ) : lista.length ? (
        <div className="mat-grid">
          {lista.map((tarjeta, i) => (
            <TarjetaMaterial
              key={tarjeta.clave}
              tarjeta={tarjeta}
              datos={datos}
              materias={materias}
              todos={todos}
              buscado={buscado}
              indice={i}
              alFallar={setError}
            />
          ))}
        </div>
      ) : (
        <CajaVacia
          icono="search"
          titulo="Sin resultados"
          texto="Probá con otra palabra o sacá los filtros."
        />
      )}
      {subiendo && (
        <DialogoSubir
          datos={datos}
          materiales={materiales}
          todos={todos}
          inicial={filtros.materiaId === SIN_MATERIA ? TODAS : filtros.materiaId}
          alCerrar={() => setSubiendo(false)}
        />
      )}
    </>
  );
}

export function Materiales({
  filtros,
  alCambiar,
}: {
  filtros: FiltrosMateriales;
  alCambiar: (cambios: Partial<FiltrosMateriales>) => void;
}) {
  const consulta = useMaterialesDelAlumno();
  return (
    <ConPlan>
      {(datos) => {
        if (consulta.data) {
          return (
            <ContenidoMateriales
              datos={datos}
              todos={consulta.data}
              filtros={filtros}
              alCambiar={alCambiar}
            />
          );
        }
        return (
          <>
            <EncabezadoVista seccion="Estudio" titulo="Materiales" />
            {consulta.error ? (
              <ErrorDeCarga
                mensaje={`No pude leer tu material: ${consulta.error.message}`}
                reintentar={() => void consulta.refetch()}
              />
            ) : (
              <p className="sub" role="status">
                Cargando…
              </p>
            )}
          </>
        );
      }}
    </ConPlan>
  );
}
