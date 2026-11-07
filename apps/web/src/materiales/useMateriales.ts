import {
  agregarOCorregirMaterial,
  copiaLocalEnUso,
  LIMITES_MATERIAL,
  nuevoMaterialDesde,
  type Material,
} from "@estudia/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { TiempoDeGuardadoAgotado } from "../guardado/almacenGuardado";
import { clavesPlan, consultas } from "../plan/planActivo";
import { useRepositorio, useSesion } from "../sesion/sesion";
import { archivosDeUsuario, calcularSha256, type ArchivosLocales } from "./archivosLocales";
import { useBorrados, useMaterialesOcultos } from "./borradosPendientes";
import { LimiteDeDocumento } from "../repositorio/limites";
import { normalizarUrlIngresada } from "./seguridad";

/** Arquitectura §7. */
export const TAMANIO_MAXIMO_BYTES = 50 * 1024 * 1024;

export function useUsuarioId(): string {
  const sesion = useSesion();
  if (sesion.estado !== "activa") throw new Error("Hace falta una sesión.");
  return sesion.sesion.user.id;
}

export function useAlmacenDeArchivos(): ArchivosLocales {
  const userId = useUsuarioId();
  return useMemo(() => archivosDeUsuario(userId), [userId]);
}

const claveArchivos = (userId: string) => ["archivos-locales", userId] as const;

/** Qué archivos tiene este dispositivo para este usuario. */
export function useArchivosLocales() {
  const userId = useUsuarioId();
  const almacen = useAlmacenDeArchivos();
  const consulta = useQuery({
    queryKey: claveArchivos(userId),
    queryFn: () => almacen.listar(),
    staleTime: 0,
    retry: false,
  });
  const locales = useMemo(
    () => new Map(consulta.data?.map((archivo) => [archivo.sha256, archivo])),
    [consulta.data],
  );
  return { almacen, locales, cargando: consulta.isPending };
}

/**
 * Lo que ve el alumno, en todos sus planes: sin los que acaba de borrar y todavía puede deshacer.
 * Para saber qué hay de verdad en la nube, como hace el borrado real, hay que leer del repositorio.
 */
