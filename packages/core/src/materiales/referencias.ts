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
 * Una tarjeta de Materiales. Un archivo en varias materias es una sola tarjeta, con una referencia por
 * materia. Un link o una nota es siempre una tarjeta propia: agregarlos a otra materia hace una copia
 * independiente.
 */
export interface TarjetaMaterial {
  /** Estable entre renders: el documento para un archivo, el id del material para lo demás. */
  clave: string;
  /** La referencia más nueva: de ahí salen el título, la fecha y el tipo. */
  principal: Material;
  /** Todas, de la más nueva a la más vieja. */
  referencias: Material[];
}

/**
 * Agrupa los archivos por documento y deja lo demás como está, ordenado del más nuevo al más viejo
 * según la referencia más nueva de cada tarjeta. Agrupa lo que recibe: para el plan activo, pasarle
 * solo los materiales de ese plan.
 */
export function agruparPorArchivo(materiales: Material[]): TarjetaMaterial[] {
  const porClave = new Map<string, Material[]>();
  for (const material of materiales) {
    const clave = material.tipo === "archivo" ? `doc:${material.documento.id}` : material.id;
    const grupo = porClave.get(clave);
    if (grupo) grupo.push(material);
    else porClave.set(clave, [material]);
  }
  const tarjetas = [...porClave].map(([clave, grupo]) => {
    const referencias = [...grupo].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { clave, principal: referencias[0] as Material, referencias };
  });
  return tarjetas.sort((a, b) => b.principal.createdAt.localeCompare(a.principal.createdAt));
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
