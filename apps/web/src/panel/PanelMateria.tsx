import {
  aniosDelPlan,
  borradorDeMateria,
  alEditarNota,
  camposNotaVisibles,
  type CampoNota,
  cicloDeCorrelativas,
  CONDICION_PREDETERMINADA,
  cuatrimestresDelAnio,
  esMateriaPropia,
  ESTADOS_MATERIA,
  estadoCorrelativas,
  historialDeMateria,
  materialesDeMateria,
  normalizarBorrador,
  opcionesDeCorrelativa,
  parsearAplazos,
  progresoDe,
  progresoInicial,
  sugerirEstado,
  type BorradorMateriaPropia,
  type DatosAlumno,
  type EstadoMateria,
  type EventoHistorial,
  type Materia,
  type ParaCorrelativa,
} from "@estudia/core";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState, type FormEvent } from "react";
import { useGuardado, useRepositorio } from "../sesion/sesion";
import { Dialogo } from "../interfaz/Dialogo";
import { festejar } from "../interfaz/Festejo";
import { Icono } from "../interfaz/Iconos";
import { Segmentado } from "../interfaz/Segmentado";
import { SeccionMaterial } from "../materiales/ComponentesMaterial";
import { useMaterialesDelAlumno } from "../materiales/useMateriales";
import { clavesPlan, invalidarDatosDelPlan } from "../plan/planActivo";
import {
  enumerar,
  ETIQUETAS_ESTADO,
  ICONO_ESTADO,
  formatoFecha,
  formatoNota,
  lugarMateria,
} from "../plan/presentacion";
import { useGuardarProgreso, type CambiosProgreso } from "../plan/useGuardarProgreso";
import { SliderNota } from "./SliderNota";

const ETIQUETA_CONDICION = { regular: "regularizada", aprobada: "aprobada" } as const;
const ETIQUETA_PARA: Record<ParaCorrelativa, string> = {
  cursar: "Para cursar",
  rendir: "Para rendir",
};

const ETIQUETAS_NOTA: Record<CampoNota, string> = {
  p1: "Parcial 1",
  p2: "Parcial 2",
  rec: "Recuperatorio",
  notaCursada: "Nota de cursada",
  notaFinalExamen: "Final",
  nota: "Nota final",
};
const CAMPOS_NOTA = Object.keys(ETIQUETAS_NOTA) as CampoNota[];

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function BloqueCorrelativas({
  datos,
  materia,
  para,
}: {
  datos: DatosAlumno;
  materia: Materia;
  para: ParaCorrelativa;
}) {
  const { requisitos, modulo, vacio } = estadoCorrelativas(datos, materia, para);
  return (
    <div className="rl">
      <b>{ETIQUETA_PARA[para]}</b>
      {vacio && <span className="sub">Sin correlativas</span>}
      {requisitos.map((r) => (
        <div className={`req ${r.cumple ? "ok" : "no"}`} key={r.materia.id}>
          <Icono nombre={r.cumple ? "check" : "lock"} />
          <span>{r.materia.nombre}</span>
          <small>{ETIQUETA_CONDICION[r.condicion]}</small>
          <span className="sr-solo">{r.cumple ? "(cumplida)" : "(falta)"}</span>
        </div>
      ))}
      {modulo && (
        <div className={`req ${modulo.pendientes.length ? "no" : "ok"}`}>
          <Icono nombre={modulo.pendientes.length ? "lock" : "check"} />
          <span>{modulo.anio}° año completo aprobado</span>
          {modulo.pendientes.length > 0 && (
            <small>falta: {modulo.pendientes.map((m) => m.nombre).join(", ")}</small>
          )}
        </div>
      )}
    </div>
  );
}

