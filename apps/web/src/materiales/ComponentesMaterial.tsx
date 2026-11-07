import { LIMITES_MATERIAL, type Materia, type Material } from "@estudia/core";
import { useState, type DragEvent, type FormEvent, type MouseEvent } from "react";
import { descargarBlob } from "../interfaz/descargar";
import { Icono } from "../interfaz/Iconos";
import { formatoPeso } from "../plan/presentacion";
import { useBorrados } from "./borradosPendientes";
import { IconoMaterial } from "./IconoMaterial";
import { AccionesReferencia } from "./ReferenciasMaterial";
import { tipoQueSePuedeAbrir, urlSegura } from "./seguridad";
import { useAccionesMaterial, useArchivosLocales, useIdDeIntento } from "./useMateriales";

const SEGUNDOS_URL_ABIERTA = 60;

export const AVISO_EN_OTRO_DISPOSITIVO =
  "Disponible en el dispositivo donde lo subiste (Drive llega en la fase 1).";

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function AccionArchivo({
  material,
  alFallar,
}: {
  material: Extract<Material, { tipo: "archivo" }>;
  alFallar: (mensaje: string) => void;
}) {
  const { almacen, locales } = useArchivosLocales();
  const { sha256 } = material.documento;
  const local = locales.get(sha256);
  if (!local) return null;
  // Decide el tipo del archivo guardado acá: el de `documentos` lo fijó quien lo registró primero.
  const tipo = tipoQueSePuedeAbrir(local.mime);

  async function abrirODescargar() {
    // La pestaña se abre ya: después de leer, Safari la tomaría como una ventana no pedida.
    const ventana = tipo ? window.open("", "_blank") : null;
    if (ventana) ventana.opener = null;
    try {
      const leido = await almacen.leer(sha256);
      if (!leido) throw new Error("ya no está en este dispositivo.");
      if (ventana && tipo) {
        const url = URL.createObjectURL(new Blob([leido.contenido], { type: tipo }));
        ventana.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), SEGUNDOS_URL_ABIERTA * 1000);
      } else {
        descargarBlob(
          new Blob([leido.contenido], { type: "application/octet-stream" }),
          material.titulo,
        );
      }
    } catch (error) {
      ventana?.close();
      alFallar(`No pude abrir "${material.titulo}": ${mensajeDe(error)}`);
    }
  }

  return (
    <button className="lnk" type="button" onClick={() => void abrirODescargar()}>
      {tipo ? "Abrir" : "Descargar"}
    </button>
  );
}

/** Abrir un link (solo http y https) o un archivo que esté en este dispositivo. */
export function AccionMaterial({
  material,
  alFallar,
}: {
  material: Material;
  alFallar: (mensaje: string) => void;
}) {
  if (material.tipo === "archivo") return <AccionArchivo material={material} alFallar={alFallar} />;
  if (material.tipo !== "link") return null;
  const url = urlSegura(material.url);
  if (!url) return <span className="mat-aviso">Link no válido</span>;
  return (
    <a className="lnk" href={url} target="_blank" rel="noopener noreferrer">
      Abrir
    </a>
  );
}

/** Lo que dice un archivo que no está en este dispositivo. Mientras se averigua, nada. */
export function AvisoDeArchivo({ material }: { material: Material }) {
  const { locales, cargando } = useArchivosLocales();
  if (material.tipo !== "archivo" || cargando || locales.has(material.documento.sha256)) {
    return null;
  }
  return <p className="mat-aviso">{AVISO_EN_OTRO_DISPOSITIVO}</p>;
}

/**
 * El control que tenía el foco desaparece con su material: pasa al material vecino y, si no queda
 * ninguno, al contenedor. Va a propósito lejos de "Deshacer": ahí el foco frenaría el plazo.
 */
