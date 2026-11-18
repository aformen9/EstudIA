import type {
  BorradorCorrelativa,
  BorradorMateriaPropia,
  DatosImportados,
  Documento,
  NuevoDocumento,
  NuevoMaterial,
  EstadoServicio,
  Repositorio,
  MetricasAdmin,
} from "@estudia/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TIEMPO_MAXIMO_GUARDADO_MS } from "../guardado/almacenGuardado";
import { errorDeReporte } from "./errorReporte";
import {
  COLUMNAS_CARRERA,
  COLUMNAS_CORRELATIVA_CON_PLAN,
  COLUMNAS_INSCRIPCION,
  COLUMNAS_MATERIA,
  COLUMNAS_MATERIAL,
  COLUMNAS_PERFIL,
  COLUMNAS_PLAN,
  COLUMNAS_PLAN_CON_SIGLAS,
  COLUMNAS_PROGRESO_CON_PLAN,
  COLUMNAS_UNIVERSIDAD,
  borradorAFila,
  borradorAParametros,
  carreraDesdeFila,
  correlativaAFila,
  correlativaDesdeFila,
  documentoDesdeFila,
  inscripcionDesdeFila,
  materiaDesdeFila,
  materialDesdeFila,
  nuevoDocumentoAParametros,
  nuevoMaterialAFila,
  perfilDesdeFila,
  planDesdeFila,
  progresoAParametros,
  progresoDesdeFila,
  siglasDesdeFila,
  universidadDesdeFila,
  type FilaCarrera,
  type FilaCorrelativa,
  type FilaInscripcion,
  type FilaMateria,
  type FilaMaterial,
  type FilaPerfil,
  type FilaPlan,
  type FilaPlanConSiglas,
  type FilaProgreso,
  type FilaUniversidad,
  nuevoReporteAFila,
  reporteAdminDesdeFila,
  type FilaReporteAdmin,
} from "./mapeos";
import { errorDeLimite } from "./limites";

