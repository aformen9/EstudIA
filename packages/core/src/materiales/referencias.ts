import type { CambiosMaterial, NuevoMaterial, Repositorio } from "../repositorio";
import type { Material, Materia } from "../tipos";

/** Archivos: mismo documento. Links y notas: mismo título y misma url o texto. */
function mismoContenido(a: Material, b: Material): boolean {
  switch (a.tipo) {
    case "archivo":
      return b.tipo === "archivo" && a.documento.id === b.documento.id;
    case "link":
      return b.tipo === "link" && a.url === b.url && a.titulo === b.titulo;
    case "nota":
      return b.tipo === "nota" && a.texto === b.texto && a.titulo === b.titulo;
  }
}

/**
 * Las materias donde el usuario todavía no tiene el contenido de `material`, para "Agregar también
 * a…". Conserva el orden de `materias`. La materia del propio material nunca se ofrece, aunque
 * `materiales` venga desactualizado y no lo incluya.
 */
export function materiasParaAgregar(
  material: Material,
  materiales: Material[],
  materias: Materia[],
): Materia[] {
  const ocupadas = new Set<string | null>([material.materiaId]);
  for (const otro of materiales) {
    if (mismoContenido(material, otro)) ocupadas.add(otro.materiaId);
  }
  return materias.filter((materia) => !ocupadas.has(materia.id));
}

/**
 * Las materias a las que se puede mover `material`: las mismas que para agregar, que ya excluyen a la
 * materia actual. "Sin materia" no está en la lista: es una opción aparte de `moverMaterial`.
 */
export function materiasParaMover(
  material: Material,
  materiales: Material[],
  materias: Materia[],
): Materia[] {
  return materiasParaAgregar(material, materiales, materias);
}

/**
 * La copia de `material` lista para `agregarMaterial`, en otra materia y con un `id` propio. Un
 * archivo apunta al mismo documento. Conserva `titulo` y `periodo`. Nace privada y con su propia
 * fecha: no copia visibilidad, anonimato, `oculto` ni `createdAt`.
 */
export function nuevoMaterialDesde(
  material: Material,
  materiaId: string,
  id: string,
): NuevoMaterial {
  const base = { id, materiaId, titulo: material.titulo, periodo: material.periodo };
  switch (material.tipo) {
    case "archivo":
      return { ...base, tipo: "archivo", documentoId: material.documento.id };
    case "link":
      return { ...base, tipo: "link", url: material.url };
    case "nota":
      return { ...base, tipo: "nota", texto: material.texto };
  }
}

/**
 * True si otra referencia del usuario, distinta de `excluyendoMaterialId`, usa el documento: en ese
 * caso la copia local no se puede borrar. `materiales` tienen que ser TODOS los del usuario, de todos
 * sus planes y no solo los del plan activo: si no, se borraría una copia que otro plan todavía usa.
 */
export function copiaLocalEnUso(
  documentoId: string,
  materiales: Material[],
  excluyendoMaterialId: string,
): boolean {
  return materiales.some(
    (material) =>
      material.id !== excluyendoMaterialId &&
      material.tipo === "archivo" &&
      material.documento.id === documentoId,
  );
}

/** Los topes de la base (arquitectura §4.3): acá para avisar antes de mandar. */
export const LIMITES_MATERIAL = { titulo: 200, url: 2048, notaBytes: 51200 } as const;

/**
 * Crea un material o, si el `id` ya existe, lo deja como `nuevo`. Es lo que necesita un reintento después
 * de un timeout: si el primer intento llegó, `agregarMaterial` devuelve esa fila tal como quedó, y lo
 * que el alumno haya corregido en el medio hay que aplicarlo. Sin cambios no escribe nada más.
 */
export async function agregarOCorregirMaterial(
  repositorio: Repositorio,
  nuevo: NuevoMaterial,
): Promise<Material> {
  let actual = await repositorio.agregarMaterial(nuevo);
  if (actual.materiaId !== nuevo.materiaId) {
    actual = await repositorio.moverMaterial(nuevo.id, nuevo.materiaId);
  }
  const cambios: CambiosMaterial = {};
  if (actual.titulo !== nuevo.titulo) cambios.titulo = nuevo.titulo;
  if (nuevo.tipo === "link" && actual.tipo === "link" && actual.url !== nuevo.url) {
    cambios.url = nuevo.url;
  }
  if (nuevo.tipo === "nota" && actual.tipo === "nota" && actual.texto !== nuevo.texto) {
    cambios.texto = nuevo.texto;
  }
  return Object.keys(cambios).length > 0
    ? repositorio.actualizarMaterial(nuevo.id, cambios)
    : actual;
}
