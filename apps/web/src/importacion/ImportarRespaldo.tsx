import {
  datosAlumnoDesdeImportacion,
  progresoCarrera,
  promedio,
  restaurarMateriales,
  sinDatosCargados,
  type DatosAlumno,
  type MaterialImportado,
  type RespaldoLeido,
} from "@estudia/core";
import { importarArchivo, parsearArchivo } from "@estudia/core/importacion";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { TiempoDeGuardadoAgotado } from "../guardado/almacenGuardado";
import { useFalloVisible } from "../guardado/IndicadorGuardado";
import { consultas, invalidarDatosDelPlan } from "../plan/planActivo";
import { ETIQUETAS_ESTADO, formatoNota } from "../plan/presentacion";
import { useBorrados } from "../materiales/borradosPendientes";
import { LimiteDeDocumento } from "../repositorio/limites";
import { useRepositorio } from "../sesion/sesion";

interface Existentes {
  progreso: number;
  historial: number;
  hayDatos: boolean;
}

type Fase =
  | { fase: "elegir"; ocupado: boolean; error: string | null }
  | {
      fase: "previa";
      archivo: string;
      leido: RespaldoLeido & { formato: "legacy" | "nuevo" };
      existentes: Existentes;
      guardando: boolean;
      error: string | null;
    }
  | {
      fase: "materiales";
      claves: Record<string, string>;
      /** Los que faltan: todos antes del primer intento, después solo los fallidos. */
      pendientes: MaterialImportado[];
      /** Superaron un límite de la base: reintentar no cambiaría nada, así que no se reintentan. */
      rechazados: { titulo: string; motivo: string }[];
      agregados: number;
      omitidos: number;
      restaurando: boolean;
      error: string | null;
    };

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Dato({ nombre, valor }: { nombre: string; valor: string | number }) {
  return (
    <div>
      <dt>{nombre}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

function VistaPrevia({
  datos,
  leido,
}: {
  datos: DatosAlumno;
  leido: RespaldoLeido & { formato: "legacy" | "nuevo" };
}) {
  const { resumen, reporte } = leido;
  const quedaria = datosAlumnoDesdeImportacion(datos, leido.datos);
  const carrera = progresoCarrera(quedaria);
  return (
    <>
      <p className="sub">
        {leido.formato === "legacy" ? "Respaldo de Mi Plan de Estudio." : "Respaldo de EstudIA."}{" "}
        Así quedaría tu plan:
      </p>
      <dl className="datos-previa">
        <Dato nombre="Materias" valor={resumen.totalMaterias} />
        <Dato nombre={ETIQUETAS_ESTADO.aprobada} valor={resumen.porEstado.aprobada} />
        <Dato nombre={ETIQUETAS_ESTADO.cursando} valor={resumen.porEstado.cursando} />
        <Dato nombre={ETIQUETAS_ESTADO.final} valor={resumen.porEstado.final} />
        <Dato nombre={ETIQUETAS_ESTADO.pendiente} valor={resumen.porEstado.pendiente} />
        <Dato nombre="Aprobado" valor={`${carrera.porcentajeAprobado} %`} />
        <Dato nombre="Cursado" valor={`${carrera.porcentajeCursado} %`} />
        <Dato
          nombre="Promedio sin aplazos"
          valor={formatoNota(promedio(quedaria, false).promedio)}
        />
        <Dato
          nombre="Promedio con aplazos"
          valor={formatoNota(promedio(quedaria, true).promedio)}
        />
        <Dato nombre="Eventos de historial" valor={resumen.eventos} />
        <Dato nombre="Materias propias" valor={resumen.materiasPropias} />
        <Dato nombre="Materiales" valor={resumen.materiales} />
      </dl>
      {reporte.avisos.length > 0 && (
        <details className="avisos" open={reporte.avisos.length <= 5}>
          <summary>
            {reporte.avisos.length === 1 ? "1 aviso" : `${reporte.avisos.length} avisos`} sobre el
            archivo
          </summary>
          <ul>
            {reporte.avisos.map((aviso, i) => (
              <li key={i}>{aviso.mensaje}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/**
 * Importa un respaldo legacy o nuevo sobre el plan de `datos`, que ya tiene que estar activo: lee el
 * archivo, muestra la vista previa, reemplaza `progreso` e `historial` (todo o nada) y restaura los
 * materiales (no es todo o nada: los que fallan se pueden reintentar sin duplicar). Termina en Inicio;
 * quien ya está en Inicio pasa `alTerminar`, porque ahí cambiar el hash no haría nada.
 */
export function ImportarRespaldo({
  datos,
  alCancelar,
  alTerminar = () => {
    window.location.hash = "inicio";
  },
}: {
  datos: DatosAlumno;
  alCancelar: () => void;
  alTerminar?: () => void;
}) {
  const repositorio = useRepositorio();
  const borrados = useBorrados();
  const clienteQuery = useQueryClient();
  const idArchivo = useId();
  const planId = datos.plan.id;
  const [estado, setEstado] = useState<Fase>({ fase: "elegir", ocupado: false, error: null });
  const [aceptado, setAceptado] = useState(false);

  // El control que tenía el foco desaparece al cambiar de fase: que no se pierda en la página.
  const contenedor = useRef<HTMLDivElement>(null);
  const faseAnterior = useRef(estado.fase);
  useEffect(() => {
    if (faseAnterior.current !== estado.fase) contenedor.current?.focus();
    faseAnterior.current = estado.fase;
  }, [estado.fase]);

  useFalloVisible(
    estado.fase === "materiales" &&
      !estado.restaurando &&
      (estado.error !== null || estado.pendientes.length > 0 || estado.rechazados.length > 0),
  );

  async function irAInicio() {
    await invalidarDatosDelPlan(clienteQuery, planId);
    alTerminar();
  }

  async function leerArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;
    setEstado({ fase: "elegir", ocupado: true, error: null });
    setAceptado(false);

    const parseado = parsearArchivo(await archivo.text());
    if (!parseado.ok) {
      setEstado({ fase: "elegir", ocupado: false, error: parseado.error });
      return;
    }
    const leido = importarArchivo(parseado.json, datos);
    if (!leido.ok) {
      setEstado({ fase: "elegir", ocupado: false, error: leido.error });
      return;
    }
    try {
      // Se lee de nuevo: lo cacheado podría no saber de lo guardado desde otro dispositivo.
      const opciones = { staleTime: 0 };
      const [progreso, historial] = await Promise.all([
        clienteQuery.fetchQuery({ ...consultas.progreso(repositorio, planId), ...opciones }),
        clienteQuery.fetchQuery({ ...consultas.historial(repositorio, planId), ...opciones }),
      ]);
      setEstado({
        fase: "previa",
        archivo: archivo.name,
        leido,
        existentes: {
          progreso: progreso.length,
          historial: historial.length,
          hayDatos: !sinDatosCargados({ progreso, historial }),
        },
        guardando: false,
        error: null,
      });
    } catch (error) {
      setEstado({
        fase: "elegir",
        ocupado: false,
        error: `No pude comprobar tus datos actuales: ${mensajeDe(error)}`,
      });
    }
  }

  async function restaurar(
    claves: Record<string, string>,
    pendientes: MaterialImportado[],
    rechazados: { titulo: string; motivo: string }[],
    agregados: number,
    omitidos: number,
  ) {
    const base = {
      fase: "materiales" as const,
      claves,
      pendientes,
      rechazados,
      agregados,
      omitidos,
    };
    setEstado({ ...base, restaurando: true, error: null });
    // `core` devuelve los fallidos sin el motivo: esto recuerda cuáles fueron por un límite.
    const limites = new Map<string, LimiteDeDocumento>();
    const limitesDeMaterial = new Map<string, LimiteDeDocumento>();
    const conLimites: typeof repositorio = {
      ...repositorio,
      async registrarDocumento(documento) {
        try {
          return await repositorio.registrarDocumento(documento);
        } catch (error) {
          if (error instanceof LimiteDeDocumento) limites.set(documento.sha256, error);
          throw error;
        }
      },
      async agregarMaterial(material) {
        try {
          return await repositorio.agregarMaterial(material);
        } catch (error) {
          if (error instanceof LimiteDeDocumento) limitesDeMaterial.set(material.id, error);
          throw error;
        }
      },
    };
    const limiteDe = (material: MaterialImportado) =>
      (material.id ? limitesDeMaterial.get(material.id) : undefined) ??
      (material.tipo === "archivo" ? limites.get(material.sha256.toLowerCase()) : undefined);
    try {
      // Antes de mirar qué existe: lo que está por borrarse no puede contar como que ya está.
      await borrados?.ejecutarPendientes();
      const resultado = await restaurarMateriales(conLimites, pendientes, claves, () =>
        crypto.randomUUID(),
      );
      setEstado({
        ...base,
        pendientes: resultado.fallidos.filter((m) => !limiteDe(m)),
        rechazados: [
          ...rechazados,
          ...resultado.fallidos.flatMap((m) => {
            const limite = limiteDe(m);
            return limite ? [{ titulo: m.titulo, motivo: limite.message }] : [];
          }),
        ],
        agregados: agregados + resultado.agregados,
        omitidos: omitidos + resultado.omitidos,
        restaurando: false,
        error: null,
      });
    } catch (error) {
      setEstado({ ...base, restaurando: false, error: mensajeDe(error) });
    }
    await invalidarDatosDelPlan(clienteQuery, planId);
  }

  async function confirmar() {
    if (estado.fase !== "previa" || estado.guardando) return;
    const { leido } = estado;
    setEstado({ ...estado, guardando: true, error: null });
    let claves: Record<string, string>;
    try {
      claves = await repositorio.reemplazarDatosDelPlan(planId, leido.datos);
    } catch (error) {
      setEstado({
        ...estado,
        guardando: false,
        // Pasado el tiempo máximo no se sabe qué pasó: decir "no se guardó nada" podría ser falso.
        error:
          error instanceof TiempoDeGuardadoAgotado
            ? `${error.message} Mirá Inicio antes de volver a intentar.`
            : `No se guardó nada. ${mensajeDe(error)}`,
      });
      return;
    }
    if (leido.materiales.length === 0) {
      await irAInicio();
      return;
    }
    void invalidarDatosDelPlan(clienteQuery, planId);
    await restaurar(claves, leido.materiales, [], 0, 0);
  }

  if (estado.fase === "materiales") {
    const { claves, pendientes, rechazados, agregados, omitidos, restaurando, error } = estado;
    const terminado = !restaurando && error === null;
    return (
      <div className="importar" ref={contenedor} tabIndex={-1}>
        <p className="msg">Tus materias, notas e historial ya están guardados.</p>
        {restaurando && (
          <p className="sub" role="status">
            Restaurando tus materiales…
          </p>
        )}
        {error && (
          <p className="msg err" role="alert">
            No pude restaurar tus materiales: {error}
          </p>
        )}
        {terminado && (
          <div role="status">
            <h3>Materiales</h3>
            <dl className="datos-previa">
              <Dato nombre="Agregados" valor={agregados} />
              <Dato nombre="Omitidos (ya estaban)" valor={omitidos} />
              <Dato nombre="Fallaron" valor={pendientes.length} />
              {rechazados.length > 0 && (
                <Dato nombre="Rechazados por un límite" valor={rechazados.length} />
              )}
            </dl>
          </div>
        )}
        {terminado && pendientes.length > 0 && (
          <div role="alert">
            <p className="msg err">Estos materiales no se guardaron:</p>
            <ul className="fallidos">
              {pendientes.map((material, i) => (
                <li key={i}>{material.titulo}</li>
              ))}
            </ul>
          </div>
        )}
        {terminado && rechazados.length > 0 && (
          <div role="alert">
            <p className="msg err">Estos no entraron, y reintentar no cambiaría nada:</p>
            <ul className="fallidos">
              {rechazados.map((rechazado, i) => (
                <li key={i}>
                  “{rechazado.titulo}” {rechazado.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="acciones">
          {!restaurando && (error !== null || pendientes.length > 0) && (
            <button
              className="btn"
              type="button"
              onClick={() => void restaurar(claves, pendientes, rechazados, agregados, omitidos)}
            >
              {error !== null ? "Reintentar" : "Reintentar los que fallaron"}
            </button>
          )}
          <button
            className="btn primary"
            type="button"
            disabled={restaurando}
            onClick={() => void irAInicio()}
          >
            Ir a Inicio
          </button>
        </div>
      </div>
    );
  }

  if (estado.fase === "previa") {
    const { leido, existentes, guardando, error, archivo } = estado;
    const { hayDatos } = existentes;
    return (
      <div className="importar" ref={contenedor} tabIndex={-1}>
        <p className="sub importar-archivo">{archivo}</p>
        <VistaPrevia datos={datos} leido={leido} />
        {hayDatos && (
          <div className="alert">
            <p>
              <b>Esto reemplaza lo que ya tenés en este plan.</b> Hoy tenés {existentes.progreso}{" "}
              {existentes.progreso === 1 ? "materia" : "materias"} con datos y{" "}
              {existentes.historial} {existentes.historial === 1 ? "evento" : "eventos"} de
              historial: se borran y quedan los del archivo. Tus materiales no se borran.
            </p>
          </div>
        )}
        {hayDatos && (
          <label className="confirmar-reemplazo">
            <input
              type="checkbox"
              checked={aceptado}
              onChange={(e) => setAceptado(e.target.checked)}
            />
            <span>Entiendo que se reemplazan mi progreso y mi historial de este plan.</span>
          </label>
        )}
        {error && (
          <p className="msg err" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button
            className="btn ghost"
            type="button"
            disabled={guardando}
            onClick={() => setEstado({ fase: "elegir", ocupado: false, error: null })}
          >
            Elegir otro archivo
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={guardando || (hayDatos && !aceptado)}
            onClick={() => void confirmar()}
          >
            {guardando ? "Guardando…" : hayDatos ? "Reemplazar mis datos" : "Guardar estos datos"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="importar" ref={contenedor} tabIndex={-1}>
      <p className="sub">
        Elegí un archivo .json de EstudIA o de Mi Plan de Estudio. Antes de guardar te mostramos
        cómo quedaría tu plan.
      </p>
      <div className="acciones">
        <button className="btn ghost" type="button" disabled={estado.ocupado} onClick={alCancelar}>
          Volver
        </button>
        <span className="elegir-archivo">
          <input
            id={idArchivo}
            type="file"
            accept=".json,application/json"
            disabled={estado.ocupado}
            onChange={(e) => void leerArchivo(e)}
          />
          <label className="btn primary" htmlFor={idArchivo}>
            {estado.ocupado ? "Leyendo…" : "Elegir archivo"}
          </label>
        </span>
      </div>
      {estado.error && (
        <p className="msg err" role="alert">
          {estado.error}
        </p>
      )}
    </div>
  );
}
