import { useRef, type KeyboardEvent } from "react";
import { Icono, type NombreIcono } from "./Iconos";

export interface OpcionSegmentada<V> {
  valor: V;
  texto: string;
  icono?: NombreIcono;
  /** Clase extra para el botón elegido, por ejemplo el color de un estado. */
  clase?: string;
}

/**
 * Botones de opción en vez de un `<select>`: un grupo de radios, con flechas para moverse y elegir y un
 * solo punto de tabulación, como los radios nativos.
 */
export function Segmentado<V extends string | number | null>({
  idEtiqueta,
  opciones,
  valor,
  alCambiar,
  deshabilitado = false,
  columnasCelular,
}: {
  idEtiqueta: string;
  opciones: OpcionSegmentada<V>[];
  valor: V;
  alCambiar: (valor: V) => void;
  deshabilitado?: boolean;
  /** En pantallas angostas, cuántas opciones por fila. */
  columnasCelular?: number;
}) {
  const grupo = useRef<HTMLDivElement>(null);
  const elegido = opciones.findIndex((o) => o.valor === valor);
  const conFoco = elegido >= 0 ? elegido : 0;

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    const direccion = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[evento.key];
    let destino: number | null = null;
    if (direccion) destino = (conFoco + direccion + opciones.length) % opciones.length;
    else if (evento.key === "Home") destino = 0;
    else if (evento.key === "End") destino = opciones.length - 1;
    if (destino === null) return;
    evento.preventDefault();
    const opcion = opciones[destino];
    if (!opcion) return;
    alCambiar(opcion.valor);
    grupo.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[destino]?.focus();
  }

  return (
    <div
      ref={grupo}
      className="opc"
      role="radiogroup"
      aria-labelledby={idEtiqueta}
      aria-disabled={deshabilitado || undefined}
      data-columnas-celular={columnasCelular}
      style={{ "--n": opciones.length } as React.CSSProperties}
      onKeyDown={alTeclear}
    >
      {opciones.map((opcion, i) => {
        const marcada = i === elegido;
        return (
          <button
            key={String(opcion.valor)}
            type="button"
            role="radio"
            aria-checked={marcada}
            tabIndex={i === conFoco ? 0 : -1}
            disabled={deshabilitado}
            className={marcada ? ["on", opcion.clase].filter(Boolean).join(" ") : undefined}
            onClick={() => alCambiar(opcion.valor)}
          >
            {opcion.icono && <Icono nombre={opcion.icono} />}
            {opcion.texto}
          </button>
        );
      })}
    </div>
  );
}
