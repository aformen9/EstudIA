import { materiasParaAgregar, materiasParaMover, type Materia, type Material } from "@estudia/core";
import { useId, useRef, useState, type FormEvent } from "react";
import { Dialogo } from "../interfaz/Dialogo";
import { useAccionesMaterial } from "./useMateriales";

/** El valor del `<select>` para "Sin materia": ningún uuid de materia está vacío. */
const SIN_MATERIA = "";

type Modo = "mover" | "agregar";

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Selector({
  modo,
  material,
  opciones,
  alCerrar,
  alAvisar,
}: {
  modo: Modo;
  material: Material;
  opciones: Materia[];
  alCerrar: () => void;
  alAvisar: (mensaje: string) => void;
}) {
  const { mover, agregarTambien } = useAccionesMaterial();
  const idTitulo = useId();
  const idSelector = useId();
  const permiteSinMateria = modo === "mover" && material.materiaId !== null;
  const [destino, setDestino] = useState(opciones[0]?.id ?? SIN_MATERIA);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un id por materia elegida: reintentar la misma no duplica, aunque el pedido anterior haya llegado.
  const ids = useRef(new Map<string, string>());

  function idPara(materiaId: string): string {
    const id = ids.current.get(materiaId) ?? crypto.randomUUID();
    ids.current.set(materiaId, id);
    return id;
  }

  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    const nombre = opciones.find((m) => m.id === destino)?.nombre;
    try {
      if (modo === "mover") {
        await mover(material, destino === SIN_MATERIA ? null : destino);
        alAvisar(
          nombre
            ? `“${material.titulo}” ahora está en ${nombre}.`
            : `“${material.titulo}” quedó sin materia.`,
        );
      } else {
        await agregarTambien(material, destino, idPara(destino));
        alAvisar(`“${material.titulo}” ahora también está en ${nombre ?? "esa materia"}.`);
      }
      alCerrar();
    } catch (fallo) {
      setError(mensajeDe(fallo));
      setOcupado(false);
    }
  }

  return (
    <Dialogo idTitulo={idTitulo} clase="centro" alCerrar={alCerrar}>
      <form className="dlg" onSubmit={(e) => void confirmar(e)}>
        <div className="dlg-head">
          <div>
            <div className="eyebrow eyebrow-material">{material.titulo}</div>
            <h3 id={idTitulo}>
              {modo === "mover" ? "Mover a otra materia" : "Agregar también a…"}
            </h3>
          </div>
        </div>
        <div className="field">
          <label htmlFor={idSelector}>Materia</label>
          <select
            id={idSelector}
            value={destino}
            disabled={ocupado}
            onChange={(e) => setDestino(e.target.value)}
          >
            {opciones.map((materia) => (
              <option key={materia.id} value={materia.id}>
                {materia.nombre}
              </option>
            ))}
            {permiteSinMateria && <option value={SIN_MATERIA}>Sin materia</option>}
          </select>
        </div>
        {modo === "mover" && material.visibilidad === "compartido" && (
          <p className="msg" role="note">
            Este material está compartido: al moverlo pasa a privado y deja de verse en el material
            compartido de la materia.
          </p>
        )}
        {modo === "agregar" && (
          <p className="aviso-cerrar">
            {material.tipo === "archivo"
              ? "Es el mismo archivo: no se duplica ni ocupa más lugar en este dispositivo."
              : "Se crea una copia privada en esa materia."}
          </p>
        )}
        {error && (
          <p className="msg err" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button className="btn ghost" type="button" disabled={ocupado} onClick={alCerrar}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={ocupado}>
            {ocupado ? "Guardando…" : modo === "mover" ? "Mover" : "Agregar"}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

/**
 * "Mover a otra materia" y "Agregar también a…". Las opciones las decide `core`, entre las materias
 * del plan activo y mirando los materiales de todos los planes. Un material oculto por denuncias no se
 * puede sumar a otra materia: sería una forma de volver a publicarlo.
 */
export function AccionesReferencia({
  material,
  todos,
  materias,
  alAvisar,
}: {
  material: Material;
  todos: Material[];
  materias: Materia[];
  alAvisar: (mensaje: string) => void;
}) {
  const [abierto, setAbierto] = useState<Modo | null>(null);
  const paraMover = materiasParaMover(material, todos, materias);
  const paraAgregar = material.oculto ? [] : materiasParaAgregar(material, todos, materias);
  const puedeMover = paraMover.length > 0 || material.materiaId !== null;
  if (!puedeMover && paraAgregar.length === 0) return null;

  return (
    <div className="mat-referencias">
      {puedeMover && (
        <button
          className="lnk"
          type="button"
          aria-label={`Mover a otra materia: ${material.titulo}`}
          onClick={() => setAbierto("mover")}
        >
          Mover a otra materia
        </button>
      )}
      {paraAgregar.length > 0 && (
        <button
          className="lnk"
          type="button"
          aria-label={`Agregar también a otra materia: ${material.titulo}`}
          onClick={() => setAbierto("agregar")}
        >
          Agregar también a…
        </button>
      )}
      {abierto && (
        <Selector
          modo={abierto}
          material={material}
          opciones={abierto === "mover" ? paraMover : paraAgregar}
          alCerrar={() => setAbierto(null)}
          alAvisar={alAvisar}
        />
      )}
    </div>
  );
}
