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
  /** Uuid generado por quien llama. Ver "Idempotencia" en `Repositorio`. */
  id: string;
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

/** Lo que se puede corregir de un material ya creado. */
export interface CambiosMaterial {
  titulo?: string;
  url?: string;
  texto?: string;
}

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
 *
 * Idempotencia: `crearMateriaPropia` y `agregarMaterial` reciben un `id` generado por quien llama,
 * para que un reintento después de un timeout no duplique. Repetir la llamada con el mismo `id`
 * devuelve la fila existente, tal como está: no crea otra ni pisa la existente, aunque los demás
 * datos de la llamada sean distintos. Para que un reintento sirva, quien llama usa el mismo `id` en
 * todos los intentos de una misma creación y uno nuevo para cada creación distinta. Si el `id` ya es
 * de otro usuario, o de una fila que el usuario no puede ver, la llamada rechaza.
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
  /**
   * Idempotente por `id`. La materia y sus correlativas se crean juntas: un reintento devuelve la
   * fila sin tocar correlativas, así que no puede quedar visible una materia sin las suyas.
   */
  crearMateriaPropia(planId: string, borrador: BorradorMateriaPropia, id: string): Promise<Materia>;
  actualizarMateriaPropia(materiaId: string, borrador: BorradorMateriaPropia): Promise<Materia>;
  borrarMateriaPropia(materiaId: string): Promise<void>;

  /* Material */
  /** Solo los del usuario, de todos sus planes, aunque sea admin y la RLS le deje ver más. */
  listarMateriales(): Promise<Material[]>;
  /**
   * Registra por `sha256` sin pisar un texto existente. La RPC devuelve solo el id y la fila no se
   * puede leer hasta tener un material propio: el `Documento` se arma con los datos de entrada.
   */
  registrarDocumento(documento: NuevoDocumento): Promise<Documento>;
  /**
   * Idempotente por `material.id`. El material nuevo es privado. "Agregar también a…" es otra llamada
   * con otro `id` (ver `nuevoMaterialDesde`): crea otra referencia al mismo documento.
   */
  agregarMaterial(material: NuevoMaterial): Promise<Material>;
  /**
   * Pasa un material a otra materia, o a "sin materia" con null, y devuelve la fila actualizada.
   * Un material compartido queda privado. Rechaza si no existe o no es del usuario.
   */
  moverMaterial(materialId: string, materiaId: string | null): Promise<Material>;
  /** Corrige un link o una nota. Rechaza si no existe o no es del usuario. */
  actualizarMaterial(materialId: string, cambios: CambiosMaterial): Promise<Material>;
  borrarMaterial(materialId: string): Promise<void>;

  /**
   * Reemplaza de una vez (todo o nada) `progreso` e `historial` del plan. Hay que activar el plan
   * antes: la RLS rechaza filas de un plan sin inscripción. Devuelve `clave → uuid` de las materias
   * propias del archivo.
   */
  reemplazarDatosDelPlan(planId: string, datos: DatosImportados): Promise<Record<string, string>>;
}