function TablaHistorial({ eventos }: { eventos: EventoHistorial[] }) {
  const tipo = (t: EventoHistorial["tipo"]) =>
    t === "Regularidad" ? "Cursada" : t === "Promocion" ? "Promoción" : t;
  const clase = (r: EventoHistorial["resultado"]) =>
    r === "Aprobado" || r === "Promocionado" ? "r-ok" : r === "Reprobado" ? "r-no" : "r-aus";
  return (
    <div className="sec">
      <b>Historial</b>
      <div className="hist-wrap">
        <table className="hist">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Nota</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((h, i) => (
              <tr key={i}>
                <td>{formatoFecha(h.fecha)}</td>
                <td>{tipo(h.tipo)}</td>
                <td>{formatoNota(h.nota)}</td>
                <td className={clase(h.resultado)}>{h.resultado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function claveDeCorrelativas(correlativas: BorradorMateriaPropia["correlativas"]): string[] {
  return correlativas.map((c) => `${c.para}|${c.requiereId}|${c.condicion}`).sort();
}

function claveCorrelativas(borrador: BorradorMateriaPropia): string {
  return JSON.stringify({ ...borrador, correlativas: claveDeCorrelativas(borrador.correlativas) });
}

function mismosValores(a: CambiosProgreso, b: CambiosProgreso): boolean {
  const campos = ["estado", ...CAMPOS_NOTA] as const;
  return (
    campos.every((campo) => a[campo] === b[campo]) &&
    JSON.stringify(a.aplazos) === JSON.stringify(b.aplazos)
  );
}

function materiaNueva(lugar: LugarInicial): BorradorMateriaPropia {
  return {
    codigo: null,
    nombre: "",
    anio: lugar.anio,
    cuatrimestre: lugar.anio === 0 ? null : lugar.cuatrimestre,
    tipo: "Materia",
    area: null,
    requiereAnioCompletoParaCursar: null,
    correlativas: [],
  };
}

export interface LugarInicial {
  anio: number;
  cuatrimestre: number | null;
}

/**
 * Editar una materia, o crear una si `materia` es null. Abrir y guardar sin tocar nada no escribe:
 * una nota con decimales queda como está y una materia sin datos sigue sin fila de progreso.
 */
export function PanelMateria({
  datos,
  materia,
  lugarInicial,
  alCerrar,
  avisar,
}: {
  datos: DatosAlumno;
  materia: Materia | null;
  lugarInicial: LugarInicial;
  alCerrar: () => void;
  avisar: (texto: string) => void;
}) {
  const repositorio = useRepositorio();
  const clienteQuery = useQueryClient();
  const almacen = useGuardado();
  const { plan } = datos;
  const editable = materia === null || esMateriaPropia(materia);

  const idTitulo = useId();
  const idFormulario = useId();
  const idEstado = useId();
  const idAplazos = useId();
  const idNombre = useId();
  const idAnio = useId();
  const idCuatrimestre = useId();
  const nombreRef = useRef<HTMLInputElement>(null);
  // Si crearla salió bien y falló lo que seguía, reintentar no la vuelve a crear.
  const idCreada = useRef<string | null>(null);
  // Una sola vez por materia nueva: si un intento agotó el tiempo, el siguiente usa el mismo id.
  const [idNueva] = useState(() => crypto.randomUUID());
  const intentoAnterior = useRef<string | null>(null);

  const [guardada] = useState(
    () => (materia && progresoDe(datos, materia.id)) ?? progresoInicial(materia?.id ?? ""),
  );
  const [valores, setValores] = useState(guardada);
  const [textoInicial] = useState(() => guardada.aplazos.join(", "));
  const [textoAplazos, setTextoAplazos] = useState(textoInicial);
  const [borradorInicial] = useState(() =>
    materia ? borradorDeMateria(datos, materia) : materiaNueva(lugarInicial),
  );
  const [borrador, setBorrador] = useState(borradorInicial);
  const [detallesAbiertos, setDetallesAbiertos] = useState(materia === null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  const { guardarYEsperar } = useGuardarProgreso(plan.id, materia?.id ?? null);
  const materiales = useMaterialesDelAlumno();
  const todos = materiales.data ?? [];
  const delaMateria = materia ? materialesDeMateria(todos, materia.id) : [];
  const sugerencia = sugerirEstado(valores, plan);
  const [todasLasNotas, setTodasLasNotas] = useState(false);
  const notasVisibles = camposNotaVisibles(valores.estado, [guardada, valores], todasLasNotas);
  const idNotas = useId();

  /** En vivo, mientras se desliza: todavía no cambia el estado. */
  function cambiarNota(campo: CampoNota, valor: number | null) {
    setValores((actuales) => ({ ...actuales, [campo]: valor }));
  }

  /**
   * Al soltar el slider, con cada tecla o al escribir: si no, pasar por un 4 en pleno arrastre pasaría
   * la materia a Aprobada.
   */
  function confirmarNota(campo: CampoNota) {
    if (campo !== "nota" && campo !== "notaFinalExamen") return;
    setValores((actuales) => ({ ...actuales, ...alEditarNota(campo, actuales, plan) }));
  }

  function alternarCorrelativa(requiereId: string, para: ParaCorrelativa, marcada: boolean) {
    setBorrador((actual) => {
      const otras = actual.correlativas.filter(
        (c) => !(c.requiereId === requiereId && c.para === para),
      );
      if (!marcada) return { ...actual, correlativas: otras };
      const original = borradorInicial.correlativas.find(
        (c) => c.requiereId === requiereId && c.para === para,
      );
      const condicion = original?.condicion ?? CONDICION_PREDETERMINADA[para];
      return { ...actual, correlativas: [...otras, { requiereId, para, condicion }] };
    });
  }

  function explicarCiclo(ids: string[], seGuardoAlgo: boolean): string {
    const nombres = new Map(datos.materias.map((m) => [m.id, m.nombre]));
    nombres.set(materia?.id ?? "", borrador.nombre.trim());
    const delCiclo = ids.map((id) => nombres.get(id) ?? id);
    const siguiente = delCiclo[1];
    return (
      `${seGuardoAlgo ? "Guardé lo demás, pero no las correlativas" : "No guardé las correlativas"}: ` +
      `${enumerar(delCiclo)} se piden entre sí, y así ninguna se podría cursar. ` +
      `Para cambiarlas, destildá ${siguiente ?? "esa correlativa"} en las correlativas de esta materia.`
    );
  }

  async function guardar() {
    setError(null);
    setAviso(null);
    const cambios: CambiosProgreso = {
      estado: valores.estado,
      p1: valores.p1,
      p2: valores.p2,
      rec: valores.rec,
      notaCursada: valores.notaCursada,
      notaFinalExamen: valores.notaFinalExamen,
      nota: valores.nota,
      aplazos:
        textoAplazos === textoInicial ? guardada.aplazos : parsearAplazos(textoAplazos, plan),
    };
    const id = materia?.id ?? idCreada.current;
    const normalizado = editable ? normalizarBorrador(borrador, id) : null;
    if (editable && !normalizado) {
      setDetallesAbiertos(true);
      setAviso("Poné un nombre para la materia.");
      nombreRef.current?.focus();
      return;
    }

    const actual = (id ? progresoDe(datos, id) : null) ?? progresoInicial(id ?? "");
    const actualMateria = id ? datos.materias.find((m) => m.id === id) : undefined;
    const correlativasActuales = actualMateria
      ? borradorDeMateria(datos, actualMateria).correlativas
      : [];

    // Un ciclo que ya venía (por ejemplo, de un respaldo) no impide guardar nada. Uno nuevo solo frena
    // las correlativas: las notas y el nombre se guardan igual.
    const cambianCorrelativas =
      normalizado !== null &&
      actualMateria !== undefined &&
      JSON.stringify(claveDeCorrelativas(normalizado.correlativas)) !==
        JSON.stringify(claveDeCorrelativas(correlativasActuales));
    const ciclo =
      normalizado && cambianCorrelativas
        ? cicloDeCorrelativas(datos, id, normalizado.correlativas)
        : null;
    const aGuardar =
      normalizado && ciclo ? { ...normalizado, correlativas: correlativasActuales } : normalizado;

    const cambiaFila = !mismosValores(cambios, actual);
    const cambiaMateria =
      aGuardar !== null &&
      (id === null ||
        (actualMateria !== undefined &&
          claveCorrelativas(aGuardar) !==
            claveCorrelativas(borradorDeMateria(datos, actualMateria))));
    if (!cambiaFila && !cambiaMateria) {
      if (ciclo) {
        setDetallesAbiertos(true);
        setAviso(explicarCiclo(ciclo, false));
        return;
      }
      alCerrar();
      return;
    }

    setGuardando(true);
    try {
      let idFinal = id;
      if (cambiaMateria && aGuardar) {
        if (idFinal === null) {
          const clave = claveCorrelativas(aGuardar);
          const anterior = intentoAnterior.current;
          intentoAnterior.current = clave;
          const creada = await repositorio.crearMateriaPropia(plan.id, aGuardar, idNueva);
          idFinal = creada.id;
          idCreada.current = creada.id;
          // El primer intento pudo haber llegado aunque no respondió, y entonces el reintento devuelve
          // esa fila tal como quedó: si el alumno corrigió algo en el medio, hay que aplicarlo.
          if (anterior !== null && anterior !== clave) {
            await repositorio.actualizarMateriaPropia(creada.id, aGuardar);
          }
        } else {
          await repositorio.actualizarMateriaPropia(idFinal, aGuardar);
        }
        await clienteQuery.invalidateQueries({ queryKey: clavesPlan.plan(plan.id) });
      }
      if (cambiaFila && idFinal) await guardarYEsperar(cambios, idFinal);
    } catch (fallo) {
      setError(mensajeDe(fallo));
      setGuardando(false);
      return;
    }
    const nombre = aGuardar?.nombre ?? materia?.nombre ?? "";
    const aprobo = cambios.estado === "aprobada" && actual.estado !== "aprobada";
    if (ciclo) {
      // El panel sigue abierto: el alumno tiene que ver qué no se guardó y puede corregirlo.
      setGuardando(false);
      setDetallesAbiertos(true);
      setAviso(explicarCiclo(ciclo, true));
      return;
    }
    alCerrar();
    if (aprobo) {
      festejar({ materia: nombre, nota: cambios.nota ?? null });
    } else {
      avisar("Guardado");
    }
  }

  async function borrar() {
    if (!materia) return;
    setBorrando(true);
    setErrorBorrado(null);
    try {
      await repositorio.borrarMateriaPropia(materia.id);
      almacen.resolverFilas([materia.id]);
      await invalidarDatosDelPlan(clienteQuery, plan.id);
      alCerrar();
      avisar("Materia eliminada");
    } catch (fallo) {
      setErrorBorrado(mensajeDe(fallo));
      setBorrando(false);
    }
  }

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (!guardando) void guardar();
  }

  const anios = [...new Set([...aniosDelPlan(datos.materias), borrador.anio])];
  const cuatrimestres = [
    ...new Set([
      ...cuatrimestresDelAnio(datos, borrador.anio),
      ...(borrador.cuatrimestre != null ? [borrador.cuatrimestre] : []),
    ]),
  ];
  const opcionesCorrelativa = opcionesDeCorrelativa(datos.materias, materia?.id ?? null);
  const dependientes = materia
    ? new Set(datos.correlativas.filter((c) => c.requiereId === materia.id).map((c) => c.materiaId))
        .size
    : 0;
  const historial = materia ? historialDeMateria(datos.historial, materia.id) : [];

  return (
    <Dialogo idTitulo={idTitulo} alCerrar={alCerrar}>
      <div className="dlg">
        <div className="dlg-head">
          <div>
            <div className="eyebrow">
              {materia
                ? [lugarMateria(materia), materia.codigo].filter(Boolean).join(" · ")
                : "Nueva materia"}
            </div>
            <h3 id={idTitulo}>{materia ? materia.nombre : "Agregar materia"}</h3>
          </div>
          <button className="icon-btn" type="button" aria-label="Cerrar" onClick={alCerrar}>
            <Icono nombre="x" />
          </button>
        </div>

        {materia && (
          <div className="reqs">
            <BloqueCorrelativas datos={datos} materia={materia} para="cursar" />
            <BloqueCorrelativas datos={datos} materia={materia} para="rendir" />
          </div>
        )}

        <form className="dlg-form" id={idFormulario} onSubmit={alEnviar}>
          <div className="field">
            <span className="etiqueta" id={idEstado}>
              Estado
            </span>
            <Segmentado<EstadoMateria>
              idEtiqueta={idEstado}
              columnasCelular={2}
              valor={valores.estado}
              alCambiar={(estado) => {
                setValores((v) => ({ ...v, estado }));
                setTodasLasNotas(false);
              }}
              opciones={ESTADOS_MATERIA.map((estado) => ({
                valor: estado,
                texto: ETIQUETAS_ESTADO[estado],
                icono: ICONO_ESTADO[estado],
                clase: `e-${estado}`,
              }))}
            />
            <span className="hint" role="status">
              {sugerencia?.mensaje}
            </span>
          </div>
          <div className="field" role="group" aria-labelledby={idNotas}>
            <span className="etiqueta" id={idNotas}>
              Notas
            </span>
            {notasVisibles.length ? (
              <div className="nts">
                {notasVisibles.map((campo) => (
                  <SliderNota
                    key={campo}
                    etiqueta={ETIQUETAS_NOTA[campo]}
                    valor={valores[campo]}
                    plan={plan}
                    alCambiar={(valor) => cambiarNota(campo, valor)}
                    alConfirmar={() => confirmarNota(campo)}
                  />
                ))}
              </div>
            ) : (
              <p className="nts-vacio">Todavía no hay notas para cargar en esta materia.</p>
            )}
            {notasVisibles.length < CAMPOS_NOTA.length && (
              <button className="btn-sin" type="button" onClick={() => setTodasLasNotas(true)}>
                Ver todas las notas
              </button>
            )}
          </div>
          <div className="field">
            <label htmlFor={idAplazos}>Aplazos (notas de finales desaprobados)</label>
            <input
              id={idAplazos}
              inputMode="decimal"
              placeholder="Ej.: 2, 3"
              value={textoAplazos}
              onChange={(e) => setTextoAplazos(e.target.value)}
            />
          </div>
        </form>

        {historial.length > 0 && <TablaHistorial eventos={historial} />}

        {editable && (
          <div className="sec">
            <details
              className="edit"
              open={detallesAbiertos}
              onToggle={(e) => setDetallesAbiertos(e.currentTarget.open)}
            >
              <summary>
                {materia ? "Editar nombre, ubicación y correlativas" : "Datos de la materia"}
              </summary>
              <div>
                <div className="field">
                  <label htmlFor={idNombre}>Nombre</label>
                  <input
                    id={idNombre}
                    ref={nombreRef}
                    placeholder="Ej.: Seminario II"
                    value={borrador.nombre}
                    onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))}
                  />
                </div>
                <div className="fgrid">
                  <div className="field">
                    <span className="etiqueta" id={idAnio}>
                      Año
                    </span>
                    <Segmentado<number>
                      idEtiqueta={idAnio}
                      valor={borrador.anio}
                      alCambiar={(anio) => setBorrador((b) => ({ ...b, anio }))}
                      opciones={[...anios]
                        .sort((a, b) => (a || 99) - (b || 99))
                        .map((anio) => ({
                          valor: anio,
                          texto: anio === 0 ? "Extras" : `${anio}°`,
                        }))}
                    />
                  </div>
                  <div className="field">
                    <span className="etiqueta" id={idCuatrimestre}>
                      Cuatrimestre
                    </span>
                    <Segmentado<number | null>
                      idEtiqueta={idCuatrimestre}
                      deshabilitado={borrador.anio === 0}
                      valor={borrador.cuatrimestre}
                      alCambiar={(cuatrimestre) => setBorrador((b) => ({ ...b, cuatrimestre }))}
                      opciones={[
                        { valor: null, texto: "Anual" },
                        ...cuatrimestres
                          .sort((a, b) => a - b)
                          .map((c) => ({ valor: c, texto: `${c}°` })),
                      ]}
                    />
                  </div>
                </div>
                {(["cursar", "rendir"] as const).map((para) => (
                  <fieldset className="grupo-checks" key={para}>
                    <legend>
                      {ETIQUETA_PARA[para]}: tener{" "}
                      {ETIQUETA_CONDICION[CONDICION_PREDETERMINADA[para]]}
                    </legend>
                    <div className="checks">
                      {opcionesCorrelativa.map((opcion) => {
                        const marcada = borrador.correlativas.find(
                          (c) => c.requiereId === opcion.id && c.para === para,
                        );
                        return (
                          <label key={opcion.id}>
                            <input
                              type="checkbox"
                              checked={marcada !== undefined}
                              onChange={(e) =>
                                alternarCorrelativa(opcion.id, para, e.target.checked)
                              }
                            />
                            <span>
                              {opcion.nombre}{" "}
                              <span className="muted">
                                ({lugarMateria(opcion)}
                                {marcada && marcada.condicion !== CONDICION_PREDETERMINADA[para]
                                  ? `, ${ETIQUETA_CONDICION[marcada.condicion]}`
                                  : ""}
                                )
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
                {materia &&
                  (confirmando ? (
                    <div className="confirm" role="alert">
                      <span>
                        ¿Eliminar “{materia.nombre}” con sus notas e historial?{" "}
                        {delaMateria.length > 0 &&
                          `Su material (${delaMateria.length}) no se borra: queda guardado sin materia y privado. `}
                        {dependientes > 0 &&
                          `Deja de ser correlativa de ${
                            dependientes === 1 ? "1 materia" : `${dependientes} materias`
                          }. `}
                        No se puede deshacer.
                      </span>
                      {errorBorrado && <span>{errorBorrado}</span>}
                      <span className="acciones">
                        <button
                          className="btn sm"
                          type="button"
                          disabled={borrando}
                          onClick={() => setConfirmando(false)}
                        >
                          Cancelar
                        </button>
                        <button
                          className="btn sm danger"
                          type="button"
                          disabled={borrando}
                          onClick={() => void borrar()}
                        >
                          {borrando ? "Eliminando…" : "Sí, eliminar"}
                        </button>
                      </span>
                    </div>
                  ) : (
                    <div>
                      <button
                        className="btn danger sm"
                        type="button"
                        onClick={() => setConfirmando(true)}
                      >
                        Eliminar materia
                      </button>
                    </div>
                  ))}
              </div>
            </details>
          </div>
        )}

        {materia && (
          <section className="sec-material" aria-label="Material de estudio">
            <SeccionMaterial
              materiaId={materia.id}
              materiales={delaMateria}
              todos={todos}
              datos={datos}
              compacta
              nota="Se guarda solo, al instante. El botón Guardar es para el estado, las notas y los datos de la materia."
            />
          </section>
        )}

        <div className="dlg-foot">
          {aviso && (
            <p className="msg err" role="alert">
              {aviso}
            </p>
          )}
          {error && (
            <p className="msg err" role="alert">
              No se pudo guardar. {error}
            </p>
          )}
          <button className="btn primary" type="submit" form={idFormulario} disabled={guardando}>
            {guardando ? "Guardando…" : error ? "Reintentar" : "Guardar"}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
