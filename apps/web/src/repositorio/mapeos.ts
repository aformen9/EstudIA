/**
 * Único lugar donde se traduce entre las filas de Postgres (snake_case) y los tipos de `core`
 * (camelCase). Los nombres de columnas que se piden también viven acá, junto a su tipo de fila.
 */
import type {
  BorradorCorrelativa,
  BorradorMateriaPropia,
  Carrera,
  CierreCuatrimestre,
  CondicionCorrelativa,
  Correlativa,
  Documento,
  EstadoCatalogo,
  EstadoMateria,
  EventoHistorial,
  FuenteHistorial,
  Inscripcion,
  Material,
  Materia,
  NuevoDocumento,
  NuevoMaterial,
  ParaCorrelativa,
  Perfil,
  Plan,
  ProgresoMateria,
  ResultadoHistorial,
  TipoHistorial,
  TipoMaterial,
  Universidad,
  VisibilidadMaterial,
} from "@estudia/core";

/* ---------- Catálogo ---------- */

export const COLUMNAS_UNIVERSIDAD = "id, nombre, sigla, sede, estado";

export interface FilaUniversidad {
  id: string;
  nombre: string;
  sigla: string | null;
  sede: string | null;
  estado: EstadoCatalogo;
}

export function universidadDesdeFila(fila: FilaUniversidad): Universidad {
  return {
    id: fila.id,
    nombre: fila.nombre,
    sigla: fila.sigla,
    sede: fila.sede,
    estado: fila.estado,
  };
}

export const COLUMNAS_CARRERA = "id, universidad_id, nombre, sigla, estado";

export interface FilaCarrera {
  id: string;
  universidad_id: string;
  nombre: string;
  sigla: string | null;
  estado: EstadoCatalogo;
}

export function carreraDesdeFila(fila: FilaCarrera): Carrera {
  return {
    id: fila.id,
    universidadId: fila.universidad_id,
    nombre: fila.nombre,
    sigla: fila.sigla,
    estado: fila.estado,
  };
}

export const COLUMNAS_PLAN =
  "id, carrera_id, version, estado, nota_min, nota_max, nota_aprobacion, cuatrimestres_por_anio, cierre_cuatrimestres";

export interface FilaPlan {
  id: string;
  carrera_id: string;
  version: string;
  estado: EstadoCatalogo;
  nota_min: number;
  nota_max: number;
  nota_aprobacion: number;
  cuatrimestres_por_anio: number;
  cierre_cuatrimestres: CierreCuatrimestre[];
}

export function planDesdeFila(fila: FilaPlan): Plan {
  return {
    id: fila.id,
    carreraId: fila.carrera_id,
    version: fila.version,
    estado: fila.estado,
    notaMin: fila.nota_min,
    notaMax: fila.nota_max,
    notaAprobacion: fila.nota_aprobacion,
    cuatrimestresPorAnio: fila.cuatrimestres_por_anio,
    cierreCuatrimestres: fila.cierre_cuatrimestres,
  };
}

/** Plan con sus siglas, por el join plan → carrera → universidad. */
export const COLUMNAS_PLAN_CON_SIGLAS = `${COLUMNAS_PLAN}, carreras(sigla, universidades(sigla))`;

export interface FilaPlanConSiglas extends FilaPlan {
  /** Null si la RLS no deja ver la carrera o la universidad. */
  carreras: { sigla: string | null; universidades: { sigla: string | null } | null } | null;
}

export function siglasDesdeFila(fila: FilaPlanConSiglas): {
  universidadSigla: string | null;
  carreraSigla: string | null;
} {
  return {
    universidadSigla: fila.carreras?.universidades?.sigla ?? null,
    carreraSigla: fila.carreras?.sigla ?? null,
  };
}

export const COLUMNAS_MATERIA =
  "id, plan_id, codigo, nombre, anio, cuatrimestre, tipo, area, requiere_anio_completo_para_cursar, owner_id, orden";

export interface FilaMateria {
  id: string;
  plan_id: string;
  codigo: string | null;
  nombre: string;
  anio: number;
  cuatrimestre: number | null;
  tipo: string;
  area: string | null;
  requiere_anio_completo_para_cursar: number | null;
  owner_id: string | null;
  orden: number;
}

