import {
  materialesDeMateria,
  materialesDelPlan,
  materialesRecientes,
  type DatosAlumno,
  type EstadoMateria,
  type Material,
  type Materia,
  estadoDe,
} from "@estudia/core";
import { useId, useState, type ReactNode } from "react";
import { Dialogo } from "../interfaz/Dialogo";
import { Icono } from "../interfaz/Iconos";
import {
  AccionMaterial,
  AvisoDeArchivo,
  BotonBorrarMaterial,
  SeccionMaterial,
} from "../materiales/ComponentesMaterial";
import { IconoMaterial } from "../materiales/IconoMaterial";
import { AccionesReferencia } from "../materiales/ReferenciasMaterial";
import { useMaterialesDelAlumno } from "../materiales/useMateriales";
import { useAbrirMateria, useAviso } from "../plan/abrirMateria";
import { ConPlan, ErrorDeCarga } from "../plan/planActivo";
import { formatoFecha, formatoPeso } from "../plan/presentacion";
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
  material,
  materia,
  todos,
  materias,
  buscado,
  indice,
  alFallar,
}: {
  material: Material;
  materia: Materia | undefined;
  todos: Material[];
  materias: Materia[];
  buscado: string;
  indice: number;
  alFallar: (mensaje: string) => void;
}) {
  const abrirMateria = useAbrirMateria();
  const avisar = useAviso();
  const peso = material.tipo === "archivo" ? formatoPeso(material.documento.bytes) : "";
  return (
    <div className="mcard rise" style={retardo(indice + 3)} data-material={material.id}>
      <div className="mcard-top">
        <IconoMaterial material={material} />
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
      <AvisoDeArchivo material={material} />
      <div className="acts">
        {materia ? (
          <button className="materia" type="button" onClick={() => abrirMateria(materia.id)}>
            {materia.nombre}
          </button>
        ) : (
          <span className="sub">Sin materia</span>
        )}
        <span className="mat-botones">
          <AccionMaterial material={material} alFallar={alFallar} />
          <BotonBorrarMaterial material={material} />
        </span>
      </div>
      <AccionesReferencia material={material} todos={todos} materias={materias} alAvisar={avisar} />
    </div>
  );
}

function ordenParaSubir(datos: DatosAlumno): (Materia & { estado: EstadoMateria })[] {
  return datos.materias
    .map((m) => ({ ...m, estado: estadoDe(datos, m.id) }))
    .sort(
      (a, b) =>
        Number(b.estado === "cursando") - Number(a.estado === "cursando") ||
        a.nombre.localeCompare(b.nombre),
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
  const opciones = ordenParaSubir(datos);
  const [materiaId, setMateriaId] = useState(inicial || (opciones[0]?.id ?? ""));
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
              <label htmlFor={idSelector}>¿De qué materia es?</label>
              <select
                id={idSelector}
                value={materiaId}
                onChange={(e) => setMateriaId(e.target.value)}
              >
                {opciones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                    {m.estado === "cursando" ? " · en curso" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="sec">
              <SeccionMaterial
                materiaId={materiaId}
                materiales={materialesDeMateria(materiales, materiaId)}
                todos={todos}
                materias={datos.materias}
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
  const lista = materialesRecientes(materiales, materiales.length).filter(
    (m) =>
      (filtros.tipo === "todo" || m.tipo === filtros.tipo) &&
      (!filtros.materiaId || m.materiaId === filtros.materiaId) &&
      (!buscado || textosDe(m, nombreDe(m)).some((t) => t.toLowerCase().includes(buscado))),
  );
  const conMaterial = [...new Set(materiales.map((m) => m.materiaId))]
    .flatMap((id) => {
      const materia = id ? materias.get(id) : undefined;
      return materia ? [materia] : [];
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const cuantos = (tipo: TipoFiltro) =>
    tipo === "todo" ? materiales.length : materiales.filter((m) => m.tipo === tipo).length;

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
        <select
          className="input filtro-materia"
          aria-label="Filtrar por materia"
          value={filtros.materiaId}
          onChange={(e) => alCambiar({ materiaId: e.target.value })}
        >
          <option value="">Todas las materias</option>
          {conMaterial.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
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
          {lista.map((material, i) => (
            <TarjetaMaterial
              key={material.id}
              material={material}
              materia={material.materiaId ? materias.get(material.materiaId) : undefined}
              todos={todos}
              materias={datos.materias}
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
          inicial={filtros.materiaId}
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
