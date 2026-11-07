import { clasificarArchivo, etiquetaDeArchivo, type Material } from "@estudia/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icono } from "../interfaz/Iconos";
import { vistasDeUsuario } from "./archivosLocales";
import { AVISO_EN_OTRO_DISPOSITIVO } from "./ComponentesMaterial";
import { useAlmacenDeArchivos, useArchivosLocales, useUsuarioId } from "./useMateriales";
import {
  enCola,
  generarVistaPrevia,
  VERSION_VISTA,
  type VistaPrevia as Vista,
} from "./vistasPrevias";

/** True cuando el elemento entra en pantalla, y queda así. Sin `IntersectionObserver` (jsdom), nunca. */
function useEnPantalla(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const referencia = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const elemento = referencia.current;
    if (!elemento || visible || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "200px" },
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [visible]);
  return [referencia, visible];
}

/**
 * La guarda en este dispositivo la primera vez que hace falta y después la lee de ahí. PDF.js se baja
 * recién cuando hay que dibujar un PDF que no tiene vista guardada.
 */
function useVista(sha256: string, habilitada: boolean) {
  const userId = useUsuarioId();
  const almacen = useAlmacenDeArchivos();
  const vistas = useMemo(() => vistasDeUsuario(userId), [userId]);
  return useQuery({
    queryKey: ["vista-previa", userId, sha256],
    enabled: habilitada,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<Vista | null> => {
      const guardada = await vistas.leer(sha256).catch(() => null);
      if (guardada?.version === VERSION_VISTA) return guardada;
      const archivo = await almacen.leer(sha256);
      if (!archivo) return null;
      const vista = await enCola(() => generarVistaPrevia(archivo));
      await vistas.guardar(vista).catch(() => undefined);
      return vista;
    },
  });
}

/**
 * Una URL por imagen, que no se revoca: son pocas y chicas, y revocarla al desmontar rompería la
 * imagen si la misma vista se vuelve a mostrar.
 */
const urls = new WeakMap<Blob, string>();
function urlDe(imagen: Blob): string {
  let url = urls.get(imagen);
  if (!url) {
    url = URL.createObjectURL(imagen);
    urls.set(imagen, url);
  }
  return url;
}

function ImagenDeVista({ imagen }: { imagen: Blob }) {
  return <img className="prev-img" src={urlDe(imagen)} alt="" />;
}

/** Arriba de la tarjeta de un archivo: la vista previa, o un ícono con el tipo. */
export function VistaPrevia({ material }: { material: Extract<Material, { tipo: "archivo" }> }) {
  const { locales, cargando } = useArchivosLocales();
  const local = locales.get(material.documento.sha256);
  const nombre = local?.nombre ?? material.titulo;
  const clase = clasificarArchivo(nombre, local?.mime ?? material.documento.mime);
  const [referencia, visible] = useEnPantalla();
  const conVista = clase !== "otro" && local !== undefined;
  const vista = useVista(material.documento.sha256, conVista && visible);
  const etiqueta = etiquetaDeArchivo(nombre);

  let contenido: React.ReactNode;
  if (conVista && vista.data?.tipo === "imagen") {
    contenido = <ImagenDeVista imagen={vista.data.imagen} />;
  } else if (conVista && vista.data?.tipo === "texto") {
    contenido = <pre className="texto-p">{vista.data.texto}</pre>;
  } else if (conVista && (vista.isPending || !visible)) {
    contenido = <span className="cargando" />;
  } else {
    contenido = (
      <span className="icono-p">
        <Icono nombre="file" />
        <b>{etiqueta}</b>
        {!cargando && !local && <small>{AVISO_EN_OTRO_DISPOSITIVO}</small>}
      </span>
    );
  }

  return (
    <div className="prev" ref={referencia} aria-hidden="true">
      {(vista.data?.tipo === "imagen" || vista.data?.tipo === "texto") && (
        <span className="prev-b">{etiqueta}</span>
      )}
      {contenido}
    </div>
  );
}
