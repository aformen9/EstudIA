import type { NuevoMaterial, Repositorio } from "../repositorio";
import type { Material } from "../tipos";
import type { MaterialImportado } from "./tipos";

/** Dos materiales con la misma identidad son el mismo: mismo contenido en la misma materia. */
function identidad(
  material:
    | { tipo: "archivo"; sha256: string }
    | { tipo: "link"; titulo: string; url: string }
    | { tipo: "nota"; titulo: string; texto: string },
  materiaId: string | null,
): string {
  switch (material.tipo) {
    case "archivo":
      return JSON.stringify([materiaId, "archivo", material.sha256.toLowerCase()]);
    case "link":
      return JSON.stringify([materiaId, "link", material.titulo, material.url]);
    case "nota":
      return JSON.stringify([materiaId, "nota", material.titulo, material.texto]);
  }
}

function identidadDeExistente(material: Material): string {
  return identidad(
    material.tipo === "archivo" ? { tipo: "archivo", sha256: material.documento.sha256 } : material,
    material.materiaId,
  );
}

export interface MaterialesFiltrados {
  aAgregar: MaterialImportado[];
  /** Ya existían o estaban repetidos en el archivo. */
  omitidos: MaterialImportado[];
}

/**
 * Separa los materiales del respaldo que faltan de los que ya existen en la misma materia: archivo con
 * el mismo `sha256`, link con el mismo título y url, nota con el mismo título y texto. "Sin materia"
 * cuenta como una materia más. Traduce cada `materiaId` con las claves que devolvió
 * `reemplazarDatosDelPlan`, y compara ya traducido; los que no están ahí ya son uuid del catálogo. Un
 * material con `id` viene de `fallidos`: ya está traducido y no se vuelve a traducir.
 *
 * Así, un archivo en dos materias vuelve en las dos y restaurar dos veces no duplica. Efecto aceptado:
 * un material movido después del respaldo reaparece en la materia vieja al restaurar, porque ahí ya no
 * está, y sigue también en la nueva.
 */
export function filtrarMaterialesARestaurar(
  importados: MaterialImportado[],
  existentes: Material[],
  claves: Record<string, string>,
): MaterialesFiltrados {
  const vistos = new Set(existentes.map(identidadDeExistente));
  const resultado: MaterialesFiltrados = { aAgregar: [], omitidos: [] };
  for (const material of importados) {
    const { materiaId } = material;
    const destino =
      materiaId === null || material.id !== undefined
        ? materiaId
        : (claves[materiaId] ?? materiaId);
    const clave = identidad(material, destino);
    if (vistos.has(clave)) {
      resultado.omitidos.push(material);
      continue;
    }
    vistos.add(clave);
    resultado.aAgregar.push({ ...material, materiaId: destino });
  }
  return resultado;
}

export interface ResultadoRestaurarMateriales {
  agregados: number;
  omitidos: number;
  /**
   * No se pudieron guardar. Reintentar es seguro: los ya agregados se omiten y cada uno de estos
   * conserva su `id`, por si el pedido llegó a guardarse aunque haya fallado del lado del cliente.
   */
  fallidos: MaterialImportado[];
}

async function agregar(
  repositorio: Repositorio,
  material: MaterialImportado,
  id: string,
): Promise<void> {
  const { materiaId, titulo, periodo, createdAt } = material;
  const base = { id, materiaId, titulo, periodo, createdAt };
  let nuevo: NuevoMaterial;
  switch (material.tipo) {
    case "archivo": {
      const documento = await repositorio.registrarDocumento({
        sha256: material.sha256.toLowerCase(),
        mime: material.mime,
        bytes: material.bytes,
        paginas: material.paginas,
        texto: null,
      });
      nuevo = { ...base, tipo: "archivo", documentoId: documento.id };
      break;
    }
    case "link":
      nuevo = { ...base, tipo: "link", url: material.url };
      break;
    case "nota":
      nuevo = { ...base, tipo: "nota", texto: material.texto };
      break;
  }
  await repositorio.agregarMaterial(nuevo);
}

/**
 * Agrega los materiales de un respaldo sin borrar nada. Va después de `reemplazarDatosDelPlan`, que sí
 * es todo o nada; esto no: un material que falla no frena a los demás y se devuelve en `fallidos`.
 * `generarId` da el uuid de cada material nuevo; lo inyecta quien llama para que `core` siga puro.
 */
export async function restaurarMateriales(
  repositorio: Repositorio,
  importados: MaterialImportado[],
  claves: Record<string, string>,
  generarId: () => string,
): Promise<ResultadoRestaurarMateriales> {
  const existentes = await repositorio.listarMateriales();
  const { aAgregar, omitidos } = filtrarMaterialesARestaurar(importados, existentes, claves);
  const fallidos: MaterialImportado[] = [];
  for (const material of aAgregar) {
    const id = material.id ?? generarId();
    try {
      await agregar(repositorio, material, id);
    } catch {
      fallidos.push({ ...material, id });
    }
  }
  return { agregados: aAgregar.length - fallidos.length, omitidos: omitidos.length, fallidos };
}
