import type {
  BorradorCorrelativa,
  BorradorMateriaPropia,
  DatosImportados,
  Documento,
  NuevoDocumento,
  NuevoMaterial,
  Repositorio,
} from "@estudia/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COLUMNAS_CARRERA,
  COLUMNAS_CORRELATIVA_CON_PLAN,
  COLUMNAS_HISTORIAL_CON_PLAN,
  COLUMNAS_INSCRIPCION,
  COLUMNAS_MATERIA,
  COLUMNAS_MATERIAL,
  COLUMNAS_PERFIL,
  COLUMNAS_PLAN,
  COLUMNAS_PLAN_CON_SIGLAS,
  COLUMNAS_PROGRESO_CON_PLAN,
  COLUMNAS_UNIVERSIDAD,
  borradorAFila,
  carreraDesdeFila,
  correlativaAFila,
  correlativaDesdeFila,
  documentoDesdeFila,
  historialDesdeFila,
  inscripcionDesdeFila,
  materiaDesdeFila,
  materialDesdeFila,
  nuevoDocumentoAParametros,
  nuevoMaterialAFila,
  perfilDesdeFila,
  planDesdeFila,
  progresoAFila,
  progresoDesdeFila,
  siglasDesdeFila,
  universidadDesdeFila,
  type FilaCarrera,
  type FilaCorrelativa,
  type FilaHistorial,
  type FilaInscripcion,
  type FilaMateria,
  type FilaMaterial,
  type FilaPerfil,
  type FilaPlan,
  type FilaPlanConSiglas,
  type FilaProgreso,
  type FilaUniversidad,
} from "./mapeos";

interface Respuesta {
  data: unknown;
  error: { message: string } | null;
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
        .update({ nombre: cambios.nombre })
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
          .from("progreso")
          .upsert(progresoAFila(progreso), { onConflict: "user_id,materia_id" }),
      );
    },

    async obtenerHistorial(planId) {
      const respuesta = await cliente
        .from("historial")
        .select(COLUMNAS_HISTORIAL_CON_PLAN)
        .eq("materias.plan_id", planId)
        .order("fecha");
      return filas<FilaHistorial[]>("No se pudo leer tu historial", respuesta).map(
        historialDesdeFila,
      );
    },

    /* ---------- Materias propias ---------- */

    async crearMateriaPropia(planId, borrador: BorradorMateriaPropia) {
      const contexto = "No se pudo crear la materia";
      const ultima = await cliente
        .from("materias")
        .select("orden")
        .eq("plan_id", planId)
        .order("orden", { ascending: false })
        .limit(1);
      const [fila] = filas<{ orden: number }[]>(contexto, ultima);
      const creada = filas<FilaMateria>(
        contexto,
        await cliente
          .from("materias")
          .insert({
            ...borradorAFila(borrador),
            plan_id: planId,
            owner_id: await idDelAlumno(),
            orden: (fila?.orden ?? 0) + 1,
          })
          .select(COLUMNAS_MATERIA)
          .single(),
      );
      try {
        await reemplazarCorrelativas(creada.id, borrador.correlativas);
      } catch (error) {
        // Una materia a medio crear confundiría al alumno: mejor que no quede nada.
        await cliente.from("materias").delete().eq("id", creada.id);
        throw error;
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
      const id = filas<string>(
        "No se pudo registrar el archivo",
        await cliente.rpc("registrar_documento", nuevoDocumentoAParametros(documento)),
      );
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
      const { id } = filas<{ id: string }>(
        contexto,
        await cliente.from("materiales").insert(nuevoMaterialAFila(material)).select("id").single(),
      );
      // Se relee aparte: dentro del insert, la RLS todavía no deja ver el documento y el embed viene null.
      const fila = filas<FilaMaterial>(
        contexto,
        await cliente.from("materiales").select(COLUMNAS_MATERIAL).eq("id", id).single(),
      );
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

    /* ---------- Importación ---------- */

    async reemplazarDatosDelPlan(planId, datos: DatosImportados) {
      // `datos` va en camelCase: es el formato que lee la RPC.
      const respuesta = await cliente.rpc("reemplazar_datos_del_plan", { plan_id: planId, datos });
      return filas<Record<string, string>>("No se pudieron reemplazar tus datos", respuesta);
    },
  };
}
