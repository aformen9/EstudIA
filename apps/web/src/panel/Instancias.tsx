import {
  enGrupo,
  etiquetasDeInstancias,
  motivoParaNoAgregar,
  motivoParaNoQuitar,
  nombreDeTipo,
  ordenarInstancias,
  proximoOrden,
  resumirMateria,
  situacionDeInstancia,
  TIPOS_INSTANCIA,
  type EstadoMateria,
  type GrupoInstancias,
  type Instancia,
  type Plan,
  type SituacionInstancia,
  type TipoInstancia,
} from "@estudia/core";
import { useEffect, useId, useRef, useState } from "react";
import { Icono, type NombreIcono } from "../interfaz/Iconos";
import { Segmentado } from "../interfaz/Segmentado";
import { fechaDeHoy, formatoNota } from "../plan/presentacion";
import { SliderNota } from "./SliderNota";

type EscalaDelPlan = Pick<Plan, "notaMin" | "notaMax" | "notaPaso" | "notaAprobacion">;

const ICONO_TIPO: Record<TipoInstancia, NombreIcono> = {
  parcial: "note",
  recuperatorio: "clock",
  cursada: "flag",
  final: "check",
  promocion: "spark",
};

const AYUDA_TIPO: Record<TipoInstancia, string> = {
  parcial: "Hasta 6",
  recuperatorio: "Hasta 6, nunca más que parciales",
  cursada: "Se pueden cargar varias",
  final: "Se pueden cargar varios",
  promocion: "Una sola",
};

const GRUPOS: { valor: GrupoInstancias; texto: string }[] = [
  { valor: "todas", texto: "Todas" },
  { valor: "cursadas", texto: "Cursadas" },
  { valor: "parciales", texto: "Parciales" },
  { valor: "finales", texto: "Finales" },
];

const SITUACION: Record<Exclude<SituacionInstancia, null>, [texto: string, clase: string]> = {
  aprobado: ["Aprobado", "ok"],
  aplazo: ["Aplazo", "no"],
  ausente: ["Ausente", ""],
  programada: ["Programada", "prog"],
  vigente: ["Vigente", "ok"],
  desaprobada: ["Desaprobada", "no"],
};

