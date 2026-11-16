import type { EstadoMateria } from "@estudia/core";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ETIQUETAS_ESTADO, ICONO_ESTADO } from "../plan/presentacion";
import { Icono, type NombreIcono } from "./Iconos";

export interface OpcionMateria {
  id: string;
  nombre: string;
  codigo: string | null;
  anio: number;
  estado: EstadoMateria;
}

/** Opciones que no son materias, como "Todas las materias" o "Sin materia". Van arriba de todo. */
export interface OpcionGeneral {
  id: string;
  texto: string;
  icono: NombreIcono;
}

interface Grupo {
  titulo: string;
  opciones: (OpcionMateria | OpcionGeneral)[];
}

const esGeneral = (o: OpcionMateria | OpcionGeneral): o is OpcionGeneral => "texto" in o;

/** Sin tildes ni mayúsculas, para buscar "calculo" y encontrar "Cálculo". */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function coincide(opcion: OpcionMateria | OpcionGeneral, buscado: string): boolean {
  if (!buscado) return true;
  const texto = esGeneral(opcion) ? opcion.texto : `${opcion.nombre} ${opcion.codigo ?? ""}`;
  return normalizar(texto).includes(buscado);
}

/** El año 0 es lo que la app llama "Extras": va al final. */
const ordenDeAnio = (anio: number) => (anio === 0 ? Number.MAX_SAFE_INTEGER : anio);

export function gruposDeMaterias(
  opciones: OpcionMateria[],
  generales: OpcionGeneral[],
  busqueda: string,
): Grupo[] {
  const buscado = normalizar(busqueda.trim());
  const grupos: Grupo[] = [];
  const generalesVisibles = generales.filter((g) => coincide(g, buscado));
  if (generalesVisibles.length) grupos.push({ titulo: "General", opciones: generalesVisibles });
  const visibles = opciones.filter((o) => coincide(o, buscado));
  const enCurso = visibles.filter((o) => o.estado === "cursando");
  if (enCurso.length) grupos.push({ titulo: "En curso ahora", opciones: enCurso });
  const anios = [...new Set(visibles.map((o) => o.anio))].sort(
    (a, b) => ordenDeAnio(a) - ordenDeAnio(b),
  );
  for (const anio of anios) {
    const delAnio = visibles.filter((o) => o.anio === anio && o.estado !== "cursando");
    if (delAnio.length) {
      grupos.push({ titulo: anio === 0 ? "Extras" : `${anio}.° año`, opciones: delAnio });
    }
  }
  return grupos;
}

function Resaltar({ texto, buscado }: { texto: string; buscado: string }): ReactNode {
  const objetivo = normalizar(buscado.trim());
  // Normalizar no cambia el largo de un texto sin letras compuestas, que es el caso de los nombres.
  const inicio = objetivo ? normalizar(texto).indexOf(objetivo) : -1;
  if (inicio < 0 || normalizar(texto).length !== texto.length) return texto;
  return (
    <>
      {texto.slice(0, inicio)}
      <mark>{texto.slice(inicio, inicio + objetivo.length)}</mark>
      {texto.slice(inicio + objetivo.length)}
    </>
  );
}

function Cabecera({ opcion }: { opcion: OpcionMateria | OpcionGeneral | undefined }) {
  if (!opcion) {
    return (
      <>
        <span className="est e-nada">
          <Icono nombre="search" />
        </span>
        <span className="nom">Elegí una materia</span>
      </>
    );
  }
  if (esGeneral(opcion)) {
    return (
      <>
        <span className="est e-nada">
          <Icono nombre={opcion.icono} />
        </span>
        <span className="nom">{opcion.texto}</span>
      </>
    );
  }
  return (
    <>
      <span className={`est e-${opcion.estado}`}>
        <Icono nombre={ICONO_ESTADO[opcion.estado]} />
      </span>
      <span className="nom">{opcion.nombre}</span>
      <span className={`et e-${opcion.estado}`}>{ETIQUETAS_ESTADO[opcion.estado]}</span>
    </>
  );
}

/**
 * Selector de materias propio: agrupado por año, con "En curso ahora" arriba, buscador por nombre o
 * código y el estado con color, ícono y texto. `modo="lista"` lo muestra siempre abierto, para un
 * diálogo que solo sirve para elegir. En el celular, desplegado ocupa toda la pantalla.
 */
