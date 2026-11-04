/**
 * Tipos del dominio: el contrato entre `core`, `web` y `db`.
 * Reflejan docs/arquitectura.md §4 en camelCase; el `Repositorio` traduce desde y hacia snake_case.
 * Las fechas `date` son strings "YYYY-MM-DD"; las `timestamptz`, strings ISO.
 */

export const ESTADOS_MATERIA = ["pendiente", "cursando", "final", "aprobada"] as const;
export type EstadoMateria = (typeof ESTADOS_MATERIA)[number];

export type EstadoCatalogo = "publicado" | "pendiente";
export type ParaCorrelativa = "cursar" | "rendir";
export type CondicionCorrelativa = "regular" | "aprobada";
export type TipoHistorial = "Regularidad" | "Examen" | "Promocion" | "En curso";
export type ResultadoHistorial = "Aprobado" | "Reprobado" | "Ausente" | "Promocionado" | "En curso";
export type FuenteHistorial = "siu" | "manual" | "ia";
export type TipoMaterial = "archivo" | "link" | "nota";
export type VisibilidadMaterial = "privado" | "compartido";
export type ExtraidoCon = "pdfjs" | "ocr" | "ia";

/* ---------- Catálogo ---------- */

export interface Universidad {
  id: string;
  nombre: string;
  sigla: string | null;
  sede: string | null;
  estado: EstadoCatalogo;
}

export interface Carrera {
  id: string;
  universidadId: string;
  nombre: string;
  sigla: string | null;
  estado: EstadoCatalogo;
}

export interface CierreCuatrimestre {
  cuatrimestre: number;
  mes: number;
}

export interface Plan {
  id: string;
  carreraId: string;
  version: string;
  estado: EstadoCatalogo;
  notaMin: number;
  notaMax: number;
  notaAprobacion: number;
  cuatrimestresPorAnio: number;
  cierreCuatrimestres: CierreCuatrimestre[];
}

export interface Materia {
  id: string;
  planId: string;
  /** Null solo en materias propias: las del catálogo siempre tienen código. */
  codigo: string | null;
  nombre: string;
  /** 0 = extras/idiomas. */
  anio: number;
  /** Null si es anual o extra. */
  cuatrimestre: number | null;
  tipo: string;
  area: string | null;
  requiereAnioCompletoParaCursar: number | null;
  /** Null = del catálogo; uuid = materia propia del alumno. */
  ownerId: string | null;
  orden: number;
}

export interface Correlativa {
  materiaId: string;
  requiereId: string;
  para: ParaCorrelativa;
  condicion: CondicionCorrelativa;
}

/** Un plan con todo lo visible para el alumno, incluidas sus materias propias. */
export interface PlanCompleto {
  plan: Plan;
  /** Junto con `plan.version`, identifican al plan entre entornos (los uuid cambian). */
  universidadSigla: string | null;
  carreraSigla: string | null;
  materias: Materia[];
  correlativas: Correlativa[];
}

/* ---------- Alumno ---------- */

export interface Perfil {
  id: string;
  nombre: string | null;
  avatarUrl: string | null;
  esAdmin: boolean;
}

export interface Inscripcion {
  id: string;
  planId: string;
  activa: boolean;
}

/** Si una materia no tiene fila de progreso, está `pendiente`. */
export interface ProgresoMateria {
  materiaId: string;
  estado: EstadoMateria;
  p1: number | null;
  p2: number | null;
  rec: number | null;
  notaCursada: number | null;
  notaFinalExamen: number | null;
  nota: number | null;
  aplazos: number[];
}

export interface EventoHistorial {
  materiaId: string;
  fecha: string;
  tipo: TipoHistorial;
  nota: number | null;
  resultado: ResultadoHistorial;
  fuente: FuenteHistorial;
}

/** Entrada de todos los cálculos de `core`. */
export interface DatosAlumno extends PlanCompleto {
  progreso: ProgresoMateria[];
  historial: EventoHistorial[];
}

/* ---------- Material ---------- */

export interface Documento {
  id: string;
  sha256: string;
  mime: string | null;
  bytes: number | null;
  paginas: number | null;
}

interface MaterialBase {
  id: string;
  /** Null = "sin materia"; en ese caso la visibilidad siempre es `privado`. */
  materiaId: string | null;
  titulo: string;
  visibilidad: VisibilidadMaterial;
  anonimo: boolean;
  periodo: string | null;
  oculto: boolean;
  createdAt: string;
}

export interface MaterialArchivo extends MaterialBase {
  tipo: "archivo";
  documento: Documento;
  driveFileId: string | null;
}

export interface MaterialLink extends MaterialBase {
  tipo: "link";
  url: string;
}

export interface MaterialNota extends MaterialBase {
  tipo: "nota";
  texto: string;
}

export type Material = MaterialArchivo | MaterialLink | MaterialNota;

/* ---------- Materias propias e importación ---------- */

/** Correlativa de una materia propia antes de existir en la base. */
export interface BorradorCorrelativa {
  requiereId: string;
  para: ParaCorrelativa;
  condicion: CondicionCorrelativa;
}

export interface BorradorMateriaPropia {
  codigo: string | null;
  nombre: string;
  anio: number;
  cuatrimestre: number | null;
  tipo: string;
  area: string | null;
  requiereAnioCompletoParaCursar: number | null;
  correlativas: BorradorCorrelativa[];
}

/**
 * Materia propia dentro de una importación. `clave` identifica a la materia dentro del archivo
 * (código o id del respaldo), porque todavía no tiene uuid. Las correlativas y filas de abajo
 * apuntan a un uuid del catálogo o a la `clave` de otra materia propia del mismo archivo.
 */
export interface MateriaPropiaImportada extends Omit<BorradorMateriaPropia, "correlativas"> {
  clave: string;
  correlativas: { requiere: string; para: ParaCorrelativa; condicion: CondicionCorrelativa }[];
}

/**
 * Lo que produce un importador. Se aplica de una vez y reemplaza `progreso` e `historial`
 * del plan. En `progreso` e `historial`, `materiaId` es un uuid del catálogo o una `clave`.
 */
export interface DatosImportados {
  materiasPropias: MateriaPropiaImportada[];
  progreso: ProgresoMateria[];
  historial: EventoHistorial[];
}
