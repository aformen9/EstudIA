import type { NuevoMaterial, Repositorio } from "../repositorio";
import type { Material } from "../tipos";
import type { MaterialImportado } from "./tipos";

/** Dos materiales con la misma identidad son el mismo, sin importar en qué materia estén. */
function identidad(
  material:
    | { tipo: "archivo"; sha256: string }
    | { tipo: "link"; titulo: string; url: string }
    | { tipo: "nota"; titulo: string; texto: string },
): string {
  switch (material.tipo) {
    case "archivo":
      return JSON.stringify(["archivo", material.sha256.toLowerCase()]);
    case "link":
      return JSON.stringify(["link", material.titulo, material.url]);
    case "nota":
      return JSON.stringify(["nota", material.titulo, material.texto]);
  }
}

function identidadDeExistente(material: Material): string {
  return identidad(
    material.tipo === "archivo" ? { tipo: "archivo", sha256: material.documento.sha256 } : material,
  );
}

export interface MaterialesFiltrados {
  aAgregar: MaterialImportado[];
  /** Ya existían o estaban repetidos en el archivo. */
  omitidos: MaterialImportado[];
}

/**
 * Separa los materiales del respaldo que faltan de los que ya existen: archivo con el mismo `sha256`,
 * link con el mismo título y url, nota con el mismo título y texto. Traduce cada `materiaId` con las
 * claves que devolvió `reemplazarDatosDelPlan`; los que no están ahí ya son uuid del catálogo.
 */
export function filtrarMaterialesARestaurar(
  importados: MaterialImportado[],
  existentes: Material[],
  claves: Record<string, string>,
): MaterialesFiltrados {
  const vistos = new Set(existentes.map(identidadDeExistente));
  const resultado: MaterialesFiltrados = { aAgregar: [], omitidos: [] };
  for (const material of importados) {
    const clave = identidad(material);
    if (vistos.has(clave)) {
      resultado.omitidos.push(material);
      continue;
    }
    vistos.add(clave);
    const { materiaId } = material;
    resultado.aAgregar.push({
      ...material,
      materiaId: materiaId === null ? null : (claves[materiaId] ?? materiaId),
    });
  }
  return resultado;
}

export interface ResultadoRestaurarMateriales {
  agregados: number;
  omitidos: number;
  /** No se pudieron guardar. Reintentar es seguro: los ya agregados se omiten. */
  fallidos: MaterialImportado[];
}

async function agregar(repositorio: Repositorio, material: MaterialImportado): Promise<void> {
  const { materiaId, titulo, periodo, createdAt } = material;
  const base = { materiaId, titulo, periodo, createdAt };
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
 */
export async function restaurarMateriales(
  repositorio: Repositorio,
  importados: MaterialImportado[],
  claves: Record<string, string>,
): Promise<ResultadoRestaurarMateriales> {
  const existentes = await repositorio.listarMateriales();
  const { aAgregar, omitidos } = filtrarMaterialesARestaurar(importados, existentes, claves);
  const fallidos: MaterialImportado[] = [];
  for (const material of aAgregar) {
    try {
      await agregar(repositorio, material);
    } catch {
      fallidos.push(material);
    }
  }
  return { agregados: aAgregar.length - fallidos.length, omitidos: omitidos.length, fallidos };
}