interface Respuesta {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function comprobar(contexto: string, { error }: Pick<Respuesta, "error">): void {
  if (error) throw new Error(`${contexto}: ${error.message}`, { cause: error });
}

/** El cliente no valida las filas: los tipos los fijan las columnas pedidas en `mapeos.ts`. */
function filas<T>(contexto: string, respuesta: Respuesta): T {
  comprobar(contexto, respuesta);
  if (respuesta.data === null) throw new Error(`${contexto}: no llegaron datos.`);
  return respuesta.data as T;
}

/**
 * Filtra por el alumno aunque la RLS ya lo haga donde corresponde: a un admin la RLS le deja ver
 * perfiles y materiales ajenos, y además tocar materias del catálogo. Este repositorio trabaja
 * siempre sobre los datos propios de quien tiene la sesión.
 */
export function crearRepositorioSupabase(cliente: SupabaseClient): Repositorio {
  async function idDelAlumno(): Promise<string> {
    const { data, error } = await cliente.auth.getSession();
    comprobar("No se pudo leer la sesión", { error });
    const id = data.session?.user.id;
    if (!id) throw new Error("Hace falta una sesión.");
    return id;
  }

  /**
   * Primero escribe las correlativas nuevas y después saca las viejas: si algo falla, no se pierde
   * ninguna. La tabla no se puede tocar en una transacción desde el cliente.
   */
  async function reemplazarCorrelativas(
    materiaId: string,
    correlativas: BorradorCorrelativa[],
  ): Promise<void> {
    const contexto = "No se pudieron guardar las correlativas";
    if (correlativas.length > 0) {
      comprobar(
        contexto,
        await cliente.from("correlativas").upsert(
          correlativas.map((c) => correlativaAFila(materiaId, c)),
          { onConflict: "materia_id,requiere_id,para" },
        ),
      );
    }
    for (const para of ["cursar", "rendir"] as const) {
      const ids = correlativas.filter((c) => c.para === para).map((c) => c.requiereId);
      let borrado = cliente
        .from("correlativas")
        .delete()
        .eq("materia_id", materiaId)
        .eq("para", para);
      if (ids.length > 0) borrado = borrado.not("requiere_id", "in", `(${ids.join(",")})`);
      comprobar(contexto, await borrado);
    }
  }

  return {
    /* ---------- Catálogo ---------- */

    async listarUniversidades() {
      const respuesta = await cliente
        .from("universidades")
        .select(COLUMNAS_UNIVERSIDAD)
        .order("nombre");
      return filas<FilaUniversidad[]>("No se pudieron leer las universidades", respuesta).map(
        universidadDesdeFila,
      );
    },

    async listarCarreras(universidadId) {
      const respuesta = await cliente
        .from("carreras")
        .select(COLUMNAS_CARRERA)
        .eq("universidad_id", universidadId)
        .order("nombre");
      return filas<FilaCarrera[]>("No se pudieron leer las carreras", respuesta).map(
        carreraDesdeFila,
      );
    },

    async listarPlanes(carreraId) {
      const respuesta = await cliente
        .from("planes")
        .select(COLUMNAS_PLAN)
        .eq("carrera_id", carreraId)
        .order("version");
      return filas<FilaPlan[]>("No se pudieron leer los planes", respuesta).map(planDesdeFila);
    },

    async obtenerPlanCompleto(planId) {
      const [plan, materias, correlativas] = await Promise.all([
        cliente.from("planes").select(COLUMNAS_PLAN_CON_SIGLAS).eq("id", planId).single(),
        cliente
          .from("materias")
          .select(COLUMNAS_MATERIA)
          .eq("plan_id", planId)
          .order("orden")
          .order("codigo"),
        cliente
          .from("correlativas")
          .select(COLUMNAS_CORRELATIVA_CON_PLAN)
          .eq("materias.plan_id", planId),
      ]);
      const filaPlan = filas<FilaPlanConSiglas>("No se pudo leer el plan", plan);
      return {
        plan: planDesdeFila(filaPlan),
        ...siglasDesdeFila(filaPlan),
        materias: filas<FilaMateria[]>("No se pudieron leer las materias", materias).map(
          materiaDesdeFila,
        ),
        correlativas: filas<FilaCorrelativa[]>(
          "No se pudieron leer las correlativas",
          correlativas,
        ).map(correlativaDesdeFila),
      };
    },

    /* ---------- Perfil ---------- */

    async obtenerPerfil() {
      const respuesta = await cliente
        .from("perfiles")
        .select(COLUMNAS_PERFIL)
        .eq("id", await idDelAlumno())
        .single();
      return perfilDesdeFila(filas<FilaPerfil>("No se pudo leer tu perfil", respuesta));
    },

    async actualizarPerfil(cambios) {
      const respuesta = await cliente
        .from("perfiles")
        .update({
          // Solo lo que viene: `undefined` no se manda y no pisa la columna.
          ...(cambios.nombre !== undefined && { nombre: cambios.nombre }),
          ...(cambios.acento !== undefined && { acento: cambios.acento }),
          ...(cambios.tema !== undefined && { tema: cambios.tema }),
        })
        .eq("id", await idDelAlumno())
        .select(COLUMNAS_PERFIL)
        .single();
      return perfilDesdeFila(filas<FilaPerfil>("No se pudo guardar tu perfil", respuesta));
    },

    /* ---------- Inscripciones ---------- */

    async listarInscripciones() {
      const respuesta = await cliente
        .from("inscripciones")
        .select(COLUMNAS_INSCRIPCION)
        .order("created_at");
      return filas<FilaInscripcion[]>("No se pudieron leer tus inscripciones", respuesta).map(
        inscripcionDesdeFila,
      );
    },

    async activarPlan(planId) {
      const respuesta = await cliente.rpc("activar_plan", { plan_id: planId });
      return inscripcionDesdeFila(filas<FilaInscripcion>("No se pudo activar el plan", respuesta));
    },

    /* ---------- Progreso ---------- */

    async obtenerProgreso(planId) {
      const respuesta = await cliente
        .from("progreso")
        .select(COLUMNAS_PROGRESO_CON_PLAN)
        .eq("materias.plan_id", planId);
      return filas<FilaProgreso[]>("No se pudo leer tu progreso", respuesta).map(progresoDesdeFila);
    },

    async guardarProgreso(progreso) {
      comprobar(
        "No se pudo guardar el progreso",
        await cliente
          .rpc("guardar_materia", progresoAParametros(progreso))
          // Corta el pedido de verdad: si no, uno colgado podría llegar después de uno más nuevo.
          .abortSignal(AbortSignal.timeout(TIEMPO_MAXIMO_GUARDADO_MS)),
      );
    },

    /* ---------- Materias propias ---------- */

    async crearMateriaPropia(planId, borrador: BorradorMateriaPropia, id) {
      const contexto = "No se pudo crear la materia";
      const creada = filas<FilaMateria>(
        contexto,
        await cliente.rpc("crear_materia_propia", borradorAParametros(planId, borrador, id)),
      );
      // Un reintento devuelve la fila que ya existía: podría haber nacido en otro plan.
      if (creada.plan_id !== planId) {
        throw new Error(`${contexto}: ese id ya se usó en otro plan.`);
      }
      return materiaDesdeFila(creada);
    },

    async actualizarMateriaPropia(materiaId, borrador: BorradorMateriaPropia) {
      const fila = filas<FilaMateria>(
        "No se pudo guardar la materia",
        await cliente
          .from("materias")
          .update(borradorAFila(borrador))
          .eq("id", materiaId)
          .eq("owner_id", await idDelAlumno())
          .select(COLUMNAS_MATERIA)
          .single(),
      );
      await reemplazarCorrelativas(materiaId, borrador.correlativas);
      return materiaDesdeFila(fila);
    },

    async borrarMateriaPropia(materiaId) {
      const contexto = "No se pudo borrar la materia";
      const borradas = filas<unknown[]>(
        contexto,
        await cliente
          .from("materias")
          .delete()
          .eq("id", materiaId)
          .eq("owner_id", await idDelAlumno())
          .select("id"),
      );
      if (borradas.length === 0) throw new Error(`${contexto}: no existe o no es tuya.`);
    },

    /* ---------- Material ---------- */

    async listarMateriales() {
      const respuesta = await cliente
        .from("materiales")
        .select(COLUMNAS_MATERIAL)
        .eq("user_id", await idDelAlumno())
        .order("created_at")
        .order("id");
      return filas<FilaMaterial[]>("No se pudo leer tu material", respuesta).map(materialDesdeFila);
    },

    async registrarDocumento(documento: NuevoDocumento): Promise<Documento> {
      const respuesta = await cliente.rpc(
        "registrar_documento",
        nuevoDocumentoAParametros(documento),
      );
      const limite = errorDeLimite(respuesta.error);
      if (limite) throw limite;
      const id = filas<string>("No se pudo registrar el archivo", respuesta);
      // La fila todavía no se puede leer: se arma con los datos de entrada.
      return documentoDesdeFila({
        id,
        sha256: documento.sha256,
        mime: documento.mime,
        bytes: documento.bytes,
        paginas: documento.paginas,
      });
    },

    async agregarMaterial(material: NuevoMaterial) {
      const contexto = "No se pudo guardar el material";
      const insercion = await cliente
        .from("materiales")
        .upsert(nuevoMaterialAFila(material), { onConflict: "id", ignoreDuplicates: true });
      const limite = errorDeLimite(insercion.error);
      if (limite) throw limite;
      comprobar(contexto, insercion);
      // Sin fila nueva no se sabe si fue un reintento propio o un id ajeno: lo dice esta lectura. Se
      // filtra por el alumno porque a un admin la RLS le deja ver materiales ajenos. Además, dentro
      // del insert la RLS todavía no deja ver el documento y el embed vendría null.
      const fila = filas<FilaMaterial>(
        contexto,
        await cliente
          .from("materiales")
          .select(COLUMNAS_MATERIAL)
          .eq("id", material.id)
          .eq("user_id", await idDelAlumno())
          .maybeSingle(),
      );
      return materialDesdeFila(fila);
    },

    async moverMaterial(materialId, materiaId) {
      const contexto = "No se pudo mover el material";
      const movidos = filas<FilaMaterial[]>(
        contexto,
        await cliente
          .from("materiales")
          .update({ materia_id: materiaId })
          .eq("id", materialId)
          .eq("user_id", await idDelAlumno())
          .select(COLUMNAS_MATERIAL),
      );
      const [fila] = movidos;
      if (!fila) throw new Error(`${contexto}: no existe o no es tuyo.`);
      return materialDesdeFila(fila);
    },

    async actualizarMaterial(materialId, cambios) {
      const contexto = "No se pudo corregir el material";
      const respuesta = await cliente
        .from("materiales")
        .update(cambios)
        .eq("id", materialId)
        .eq("user_id", await idDelAlumno())
        .select(COLUMNAS_MATERIAL);
      const limite = errorDeLimite(respuesta.error);
      if (limite) throw limite;
      const [fila] = filas<FilaMaterial[]>(contexto, respuesta);
      if (!fila) throw new Error(`${contexto}: no existe o no es tuyo.`);
      return materialDesdeFila(fila);
    },

    async borrarMaterial(materialId) {
      const contexto = "No se pudo borrar el material";
      const borrados = filas<unknown[]>(
        contexto,
        await cliente
          .from("materiales")
          .delete()
          .eq("id", materialId)
          .eq("user_id", await idDelAlumno())
          .select("id"),
      );
      if (borrados.length === 0) throw new Error(`${contexto}: no existe o no es tuyo.`);
    },

    /* ---------- Reportes y admin ---------- */

    async crearReporte(reporte) {
      // Sin .select(): el alumno no puede leer reportes, ni el que acaba de mandar.
      const respuesta = await cliente.from("reportes").insert(nuevoReporteAFila(reporte));
      const rechazo = errorDeReporte(respuesta.error);
      if (rechazo) throw rechazo;
      comprobar("No se pudo enviar el reporte", respuesta);
    },

    async listarReportesAdmin(limite = 50) {
      const respuesta = await cliente.rpc("reportes_admin", { limite });
      return filas<FilaReporteAdmin[]>("No se pudieron leer los reportes", respuesta).map(
        reporteAdminDesdeFila,
      );
    },

    async obtenerMetricasAdmin() {
      const respuesta = await cliente.rpc("metricas_admin");
      return filas<MetricasAdmin>("No se pudieron leer las métricas", respuesta);
    },

    async obtenerEstadoServicio() {
      const { data, error } = await cliente.functions.invoke<EstadoServicio>("estado-servicio");
      if (error || !data) {
        // La función responde { error } con un mensaje propio, sin detalles de UptimeRobot.
        let motivo = "no respondió";
        const contexto: unknown = (error as { context?: unknown } | null)?.context;
        if (contexto instanceof Response) {
          const cuerpo = (await contexto.json().catch(() => null)) as { error?: unknown } | null;
          if (typeof cuerpo?.error === "string") motivo = cuerpo.error;
        }
        throw new Error(`No se pudo leer el estado del servicio: ${motivo}`);
      }
      return data;
    },

    /* ---------- Importación ---------- */

    async reemplazarDatosDelPlan(planId, datos: DatosImportados) {
      // `datos` va en camelCase: es el formato que lee la RPC.
      const respuesta = await cliente.rpc("reemplazar_datos_del_plan", { plan_id: planId, datos });
      return filas<Record<string, string>>("No se pudieron reemplazar tus datos", respuesta);
    },
  };
}
