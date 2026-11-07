import { useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode, type RefObject } from "react";
import { Dialogo } from "../interfaz/Dialogo";
import type { ArchivosLocales } from "../materiales/archivosLocales";
import { useAlmacenDeArchivos, useUsuarioId } from "../materiales/useMateriales";
import { useConexion } from "./sesion";

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function DialogoCerrarSesion({
  almacen,
  hayArchivos,
  salir,
  alCancelar,
  alBorrar,
  devolverFocoA,
}: {
  almacen: ArchivosLocales;
  hayArchivos: boolean;
  salir: () => Promise<string | null>;
  alCancelar: () => void;
  alBorrar: () => void;
  devolverFocoA?: RefObject<HTMLElement | null>;
}) {
  const idTitulo = useId();
  const [borrarArchivos, setBorrarArchivos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Primero se borra: sin sesión, esta pantalla ya no estaría para avisar si falló. */
  async function confirmar() {
    setOcupado(true);
    setError(null);
    let borrados = false;
    if (borrarArchivos) {
      try {
        await almacen.borrarTodo();
        borrados = true;
        alBorrar();
      } catch (fallo) {
        setError(
          `No pude borrar tus archivos: siguen en este dispositivo y no cerré la sesión. ` +
            `Podés reintentar o destildar la casilla. (${mensajeDe(fallo)})`,
        );
        setOcupado(false);
        return;
      }
    }
    const falloAlSalir = await salir();
    if (falloAlSalir) {
      setError(
        borrados
          ? `Tus archivos de este dispositivo ya se borraron, pero no pude cerrar la sesión: ${falloAlSalir}`
          : `No pude cerrar la sesión: ${falloAlSalir}`,
      );
      if (borrados) setBorrarArchivos(false);
      setOcupado(false);
    }
  }

  return (
    <Dialogo idTitulo={idTitulo} clase="centro" alCerrar={alCancelar} devolverFocoA={devolverFocoA}>
      <div className="dlg">
        <div className="dlg-head">
          <h3 id={idTitulo}>Cerrar sesión</h3>
        </div>
        {hayArchivos ? (
          <>
            <p className="aviso-cerrar">
              Se cierra solo en este dispositivo. Tus materias y notas siguen en la nube, y tus
              archivos siguen en este dispositivo.
            </p>
            <label className="confirmar-reemplazo">
              <input
                type="checkbox"
                checked={borrarArchivos}
                disabled={ocupado}
                onChange={(e) => setBorrarArchivos(e.target.checked)}
              />
              <span>Borrar también mis archivos de este dispositivo</span>
            </label>
            <p className="aviso-cerrar">
              Por ahora (fase 0) no están en ningún otro lado: si los borrás, no se pueden
              recuperar.
            </p>
          </>
        ) : (
          <p className="aviso-cerrar">
            Se cierra solo en este dispositivo. Tus materias y notas siguen en la nube.
          </p>
        )}
        {error && (
          <p className="msg err" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button className="btn ghost" type="button" disabled={ocupado} onClick={alCancelar}>
            Cancelar
          </button>
          <button
            className={borrarArchivos ? "btn danger" : "btn primary"}
            type="button"
            disabled={ocupado}
            onClick={() => void confirmar()}
          >
            {ocupado ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}

/**
 * Cerrar sesión desde cualquier lugar: solo este dispositivo, las otras sesiones siguen abiertas
 * (decisión de Agu). Sin archivos en este dispositivo no hay casilla para borrarlos, y con
 * `preguntarSoloConArchivos` (el onboarding) ni siquiera hay diálogo: cierra directo.
 */
export function useCerrarSesion({
  preguntarSoloConArchivos = false,
  devolverFocoA,
}: {
  preguntarSoloConArchivos?: boolean;
  devolverFocoA?: RefObject<HTMLElement | null>;
}): { pedir: () => Promise<void>; dialogo: ReactNode; error: string | null } {
  const { cliente } = useConexion();
  const clienteQuery = useQueryClient();
  const userId = useUsuarioId();
  const almacen = useAlmacenDeArchivos();
  const [abierto, setAbierto] = useState(false);
  const [hayArchivos, setHayArchivos] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function salir(): Promise<string | null> {
    const { error: fallo } = await cliente.auth.signOut({ scope: "local" });
    return fallo ? fallo.message : null;
  }

  async function pedir() {
    setError(null);
    // Si no se puede saber, se pregunta: mejor un diálogo de más que dejar archivos sin avisar.
    const cantidad = await almacen.contar().catch(() => 1);
    if (preguntarSoloConArchivos && cantidad === 0) {
      const fallo = await salir();
      if (fallo) setError(`No pude cerrar la sesión: ${fallo}`);
      return;
    }
    setHayArchivos(cantidad > 0);
    setAbierto(true);
  }

  const dialogo = abierto ? (
    <DialogoCerrarSesion
      almacen={almacen}
      hayArchivos={hayArchivos}
      salir={async () => {
        const fallo = await salir();
        if (!fallo) setAbierto(false);
        return fallo;
      }}
      alCancelar={() => setAbierto(false)}
      alBorrar={() =>
        void clienteQuery.invalidateQueries({ queryKey: ["archivos-locales", userId] })
      }
      devolverFocoA={devolverFocoA}
    />
  ) : null;

  return { pedir, dialogo, error };
}
