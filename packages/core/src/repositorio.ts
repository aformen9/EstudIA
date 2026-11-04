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

/** `periodo` y `createdAt` solo hacen falta al restaurar: si no vienen, null y la fecha actual. */
interface NuevoMaterialBase {
  materiaId: string | null;
  titulo: string;
  periodo?: string | null;
  createdAt?: string;
}

/** Datos de un material nuevo. `visibilidad` y `anonimo` se comparten recién en la fase 1b. */
export type NuevoMaterial = NuevoMaterialBase &
  (
    | { tipo: "archivo"; documentoId: string }
    | { tipo: "link"; url: string }
    | { tipo: "nota"; texto: string }
  );

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
  /**
   * Registra por `sha256` sin pisar un texto existente. La RPC devuelve solo el id y la fila no se
   * puede leer hasta tener un material propio: el `Documento` se arma con los datos de entrada.
   */
  registrarDocumento(documento: NuevoDocumento): Promise<Documento>;
  agregarMaterial(material: NuevoMaterial): Promise<Material>;
  borrarMaterial(materialId: string): Promise<void>;

  /**
   * Reemplaza de una vez (todo o nada) `progreso` e `historial` del plan. Hay que activar el plan
   * antes: la RLS rechaza filas de un plan sin inscripción. Devuelve `clave → uuid` de las materias
   * propias del archivo.
   */
  reemplazarDatosDelPlan(planId: string, datos: DatosImportados): Promise<Record<string, string>>;
}