/** "+ Agregar instancia": un menú propio, con el motivo cuando un tipo no se puede agregar. */
function AgregarInstancia({
  instancias,
  alAgregar,
}: {
  instancias: Instancia[];
  alAgregar: (tipo: TipoInstancia) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!abierto) return;
    contenedor.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    function alTocarAfuera(evento: PointerEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    document.addEventListener("pointerdown", alTocarAfuera);
    return () => document.removeEventListener("pointerdown", alTocarAfuera);
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    boton.current?.focus();
  }

  return (
    <div
      className="agregar-i"
      ref={contenedor}
      onKeyDown={(e) => {
        if (e.key === "Escape" && abierto) {
          // Cierra el menú, no el panel.
          e.preventDefault();
          e.stopPropagation();
          cerrar();
          return;
        }
        if (!abierto || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
        e.preventDefault();
        const items = [
          ...(contenedor.current?.querySelectorAll<HTMLButtonElement>(
            "[role=menuitem]:not(:disabled)",
          ) ?? []),
        ];
        const actual = items.indexOf(document.activeElement as HTMLButtonElement);
        const paso = e.key === "ArrowDown" ? 1 : -1;
        items[(actual + paso + items.length) % items.length]?.focus();
      }}
    >
      <button
        ref={boton}
        className="btn"
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onClick={() => setAbierto((a) => !a)}
      >
        <Icono nombre="plus" />
        Agregar instancia
      </button>
      {abierto && (
        <div className="menu-i" role="menu" id={idMenu} aria-label="Tipo de instancia">
          {TIPOS_INSTANCIA.map((tipo) => {
            const motivo = motivoParaNoAgregar(instancias, tipo);
            return (
              <button
                key={tipo}
                type="button"
                role="menuitem"
                disabled={motivo !== null}
                onClick={() => {
                  alAgregar(tipo);
                  setAbierto(false);
                }}
              >
                <span className="est e-nada">
                  <Icono nombre={ICONO_TIPO[tipo]} />
                </span>
                <span>
                  <b>{nombreDeTipo(tipo)}</b>
                  <small>{motivo ?? AYUDA_TIPO[tipo]}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Las instancias de evaluación de una materia: lo que se calcula arriba (en vivo), los botones para
 * ver por grupo, cada instancia con su fecha, su slider y el botón para quitarla, y "Agregar instancia".
 * Nada de lo que se deduce se guarda: sale de `core` con el estado y las instancias.
 */
export function Instancias({
  estado,
  instancias,
  plan,
  alCambiar,
  alPasarAAprobada,
  sugerirAprobada,
}: {
  estado: EstadoMateria;
  instancias: Instancia[];
  plan: EscalaDelPlan;
  alCambiar: (instancias: Instancia[]) => void;
  alPasarAAprobada: () => void;
  sugerirAprobada: boolean;
}) {
  const idTitulo = useId();
  const idGrupo = useId();
  const [grupo, setGrupo] = useState<GrupoInstancias>("todas");
  const hoy = fechaDeHoy();
  const resumen = resumirMateria({ estado, instancias }, plan);
  const etiquetas = etiquetasDeInstancias(instancias);
  const visibles = ordenarInstancias(instancias).filter((i) => enGrupo(i.tipo, grupo));
  const cursada = resumen.cursadaVigente;

  const cambiar = (id: string, cambios: Partial<Instancia>) =>
    alCambiar(instancias.map((i) => (i.id === id ? { ...i, ...cambios } : i)));

  function agregar(tipo: TipoInstancia) {
    alCambiar([
      ...instancias,
      {
        id: crypto.randomUUID(),
        tipo,
        fecha: hoy,
        nota: null,
        orden: proximoOrden(instancias),
        fuente: "manual",
      },
    ]);
    // Si el grupo elegido no la muestra, se vuelve a "Todas" para que se vea la nueva.
    if (!enGrupo(tipo, grupo)) setGrupo("todas");
  }

  return (
    <div className="field" role="group" aria-labelledby={idTitulo}>
      <span className="etiqueta">Lo que se calcula</span>
      <div className="resumen-i" aria-live="polite">
        <div>
          <span>Nota de la materia</span>
          <b>{formatoNota(resumen.nota)}</b>
        </div>
        <div>
          <span>Aplazos</span>
          <b>
            {resumen.aplazos.length
              ? resumen.aplazos.map((a) => formatoNota(a.nota)).join(", ")
              : "0"}
          </b>
        </div>
        <div>
          <span>Ausentes</span>
          <b>
            {instancias.filter((i) => situacionDeInstancia(i, resumen, hoy) === "ausente").length}
          </b>
        </div>
        <div>
          <span>Cursada vigente</span>
          <b>{cursada ? (cursada.nota == null ? "Sin nota" : formatoNota(cursada.nota)) : "–"}</b>
        </div>
      </div>
      {sugerirAprobada && (
        <div className="sugerencia" role="status">
          <span>¿La aprobaste?</span>
          <button className="btn sm" type="button" onClick={alPasarAAprobada}>
            Pasar a Aprobada
          </button>
        </div>
      )}
      {estado === "aprobada" && resumen.notaPorDebajoDeAprobacion && (
        <p className="hint" role="status">
          La nota de la materia es menor a {formatoNota(plan.notaAprobacion)}. Si no la aprobaste,
          cambiá el estado.
        </p>
      )}

      <span className="etiqueta" id={idTitulo}>
        Instancias de evaluación
      </span>
      {instancias.length > 0 && (
        <>
          <span className="sr-solo" id={idGrupo}>
            Ver
          </span>
          <Segmentado<GrupoInstancias>
            idEtiqueta={idGrupo}
            valor={grupo}
            alCambiar={setGrupo}
            columnasCelular={2}
            opciones={GRUPOS}
          />
        </>
      )}
      <div className="insts">
        {instancias.length === 0 && (
          <p className="vacio-i">Todavía no cargaste ninguna instancia.</p>
        )}
        {instancias.length > 0 && visibles.length === 0 && (
          <p className="vacio-i">No hay instancias de este grupo.</p>
        )}
        {visibles.map((instancia) => {
          const etiqueta = etiquetas.get(instancia.id) ?? nombreDeTipo(instancia.tipo);
          const situacion = situacionDeInstancia(instancia, resumen, hoy);
          const motivo = motivoParaNoQuitar(instancias, instancia.id);
          return (
            <div className="inst" key={instancia.id}>
              <SliderNota
                etiqueta={etiqueta}
                valor={instancia.nota}
                plan={plan}
                alCambiar={(nota) => cambiar(instancia.id, { nota })}
                alConfirmar={() => {}}
                detalle={
                  situacion && (
                    <span className={`chip-d ${SITUACION[situacion][1]}`}>
                      {SITUACION[situacion][0]}
                    </span>
                  )
                }
                acciones={{
                  antes: (
                    <input
                      className="inst-f"
                      type="date"
                      required
                      aria-label={`Fecha de ${etiqueta}`}
                      value={instancia.fecha}
                      onChange={(e) => {
                        if (e.target.value) cambiar(instancia.id, { fecha: e.target.value });
                      }}
                    />
                  ),
                  despues: (
                    <button
                      className="inst-x"
                      type="button"
                      aria-label={`Quitar ${etiqueta}`}
                      title={motivo ?? undefined}
                      disabled={motivo !== null}
                      onClick={() => alCambiar(instancias.filter((i) => i.id !== instancia.id))}
                    >
                      <Icono nombre="x" />
                    </button>
                  ),
                }}
              />
            </div>
          );
        })}
        <AgregarInstancia instancias={instancias} alAgregar={agregar} />
      </div>
    </div>
  );
}