export function SelectorMateria({
  idEtiqueta,
  opciones,
  generales = [],
  valor,
  alCambiar,
  modo = "desplegable",
  flotante = false,
  tituloCelular = "Elegí la materia",
}: {
  idEtiqueta: string;
  opciones: OpcionMateria[];
  generales?: OpcionGeneral[];
  valor: string | null;
  alCambiar: (id: string) => void;
  modo?: "desplegable" | "lista";
  /** Desplegado encima del contenido, en vez de empujarlo hacia abajo. */
  flotante?: boolean;
  tituloCelular?: string;
}) {
  const idLista = useId();
  const idOpcion = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(modo === "lista");
  const [busqueda, setBusqueda] = useState("");
  const [activa, setActiva] = useState(0);

  const grupos = gruposDeMaterias(opciones, generales, busqueda);
  const planas = grupos.flatMap((g) => g.opciones);
  const elegida = [...generales, ...opciones].find((o) => o.id === valor);
  const indiceActiva = Math.min(activa, planas.length - 1);

  useEffect(() => {
    if (!abierto || modo === "lista") return;
    buscador.current?.focus();
    function alTocarAfuera(evento: PointerEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    document.addEventListener("pointerdown", alTocarAfuera);
    return () => document.removeEventListener("pointerdown", alTocarAfuera);
  }, [abierto, modo]);

  useEffect(() => {
    const opcion = contenedor.current?.querySelector(
      `#${CSS.escape(`${idOpcion}-${indiceActiva}`)}`,
    );
    opcion?.scrollIntoView?.({ block: "nearest" });
  }, [indiceActiva, idOpcion]);

  function abrir() {
    setBusqueda("");
    const actual = planas.findIndex((o) => o.id === valor);
    setActiva(Math.max(0, actual));
    setAbierto(true);
  }

  function cerrar(devolverFoco: boolean) {
    if (modo === "lista") return;
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }

  function elegir(id: string) {
    alCambiar(id);
    cerrar(true);
  }

  function alTeclear(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      const paso = evento.key === "ArrowDown" ? 1 : -1;
      setActiva(Math.min(planas.length - 1, Math.max(0, indiceActiva + paso)));
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      const opcion = planas[indiceActiva];
      if (opcion) elegir(opcion.id);
    } else if (evento.key === "Escape" && modo !== "lista") {
      // Cierra el selector, no el modal donde está.
      evento.preventDefault();
      evento.stopPropagation();
      cerrar(true);
    }
  }

  let indice = 0;
  const lista = (
    <div className="ms-pop">
      {modo !== "lista" && (
        <div className="ms-pop-h">
          <b>{tituloCelular}</b>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cerrar"
            onClick={() => cerrar(true)}
          >
            <Icono nombre="x" />
          </button>
        </div>
      )}
      <div className="ms-busca">
        <Icono nombre="search" />
        <input
          ref={buscador}
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={planas.length ? `${idOpcion}-${indiceActiva}` : undefined}
          aria-label="Buscar materia por nombre o código"
          placeholder="Buscar por nombre o código…"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setActiva(0);
          }}
          onKeyDown={alTeclear}
        />
      </div>
      <div className="ms-lista" id={idLista} role="listbox" aria-labelledby={idEtiqueta}>
        {planas.length === 0 && (
          <div className="ms-nada" role="status">
            Ninguna materia con “{busqueda.trim()}”.
          </div>
        )}
        {grupos.map((grupo) => (
          <div role="group" aria-label={grupo.titulo} key={grupo.titulo}>
            <div className="ms-g" aria-hidden="true">
              <span>{grupo.titulo}</span>
              <span>{grupo.opciones.length}</span>
            </div>
            {grupo.opciones.map((opcion) => {
              const i = indice++;
              const general = esGeneral(opcion);
              return (
                <div
                  key={opcion.id}
                  id={`${idOpcion}-${i}`}
                  role="option"
                  aria-selected={opcion.id === valor}
                  className={i === indiceActiva ? "ms-o act" : "ms-o"}
                  onPointerMove={() => setActiva(i)}
                  onClick={() => elegir(opcion.id)}
                >
                  {general ? (
                    <>
                      <span className="est e-nada">
                        <Icono nombre={opcion.icono} />
                      </span>
                      <span className="nom">
                        <Resaltar texto={opcion.texto} buscado={busqueda} />
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={`est e-${opcion.estado}`}>
                        <Icono nombre={ICONO_ESTADO[opcion.estado]} />
                      </span>
                      <span className="nom">
                        <Resaltar texto={opcion.nombre} buscado={busqueda} />
                      </span>
                      <span className={`et e-${opcion.estado}`}>
                        {ETIQUETAS_ESTADO[opcion.estado]}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const clases = ["ms", abierto ? "abierto" : "", flotante ? "flotante" : "", `ms-modo-${modo}`]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={clases} ref={contenedor}>
      {modo !== "lista" && (
        <button
          ref={boton}
          type="button"
          className="ms-btn"
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-labelledby={idEtiqueta}
          aria-describedby={`${idLista}-actual`}
          onClick={() => (abierto ? cerrar(false) : abrir())}
          onKeyDown={(e) => {
            if (!abierto && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              abrir();
            }
          }}
        >
          <span id={`${idLista}-actual`} className="ms-actual">
            <Cabecera opcion={elegida} />
          </span>
          <span className="ms-chev">
            <Icono nombre="chev-down" />
          </span>
        </button>
      )}
      {abierto && lista}
    </div>
  );
}