function moverFocoAntesDeOcultar(boton: HTMLElement) {
  const fila = boton.closest("[data-material]");
  const filas = [...(fila?.parentElement?.querySelectorAll("[data-material]") ?? [])];
  const indice = fila ? filas.indexOf(fila) : -1;
  const vecina = filas[indice + 1] ?? filas[indice - 1];
  const destino =
    vecina?.querySelector<HTMLElement>(".del") ??
    boton.closest<HTMLElement>("dialog") ??
    document.querySelector<HTMLElement>("main");
  destino?.focus();
}

/** Desaparece al instante, en toda la app; el borrado real pasa al vencer el plazo de "Deshacer". */
export function BotonBorrarMaterial({ material }: { material: Material }) {
  const borrados = useBorrados();

  function alTocar(evento: MouseEvent<HTMLButtonElement>) {
    moverFocoAntesDeOcultar(evento.currentTarget);
    borrados?.pedir(material);
  }

  return (
    <button
      className="del"
      type="button"
      aria-label={`Borrar ${material.titulo}`}
      onClick={alTocar}
    >
      <Icono nombre="x" />
    </button>
  );
}

function FilaMaterial({
  material,
  todos,
  materias,
  alFallar,
  alAvisar,
}: {
  material: Material;
  todos: Material[];
  materias: Materia[];
  alFallar: (mensaje: string) => void;
  alAvisar: (mensaje: string) => void;
}) {
  const [notaVisible, setNotaVisible] = useState(false);
  return (
    <div className="mat-item" data-material={material.id}>
      <IconoMaterial material={material} />
      <span className="t" title={material.titulo}>
        {material.titulo}
        {material.tipo === "archivo" && <small>{formatoPeso(material.documento.bytes)}</small>}
      </span>
      <span className="mat-botones">
        {material.tipo === "nota" ? (
          <button
            className="lnk"
            type="button"
            aria-expanded={notaVisible}
            onClick={() => setNotaVisible((v) => !v)}
          >
            {notaVisible ? "Ocultar" : "Ver"}
          </button>
        ) : (
          <AccionMaterial material={material} alFallar={alFallar} />
        )}
        <BotonBorrarMaterial material={material} />
      </span>
      <AvisoDeArchivo material={material} />
      {material.tipo === "nota" && notaVisible && <p className="mat-nota">{material.texto}</p>}
      <AccionesReferencia
        material={material}
        todos={todos}
        materias={materias}
        alAvisar={alAvisar}
      />
    </div>
  );
}

function FormularioLink({ materiaId, alListo }: { materiaId: string | null; alListo: () => void }) {
  const { agregarLink } = useAccionesMaterial();
  const idDeIntento = useIdDeIntento();
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      await agregarLink(materiaId, titulo, url, idDeIntento);
      alListo();
    } catch (fallo) {
      setError(mensajeDe(fallo));
      setOcupado(false);
    }
  }

  return (
    <form className="mat-form" onSubmit={(e) => void enviar(e)}>
      <input
        className="input"
        aria-label="Título del link"
        placeholder="Título (ej.: Clase grabada 3)"
        maxLength={LIMITES_MATERIAL.titulo}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
      />
      <input
        className="input"
        aria-label="Dirección del link"
        type="text"
        inputMode="url"
        placeholder="https://…"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary" type="submit" disabled={ocupado}>
        {ocupado ? "Guardando…" : "Agregar link"}
      </button>
    </form>
  );
}

function FormularioNota({ materiaId, alListo }: { materiaId: string | null; alListo: () => void }) {
  const { agregarNota } = useAccionesMaterial();
  const idDeIntento = useIdDeIntento();
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      await agregarNota(materiaId, titulo, texto, idDeIntento);
      alListo();
    } catch (fallo) {
      setError(mensajeDe(fallo));
      setOcupado(false);
    }
  }

  return (
    <form className="mat-form" onSubmit={(e) => void enviar(e)}>
      <input
        className="input"
        aria-label="Título de la nota"
        placeholder="Título (ej.: Resumen unidad 2)"
        maxLength={LIMITES_MATERIAL.titulo}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
      />
      <textarea
        className="input"
        aria-label="Texto de la nota"
        placeholder="Escribí tu nota…"
        required
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary" type="submit" disabled={ocupado || !texto.trim()}>
        {ocupado ? "Guardando…" : "Guardar nota"}
      </button>
    </form>
  );
}

