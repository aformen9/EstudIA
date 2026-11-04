import type {
  BorradorMateriaPropia,
  Carrera,
  DatosImportados,
  Documento,
  EventoHistorial,
  Inscripcion,
  Material,
  Materia,
  Perfil,
  Plan,
  PlanCompleto,
  ProgresoMateria,
  Universidad,
} from "./tipos";

/** Datos de un material nuevo. `visibilidad` y `anonimo` se comparten recién en la fase 1b. */
export type NuevoMaterial =
  | { tipo: "archivo"; materiaId: string | null; titulo: string; documentoId: string }
  | { tipo: "link"; materiaId: string | null; titulo: string; url: string }
  | { tipo: "nota"; materiaId: string | null; titulo: string; texto: string };

export interface NuevoDocumento {
  sha256: string;
  mime: string | null;
  bytes: number | null;
  paginas: number | null;
  texto: string | null;
}

/**
 * Acceso a datos del alumno con sesión. `core` no depende de Supabase: la web implementa esta
 * interfaz y más adelante la usan el MCP y las herramientas de IA. Todo método rechaza con un
 * `Error` si la operación falla.
 */
export interface Repositorio {
  /* Catálogo: solo devuelve lo que la RLS deja ver. */
  listarUniversidades(): Promise<Universidad[]>;
  listarCarreras(universidadId: string): Promise<Carrera[]>;
  listarPlanes(carreraId: string): Promise<Plan[]>;
  obtenerPlanCompleto(planId: string): Promise<PlanCompleto>;

  /* Perfil */
  obtenerPerfil(): Promise<Perfil>;
  actualizarPerfil(cambios: Pick<Perfil, "nombre">): Promise<Perfil>;

  /* Inscripciones: como mucho una activa. */
  listarInscripciones(): Promise<Inscripcion[]>;
  /** Se inscribe si hace falta y deja ese plan como el único activo. */
  activarPlan(planId: string): Promise<Inscripcion>;

  /* Progreso */
  obtenerProgreso(planId: string): Promise<ProgresoMateria[]>;
  guardarProgreso(progreso: ProgresoMateria): Promise<void>;
  obtenerHistorial(planId: string): Promise<EventoHistorial[]>;

  /* Materias propias */
  crearMateriaPropia(planId: string, borrador: BorradorMateriaPropia): Promise<Materia>;
  actualizarMateriaPropia(materiaId: string, borrador: BorradorMateriaPropia): Promise<Materia>;
  borrarMateriaPropia(materiaId: string): Promise<void>;

  /* Material */
  listarMateriales(): Promise<Material[]>;
  /** Registra por `sha256` sin pisar un texto existente. */
  registrarDocumento(documento: NuevoDocumento): Promise<Documento>;
  agregarMaterial(material: NuevoMaterial): Promise<Material>;
  borrarMaterial(materialId: string): Promise<void>;

  /** Reemplaza de una vez (todo o nada) `progreso` e `historial` del plan. */
  reemplazarDatosDelPlan(planId: string, datos: DatosImportados): Promise<void>;
}
