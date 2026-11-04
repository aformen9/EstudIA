import type { DatosAlumno } from "@estudia/core";
import { useLayoutEffect, useRef } from "react";
import { Icono } from "../interfaz/Iconos";
import { ConPlan } from "../plan/planActivo";
import {
  aniosDelPlan,
  buscarMaterias,
  cantidad,
  cuatrimestresDelAnio,
  materiasDePestania,
} from "../plan/presentacion";
import { CajaVacia, EncabezadoVista, FilaMateria, GruposDeMaterias, retardo } from "./comunes";

export interface FiltrosMaterias {
  anio: number;
  cuatrimestre: number;
  busqueda: string;
}

export const FILTROS_MATERIAS_INICIALES: FiltrosMaterias = {
  anio: 1,
  cuatrimestre: 1,
  busqueda: "",
};

interface Pestania {
  valor: number;
  texto: string;
}

/** Botones con estado "presionado": Tab recorre cada uno y no hace falta manejar las flechas. */
function Pestanias({
  nombre,
  opciones,
  valor,
  alElegir,
}: {
  nombre: string;
  opciones: Pestania[];
  valor: number;
  alElegir: (valor: number) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const indicador = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    function ubicar() {
      const elegida = contenedor.current?.querySelector<HTMLElement>("button.on");
      if (!elegida || !indicador.current) return;
      indicador.current.style.width = `${elegida.offsetWidth}px`;
      indicador.current.style.transform = `translateX(${elegida.offsetLeft}px)`;
    }
    ubicar();
    let vigente = true;
    void document.fonts?.ready.then(() => {
      if (vigente) ubicar();
    });
    window.addEventListener("resize", ubicar);
    return () => {
      vigente = false;
      window.removeEventListener("resize", ubicar);
    };
  }, [valor, opciones.length]);

  return (
    <div className="tabs" ref={contenedor} role="group" aria-label={nombre}>
      <span className="ind" ref={indicador} aria-hidden="true"></span>
      {opciones.map((opcion) => (
        <button
          key={opcion.valor}
          type="button"
          className={opcion.valor === valor ? "on" : undefined}
          aria-pressed={opcion.valor === valor}
          onClick={() => alElegir(opcion.valor)}
        >
          {opcion.texto}
        </button>
      ))}
    </div>
  );
}

function ContenidoMaterias({
  datos,
  filtros,
  alCambiar,
}: {
  datos: DatosAlumno;
  filtros: FiltrosMaterias;
  alCambiar: (cambios: Partial<FiltrosMaterias>) => void;
}) {
  if (filtros.busqueda.trim()) {
    const encontradas = buscarMaterias(datos.materias, filtros.busqueda);
    return (
      <>
        <p className="sr-solo" role="status">
          {cantidad(encontradas.length, "materia encontrada", "materias encontradas")}
        </p>
        {encontradas.length ? (
          <GruposDeMaterias datos={datos} materias={encontradas} desde={2} />
        ) : (
          <CajaVacia
            icono="search"
            titulo="Sin resultados"
            texto="Ninguna materia coincide con la búsqueda."
          />
        )}
      </>
    );
  }

  const anios = aniosDelPlan(datos.materias);
  const anio = anios.includes(filtros.anio) ? filtros.anio : (anios[0] ?? 0);
  const cuatrimestres = cuatrimestresDelAnio(datos, anio);
  const cuatrimestre = cuatrimestres.includes(filtros.cuatrimestre)
    ? filtros.cuatrimestre
    : (cuatrimestres[0] ?? 1);
  const lista = materiasDePestania(datos.materias, anio, cuatrimestre);
  return (
    <>
      <div className="tabs-row rise" style={retardo(2)}>
        <div className="tabs-wrap">
          <Pestanias
            nombre="Año"
            opciones={anios.map((a) => ({ valor: a, texto: a === 0 ? "Extras" : `${a}° año` }))}
            valor={anio}
            alElegir={(elegido) => alCambiar({ anio: elegido })}
          />
        </div>
        {anio !== 0 && (
          <div className="tabs-wrap">
            <Pestanias
              nombre="Cuatrimestre"
              opciones={cuatrimestres.map((c) => ({ valor: c, texto: `${c}° cuatrimestre` }))}
              valor={cuatrimestre}
              alElegir={(elegido) => alCambiar({ cuatrimestre: elegido })}
            />
          </div>
        )}
      </div>
      {lista.length ? (
        <div className="list">
          {lista.map((materia, i) => (
            <FilaMateria
              key={materia.id}
              datos={datos}
              materia={materia}
              indice={i + 3}
              conLugar={false}
            />
          ))}
        </div>
      ) : (
        <CajaVacia
          icono="book"
          titulo="Nada por acá"
          texto="Este cuatrimestre todavía no tiene materias cargadas."
        />
      )}
    </>
  );
}

export function Materias({
  filtros,
  alCambiar,
}: {
  filtros: FiltrosMaterias;
  alCambiar: (cambios: Partial<FiltrosMaterias>) => void;
}) {
  return (
    <>
      <EncabezadoVista seccion="Plan de estudios" titulo="Materias" />
      <div className="row-tools rise" style={retardo(1)}>
        <label className="search">
          <Icono nombre="search" />
          <input
            className="input"
            type="search"
            placeholder="Buscar materia o código…"
            aria-label="Buscar materia o código"
            value={filtros.busqueda}
            onChange={(e) => alCambiar({ busqueda: e.target.value })}
          />
        </label>
      </div>
      <ConPlan>
        {(datos) => <ContenidoMaterias datos={datos} filtros={filtros} alCambiar={alCambiar} />}
      </ConPlan>
    </>
  );
}