/**
 * Lista y carga de material de una materia: la del panel y la del diálogo "Subir material". `todos`
 * son los del alumno en todos sus planes y `materias`, las del plan activo: entre esas se elige al
 * mover o agregar.
 */
export function SeccionMaterial({
  materiaId,
  materiales,
  todos,
  materias,
  nota,
}: {
  materiaId: string;
  materiales: Material[];
  todos: Material[];
  materias: Materia[];
  nota?: string;
}) {
  const { subirArchivos } = useAccionesMaterial();
  const [formulario, setFormulario] = useState<"link" | "nota" | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [estado, setEstado] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const alFallar = (mensaje: string) => setErrores([mensaje]);
  const alAvisar = (mensaje: string) => {
    setErrores([]);
    setEstado(mensaje);
  };

  async function subir(archivos: File[]) {
    if (!archivos.length) return;
    setSubiendo(true);
    setErrores([]);
    setEstado("Guardando tus archivos…");
    const resultados = await subirArchivos(archivos, materiaId);
    const fallidos = resultados.flatMap((r) => (r.error ? [r.error] : []));
    const guardados = resultados.length - fallidos.length;
    setErrores(fallidos);
    setEstado(guardados ? "Material guardado." : null);
    setSubiendo(false);
  }

  function alSoltar(evento: DragEvent) {
    evento.preventDefault();
    setArrastrando(false);
    void subir([...evento.dataTransfer.files]);
  }

  return (
    <>
      <div className="card-h">
        <b className="titulo-material">Material de estudio</b>
        <div className="mat-agregar">
          <label className="elegir-archivo">
            <input
              className="drop-input"
              type="file"
              multiple
              disabled={subiendo}
              aria-label="Elegir archivos"
              onChange={(e) => {
                const archivos = [...(e.target.files ?? [])];
                e.target.value = "";
                void subir(archivos);
              }}
            />
            <span className="btn sm">
              <Icono nombre="upload" />
              Archivos
            </span>
          </label>
          <button
            className="btn sm"
            type="button"
            aria-expanded={formulario === "link"}
            onClick={() => setFormulario((f) => (f === "link" ? null : "link"))}
          >
            <Icono nombre="link" />
            Link
          </button>
          <button
            className="btn sm"
            type="button"
            aria-expanded={formulario === "nota"}
            onClick={() => setFormulario((f) => (f === "nota" ? null : "nota"))}
          >
            <Icono nombre="note" />
            Nota
          </button>
        </div>
      </div>
      {nota && <p className="nota-material">{nota}</p>}
      <div
        className={arrastrando ? "drop over" : "drop"}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={alSoltar}
      >
        Arrastrá acá PDFs, apuntes, fotos o resúmenes (hasta 50 MB cada uno). Quedan guardados en
        este dispositivo.
      </div>
      {formulario === "link" && (
        <FormularioLink materiaId={materiaId} alListo={() => setFormulario(null)} />
      )}
      {formulario === "nota" && (
        <FormularioNota materiaId={materiaId} alListo={() => setFormulario(null)} />
      )}
      <p className="msg" role="status">
        {estado}
      </p>
      {errores.map((error) => (
        <p className="msg err" role="alert" key={error}>
          {error}
        </p>
      ))}
      <div className="mat-list">
        {materiales.length ? (
          materiales.map((material) => (
            <FilaMaterial
              key={material.id}
              material={material}
              todos={todos}
              materias={materias}
              alFallar={alFallar}
              alAvisar={alAvisar}
            />
          ))
        ) : (
          <span className="sub">Todavía no cargaste material para esta materia.</span>
        )}
      </div>
    </>
  );
}