export function materiaDesdeFila(fila: FilaMateria): Materia {
  return {
    id: fila.id,
    planId: fila.plan_id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    anio: fila.anio,
    cuatrimestre: fila.cuatrimestre,
    tipo: fila.tipo,
    area: fila.area,
    requiereAnioCompletoParaCursar: fila.requiere_anio_completo_para_cursar,
    ownerId: fila.owner_id,
    orden: fila.orden,
  };
}

/** Los datos editables de una materia propia; `plan_id`, `owner_id` y `orden` los pone el repositorio. */
export function borradorAFila(borrador: BorradorMateriaPropia) {
  return {
    codigo: borrador.codigo,
    nombre: borrador.nombre,
    anio: borrador.anio,
    cuatrimestre: borrador.cuatrimestre,
    tipo: borrador.tipo,
    area: borrador.area,
    requiere_anio_completo_para_cursar: borrador.requiereAnioCompletoParaCursar,
  };
}

const COLUMNAS_CORRELATIVA = "materia_id, requiere_id, para, condicion";

/** Correlativas con el plan de su materia, para filtrar por plan (la tabla no tiene `plan_id`). */
export const COLUMNAS_CORRELATIVA_CON_PLAN = `${COLUMNAS_CORRELATIVA}, materias!correlativas_materia_id_fkey!inner(plan_id)`;

export interface FilaCorrelativa {
  materia_id: string;
  requiere_id: string;
  para: ParaCorrelativa;
  condicion: CondicionCorrelativa;
}

export function correlativaDesdeFila(fila: FilaCorrelativa): Correlativa {
  return {
    materiaId: fila.materia_id,
    requiereId: fila.requiere_id,
    para: fila.para,
    condicion: fila.condicion,
  };
}

export function correlativaAFila(
  materiaId: string,
  correlativa: BorradorCorrelativa,
): FilaCorrelativa {
  return {
    materia_id: materiaId,
    requiere_id: correlativa.requiereId,
    para: correlativa.para,
    condicion: correlativa.condicion,
  };
}

/* ---------- Alumno ---------- */

export const COLUMNAS_PERFIL = "id, nombre, avatar_url, es_admin";

export interface FilaPerfil {
  id: string;
  nombre: string | null;
  avatar_url: string | null;
  es_admin: boolean;
}

export function perfilDesdeFila(fila: FilaPerfil): Perfil {
  return {
    id: fila.id,
    nombre: fila.nombre,
    avatarUrl: fila.avatar_url,
    esAdmin: fila.es_admin,
  };
}

export const COLUMNAS_INSCRIPCION = "id, plan_id, activa";

export interface FilaInscripcion {
  id: string;
  plan_id: string;
  activa: boolean;
}

export function inscripcionDesdeFila(fila: FilaInscripcion): Inscripcion {
  return { id: fila.id, planId: fila.plan_id, activa: fila.activa };
}

const COLUMNAS_PROGRESO =
  "materia_id, estado, p1, p2, rec, nota_cursada, nota_final_examen, nota, aplazos";

/** Progreso con el plan de su materia, para filtrar por plan. */
export const COLUMNAS_PROGRESO_CON_PLAN = `${COLUMNAS_PROGRESO}, materias!inner(plan_id)`;

export interface FilaProgreso {
  materia_id: string;
  estado: EstadoMateria;
  p1: number | null;
  p2: number | null;
  rec: number | null;
  nota_cursada: number | null;
  nota_final_examen: number | null;
  nota: number | null;
  aplazos: number[];
}

export function progresoDesdeFila(fila: FilaProgreso): ProgresoMateria {
  return {
    materiaId: fila.materia_id,
    estado: fila.estado,
    p1: fila.p1,
    p2: fila.p2,
    rec: fila.rec,
    notaCursada: fila.nota_cursada,
    notaFinalExamen: fila.nota_final_examen,
    nota: fila.nota,
    aplazos: fila.aplazos,
  };
}

/** Sin `user_id`: lo pone la base con `auth.uid()`, y la RLS lo exige. */
export function progresoAFila(progreso: ProgresoMateria): FilaProgreso {
  return {
    materia_id: progreso.materiaId,
    estado: progreso.estado,
    p1: progreso.p1,
    p2: progreso.p2,
    rec: progreso.rec,
    nota_cursada: progreso.notaCursada,
    nota_final_examen: progreso.notaFinalExamen,
    nota: progreso.nota,
    aplazos: progreso.aplazos,
  };
}

