import {
  describirDispositivo,
  largoTextoReporte,
  REPORTES_POR_DIA,
  TEXTO_REPORTE_MAX,
  validarTextoReporte,
  type TipoReporte,
} from "@estudia/core";
import { useMutation } from "@tanstack/react-query";
import { useId, useState, type FormEvent, type RefObject } from "react";
import { registrarEvento } from "../analitica/analitica";
import { Dialogo } from "../interfaz/Dialogo";
import { Segmentado, type OpcionSegmentada } from "../interfaz/Segmentado";
import { useRepositorio } from "../sesion/sesion";

const TIPOS: OpcionSegmentada<TipoReporte>[] = [
  { valor: "problema", texto: "Problema" },
  { valor: "sugerencia", texto: "Sugerencia" },
];

function DialogoReportar({
  vista,
  alCerrar,
  devolverFocoA,
}: {
  vista: string | null;
  alCerrar: () => void;
  devolverFocoA?: RefObject<HTMLElement | null>;
}) {
  const repositorio = useRepositorio();
  const idTitulo = useId();
  const idTipo = useId();
  const idTexto = useId();
  const idContador = useId();
  const [tipo, setTipo] = useState<TipoReporte>("problema");
  const [texto, setTexto] = useState("");
  const [contactable, setContactable] = useState(false);
  const largo = largoTextoReporte(texto);
  const validacion = validarTextoReporte(texto);

  const enviar = useMutation({
    mutationFn: (textoValido: string) => {
      // Sin identidad: nombre y versión principal del navegador y del sistema, no el user agent.
      const { navegador, sistema } = describirDispositivo(navigator.userAgent);
      return repositorio.crearReporte({
        tipo,
        texto: textoValido,
        vista,
        contactable,
        navegador,
        sistema,
        versionApp: __VERSION_APP__,
      });
    },
    onSuccess: () => registrarEvento({ nombre: "reportar", datos: { tipo } }),
  });

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (validacion.valido) enviar.mutate(validacion.texto);
  }

  return (
    <Dialogo idTitulo={idTitulo} clase="centro" alCerrar={alCerrar} devolverFocoA={devolverFocoA}>
      <div className="dlg reportar">
        <div className="dlg-head">
          <h3 id={idTitulo}>Reportar un problema o sugerencia</h3>
        </div>
        {enviar.isSuccess ? (
          <>
            <p className="msg ok" role="status">
              ¡Gracias! Lo vamos a leer.
            </p>
            <div className="acciones">
              <button className="btn primary" type="button" onClick={alCerrar}>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={alEnviar}>
            <p className="sub" id={idTipo}>
              ¿Qué querés contarnos?
            </p>
            <Segmentado idEtiqueta={idTipo} opciones={TIPOS} valor={tipo} alCambiar={setTipo} />
            <div className="field">
              <label htmlFor={idTexto}>
                {tipo === "problema" ? "Contanos qué pasó" : "Contanos tu idea"}
              </label>
              <textarea
                id={idTexto}
                rows={5}
                value={texto}
                aria-describedby={idContador}
                aria-invalid={largo > TEXTO_REPORTE_MAX || undefined}
                onChange={(e) => setTexto(e.target.value)}
              />
              <small
                id={idContador}
                className={largo > TEXTO_REPORTE_MAX ? "contador excedido" : "contador"}
              >
                {largo} / {TEXTO_REPORTE_MAX}
              </small>
            </div>
            <label className="confirmar-reemplazo">
              <input
                type="checkbox"
                checked={contactable}
                onChange={(e) => setContactable(e.target.checked)}
              />
              <span>Pueden contactarme por este reporte</span>
            </label>
            <p className="aviso-cerrar">
              Solo si la marcás vemos tu mail. Se mandan además, sin datos tuyos, el navegador, el
              sistema y la versión de la app. Hasta {REPORTES_POR_DIA} reportes por día.
            </p>
            {enviar.error && (
              <p className="msg err" role="alert">
                {enviar.error.message}
              </p>
            )}
            <div className="acciones">
              <button className="btn ghost" type="button" onClick={alCerrar}>
                Cancelar
              </button>
              <button
                className="btn primary"
                type="submit"
                disabled={!validacion.valido || enviar.isPending}
              >
                {enviar.isPending ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Dialogo>
  );
}

/** Abre el diálogo desde cualquier botón. `vista` es desde dónde se reporta, por ejemplo "materiales". */
export function useReportar({
  vista,
  devolverFocoA,
}: {
  vista: string | null;
  devolverFocoA?: RefObject<HTMLElement | null>;
}) {
  const [abierto, setAbierto] = useState(false);
  return {
    abrir: () => setAbierto(true),
    dialogo: abierto ? (
      <DialogoReportar
        vista={vista}
        alCerrar={() => setAbierto(false)}
        devolverFocoA={devolverFocoA}
      />
    ) : null,
  };
}
