import {
  estadoDe,
  materiasParaAgregar,
  type DatosAlumno,
  type Materia,
  type Material,
} from "@estudia/core";
import { useId, useRef, useState } from "react";
import { Dialogo } from "../interfaz/Dialogo";
import { Icono } from "../interfaz/Iconos";
import { SelectorMateria, type OpcionMateria } from "../interfaz/SelectorMateria";
import { useAccionesMaterial } from "./useMateriales";

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Las materias como opciones del selector, con su estado. */
export function opcionesDeMaterias(datos: DatosAlumno, materias: Materia[]): OpcionMateria[] {
  return materias.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    codigo: m.codigo,
    anio: m.anio,
    estado: estadoDe(datos, m.id),
  }));
}

/** Elegir una materia la agrega enseguida: el diálogo solo sirve para eso. */
function DialogoAgregar({
  material,
  datos,
  opciones,
  alCerrar,
  alAvisar,
}: {
  material: Material;
  datos: DatosAlumno;
  opciones: Materia[];
  alCerrar: () => void;
  alAvisar: (mensaje: string) => void;
}) {
  const { agregarTambien } = useAccionesMaterial();
  const idTitulo = useId();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un id por materia elegida: reintentar la misma no duplica, aunque el pedido anterior haya llegado.
  const ids = useRef(new Map<string, string>());

  function idPara(materiaId: string): string {
    const id = ids.current.get(materiaId) ?? crypto.randomUUID();
    ids.current.set(materiaId, id);
    return id;
  }

  async function agregar(materiaId: string) {
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    const nombre = opciones.find((m) => m.id === materiaId)?.nombre ?? "esa materia";
    try {
      await agregarTambien(material, materiaId, idPara(materiaId));
      alAvisar(`“${material.titulo}” ahora también está en ${nombre}.`);
      alCerrar();
    } catch (fallo) {
      setError(mensajeDe(fallo));
      setOcupado(false);
    }
  }

  return (
    <Dialogo idTitulo={idTitulo} clase="centro" alCerrar={alCerrar}>
      <div className="dlg">
        <div className="dlg-head">
          <div>
            <div className="eyebrow eyebrow-material">{material.titulo}</div>
            <h3 id={idTitulo}>Agregar a otra materia</h3>
          </div>
          <button className="icon-btn" type="button" aria-label="Cerrar" onClick={alCerrar}>
            <Icono nombre="x" />
          </button>
        </div>
        <p className="aviso-cerrar">
          {material.tipo === "archivo"
            ? "Es el mismo archivo: no se duplica ni ocupa más lugar en este dispositivo."
            : "Se crea una copia privada en esa materia."}
        </p>
        <SelectorMateria
          idEtiqueta={idTitulo}
          modo="lista"
          valor={null}
          opciones={opcionesDeMaterias(datos, opciones)}
          alCambiar={(id) => void agregar(id)}
        />
        <p className="msg" role="status">
          {ocupado ? "Guardando…" : null}
        </p>
        {error && (
          <p className="msg err" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

/**
 * "Agregar a otra materia". Las opciones las decide `core`, entre las materias del plan activo y
 * mirando los materiales de todos los planes. Un material oculto por denuncias no se puede sumar a
 * otra materia: sería una forma de volver a publicarlo.
 */
export function AgregarAMateria({
  material,
  todos,
  datos,
  alAvisar,
  clase = "lnk",
}: {
  material: Material;
  todos: Material[];
  datos: DatosAlumno;
  alAvisar: (mensaje: string) => void;
  clase?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const opciones = material.oculto ? [] : materiasParaAgregar(material, todos, datos.materias);
  if (opciones.length === 0) return null;
  return (
    <>
      <button
        className={clase}
        type="button"
        aria-label={`Agregar a otra materia: ${material.titulo}`}
        onClick={() => setAbierto(true)}
      >
        <Icono nombre="plus" />
        Agregar a otra materia
      </button>
      {abierto && (
        <DialogoAgregar
          material={material}
          datos={datos}
          opciones={opciones}
          alCerrar={() => setAbierto(false)}
          alAvisar={alAvisar}
        />
      )}
    </>
  );
}