export function useMaterialesDelAlumno({ enabled = true }: { enabled?: boolean } = {}) {
  const repositorio = useRepositorio();
  const ocultos = useMaterialesOcultos();
  const consulta = useQuery({ ...consultas.materiales(repositorio), enabled });
  const { data } = consulta;
  const visibles = useMemo(
    () => (ocultos.size ? data?.filter((m) => !ocultos.has(m.id)) : data),
    [data, ocultos],
  );
  return { ...consulta, data: visibles };
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface ResultadoSubida {
  nombre: string;
  error: string | null;
}

/**
 * Un id por formulario: el mismo en cada reintento, aunque el alumno haya corregido algo en el medio.
 * Si el primer intento llegó, `agregarOCorregirMaterial` aplica la corrección sobre esa fila.
 */
export function useIdDeIntento(): string {
  return useState(() => crypto.randomUUID())[0];
}

/**
 * Elegir de nuevo un archivo que falló es reintentar: el id tiene que sobrevivir a cerrar el panel. Se
 * olvida al guardarse. Después de recargar, lo que haya llegado a guardarse lo frena "ya está en esta
 * materia".
 */
const idsDeSubida = new Map<string, string>();

function idDeSubida(clave: string): string {
  const existente = idsDeSubida.get(clave);
  if (existente) return existente;
  const id = crypto.randomUUID();
  idsDeSubida.set(clave, id);
  return id;
}

function comprobarTitulo(titulo: string) {
  if (titulo.trim().length > LIMITES_MATERIAL.titulo) {
    throw new Error(`El título puede tener hasta ${LIMITES_MATERIAL.titulo} caracteres.`);
  }
}

/** El nombre de un archivo puede pasarse del tope del título: se recorta sin perder la extensión. */
export function tituloDeArchivo(nombre: string): string {
  if (nombre.length <= LIMITES_MATERIAL.titulo) return nombre;
  const punto = nombre.lastIndexOf(".");
  const extension = punto > 0 && nombre.length - punto <= 10 ? nombre.slice(punto) : "";
  return nombre.slice(0, LIMITES_MATERIAL.titulo - extension.length) + extension;
}

export function useAccionesMaterial() {
  const repositorio = useRepositorio();
  const clienteQuery = useQueryClient();
  const userId = useUsuarioId();
  const almacen = useAlmacenDeArchivos();
  const borrados = useBorrados();

  async function refrescar() {
    await Promise.all([
      clienteQuery.invalidateQueries({ queryKey: clavesPlan.materiales }),
      clienteQuery.invalidateQueries({ queryKey: claveArchivos(userId) }),
    ]);
  }

  /** Primero la copia local: un material que no se puede abrir en ningún lado no le sirve a nadie. */
  async function subirUno(archivo: File, materiaId: string | null): Promise<string | null> {
    if (archivo.size > TAMANIO_MAXIMO_BYTES) return `"${archivo.name}" pesa más de 50 MB.`;
    const sha256 = await calcularSha256(archivo);
    // Lo que está por borrarse no cuenta: si lo vuelve a subir, ya no se ve en esta materia.
    const ocultos = borrados?.leer().ocultos;
    const materiales = await repositorio.listarMateriales();
    const repetido = materiales.some(
      (m) =>
        !ocultos?.has(m.id) &&
        m.tipo === "archivo" &&
        m.documento.sha256 === sha256 &&
        m.materiaId === materiaId,
    );
    if (repetido) return `"${archivo.name}" ya está en esta materia.`;

    const mime = archivo.type || null;
    const yaEstaba = (await almacen.leer(sha256)) !== null;
    await almacen.guardar({
      sha256,
      nombre: archivo.name,
      mime,
      bytes: archivo.size,
      contenido: archivo,
    });
    const claveSubida = JSON.stringify([userId, sha256, materiaId]);
    try {
      const documento = await repositorio.registrarDocumento({
        sha256,
        mime,
        bytes: archivo.size,
        paginas: null,
        texto: null,
      });
      await repositorio.agregarMaterial({
        id: idDeSubida(claveSubida),
        tipo: "archivo",
        materiaId,
        titulo: tituloDeArchivo(archivo.name),
        documentoId: documento.id,
      });
      idsDeSubida.delete(claveSubida);
    } catch (error) {
      // Sin material en la nube, una copia nueva quedaría ocupando lugar sin que se pueda ver. Pasado
      // el tiempo máximo no se sabe: pudo haberse guardado, y la copia es lo único que abre el archivo.
      const noSeSabe = error instanceof TiempoDeGuardadoAgotado;
      if (!yaEstaba && !noSeSabe) await almacen.borrar(sha256).catch(() => {});
      throw error;
    }
    return null;
  }

  return {
    /** Sigue con los demás si uno falla: cada resultado dice cómo le fue. */
    async subirArchivos(archivos: File[], materiaId: string | null): Promise<ResultadoSubida[]> {
      const resultados: ResultadoSubida[] = [];
      for (const archivo of archivos) {
        try {
          resultados.push({ nombre: archivo.name, error: await subirUno(archivo, materiaId) });
        } catch (error) {
          resultados.push({
            nombre: archivo.name,
            error:
              error instanceof LimiteDeDocumento
                ? `"${archivo.name}" ${error.message}`
                : `No pude subir "${archivo.name}": ${mensajeDe(error)}`,
          });
        }
      }
      await refrescar();
      return resultados;
    },

    /** Rechaza si la URL no es http ni https. `id` es el de este formulario: ver `useIdDeIntento`. */
    async agregarLink(
      materiaId: string | null,
      titulo: string,
      url: string,
      id: string,
    ): Promise<void> {
      const segura = normalizarUrlIngresada(url);
      if (!segura) throw new Error("El link tiene que empezar con http o https.");
      if (segura.length > LIMITES_MATERIAL.url) {
        throw new Error(`El link puede tener hasta ${LIMITES_MATERIAL.url} caracteres.`);
      }
      comprobarTitulo(titulo);
      try {
        await agregarOCorregirMaterial(repositorio, {
          id,
          tipo: "link",
          materiaId,
          // Sin título se ve el link, que puede ser más largo de lo que entra en un título.
          titulo: titulo.trim() || segura.slice(0, LIMITES_MATERIAL.titulo),
          url: segura,
        });
      } finally {
        await refrescar();
      }
    },

    async agregarNota(
      materiaId: string | null,
      titulo: string,
      texto: string,
      id: string,
    ): Promise<void> {
      comprobarTitulo(titulo);
      const textoFinal = texto.trim();
      if (new TextEncoder().encode(textoFinal).length > LIMITES_MATERIAL.notaBytes) {
        throw new Error(
          "La nota es demasiado larga: el máximo es de unos 50 KB de texto. Probá dividirla en notas más cortas.",
        );
      }
      try {
        await agregarOCorregirMaterial(repositorio, {
          id,
          tipo: "nota",
          materiaId,
          titulo: titulo.trim() || "Nota",
          texto: textoFinal,
        });
      } finally {
        await refrescar();
      }
    },

    /** `materiaId` null: sin materia. Un compartido queda privado, lo hace la base. */
    async mover(material: Material, materiaId: string | null): Promise<void> {
      try {
        await repositorio.moverMaterial(material.id, materiaId);
      } finally {
        await refrescar();
      }
    },

    /** Otra referencia al mismo documento; un link o una nota, una copia privada. */
    async agregarTambien(material: Material, materiaId: string, id: string): Promise<void> {
      try {
        await repositorio.agregarMaterial(nuevoMaterialDesde(material, materiaId, id));
      } finally {
        await refrescar();
      }
    },
  };
}

/**
 * El borrado que corre al vencer el plazo de deshacer. Borra la copia local solo si ninguna otra
 * referencia la usa: por eso lee todos los materiales del usuario de la nube, de todos sus planes,
 * sin filtrar por plan ni por los que están por borrarse (esos todavía existen). Devuelve un aviso si
 * el material se borró pero la copia no.
 */
export function useBorradoReal(): (material: Material) => Promise<string | null> {
  const repositorio = useRepositorio();
  const clienteQuery = useQueryClient();
  const userId = useUsuarioId();
  const almacen = useAlmacenDeArchivos();

  return async (material) => {
    await repositorio.borrarMaterial(material.id);
    let aviso: string | null = null;
    if (material.tipo === "archivo") {
      const documentoId = material.documento.id;
      const todos = await repositorio.listarMateriales().catch(() => null);
      if (todos && !copiaLocalEnUso(documentoId, todos, material.id)) {
        try {
          await almacen.borrar(material.documento.sha256);
        } catch (error) {
          aviso = `Borré el material, pero su copia sigue en este dispositivo: ${mensajeDe(error)}`;
        }
      }
    }
    // Saca de la caché antes de dejar de ocultarlo: si releer falla, no vuelve a aparecer.
    clienteQuery.setQueryData<Material[]>(clavesPlan.materiales, (lista) =>
      lista?.filter((m) => m.id !== material.id),
    );
    await Promise.all([
      clienteQuery.invalidateQueries({ queryKey: clavesPlan.materiales }),
      clienteQuery.invalidateQueries({ queryKey: claveArchivos(userId) }),
    ]);
    return aviso;
  };
}