const COLUMNAS_HISTORIAL = "materia_id, fecha, tipo, nota, resultado, fuente";

/** Historial con el plan de su materia, para filtrar por plan. */
export const COLUMNAS_HISTORIAL_CON_PLAN = `${COLUMNAS_HISTORIAL}, materias!inner(plan_id)`;

export interface FilaHistorial {
  materia_id: string;
  fecha: string;
  tipo: TipoHistorial;
  nota: number | null;
  resultado: ResultadoHistorial;
  fuente: FuenteHistorial;
}

export function historialDesdeFila(fila: FilaHistorial): EventoHistorial {
  return {
    materiaId: fila.materia_id,
    fecha: fila.fecha,
    tipo: fila.tipo,
    nota: fila.nota,
    resultado: fila.resultado,
    fuente: fila.fuente,
  };
}

/* ---------- Material ---------- */

export interface FilaDocumento {
  id: string;
  sha256: string;
  mime: string | null;
  bytes: number | null;
  paginas: number | null;
}

export function documentoDesdeFila(fila: FilaDocumento): Documento {
  return {
    id: fila.id,
    sha256: fila.sha256,
    mime: fila.mime,
    bytes: fila.bytes,
    paginas: fila.paginas,
  };
}

export const COLUMNAS_MATERIAL =
  "id, materia_id, tipo, titulo, url, texto, drive_file_id, visibilidad, anonimo, periodo, oculto, created_at, documentos(id, sha256, mime, bytes, paginas)";

export interface FilaMaterial {
  id: string;
  materia_id: string | null;
  tipo: TipoMaterial;
  titulo: string;
  url: string | null;
  texto: string | null;
  drive_file_id: string | null;
  visibilidad: VisibilidadMaterial;
  anonimo: boolean;
  periodo: string | null;
  oculto: boolean;
  created_at: string;
  documentos: FilaDocumento | null;
}

/** La base garantiza que cada tipo traiga su contenido: si falta, algo anda mal y conviene saberlo. */
export function materialDesdeFila(fila: FilaMaterial): Material {
  const base = {
    id: fila.id,
    materiaId: fila.materia_id,
    titulo: fila.titulo,
    visibilidad: fila.visibilidad,
    anonimo: fila.anonimo,
    periodo: fila.periodo,
    oculto: fila.oculto,
    createdAt: fila.created_at,
  };
  switch (fila.tipo) {
    case "archivo":
      if (!fila.documentos) throw new Error(`El material ${fila.id} no trae su documento.`);
      return {
        ...base,
        tipo: "archivo",
        documento: documentoDesdeFila(fila.documentos),
        driveFileId: fila.drive_file_id,
      };
    case "link":
      if (fila.url === null) throw new Error(`El material ${fila.id} no trae su url.`);
      return { ...base, tipo: "link", url: fila.url };
    case "nota":
      if (fila.texto === null) throw new Error(`El material ${fila.id} no trae su texto.`);
      return { ...base, tipo: "nota", texto: fila.texto };
  }
}

export interface FilaNuevoMaterial {
  materia_id: string | null;
  tipo: TipoMaterial;
  titulo: string;
  periodo: string | null;
  created_at?: string;
  documento_id?: string;
  url?: string;
  texto?: string;
}

/** Sin `created_at` si no viene: lo pone la base. `periodo` y `createdAt` llegan al restaurar. */
export function nuevoMaterialAFila(material: NuevoMaterial): FilaNuevoMaterial {
  const base = {
    materia_id: material.materiaId,
    tipo: material.tipo,
    titulo: material.titulo,
    periodo: material.periodo ?? null,
    ...(material.createdAt ? { created_at: material.createdAt } : {}),
  };
  switch (material.tipo) {
    case "archivo":
      return { ...base, documento_id: material.documentoId };
    case "link":
      return { ...base, url: material.url };
    case "nota":
      return { ...base, texto: material.texto };
  }
}

/** Los parámetros de la RPC `registrar_documento`. */
export function nuevoDocumentoAParametros(documento: NuevoDocumento) {
  return {
    sha256: documento.sha256,
    mime: documento.mime,
    bytes: documento.bytes,
    paginas: documento.paginas,
    texto: documento.texto,
  };
}
