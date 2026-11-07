import {
  leerNotaEscrita,
  notaAUnEntero,
  notaAUnPaso,
  notaEnPosicion,
  posicionDeNota,
  type Plan,
} from "@estudia/core";
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatoNota } from "../plan/presentacion";

type EscalaDelPlan = Pick<Plan, "notaMin" | "notaMax" | "notaPaso" | "notaAprobacion">;

/** Lo que se mueve el dedo antes de decidir si es un arrastre del slider o un scroll de la página. */
const UMBRAL_TACTIL_PX = 4;

interface Arrastre {
  id: number;
  x: number;
  y: number;
  tactil: boolean;
  activo: boolean;
  original: number | null;
}

function etiquetasDeEscala(plan: EscalaDelPlan): number[] {
  const enteros: number[] = [];
  for (let n = Math.ceil(plan.notaMin); n <= plan.notaMax; n++) enteros.push(n);
  const salto = Math.ceil(enteros.length / 11);
  return enteros.filter((_, i) => i % salto === 0 || i === enteros.length - 1);
}

/**
 * Nota con slider: escala y paso del plan, imán en los enteros, − y + de a un paso, el número se toca
 * para escribirlo y "Sin nota" aparte. `alCambiar` va en vivo al deslizar; `alConfirmar`, al soltar o
 * con cada tecla o botón: ahí se aplica lo que depende de la nota, como pasar la materia a Aprobada.
 */
export function SliderNota({
  etiqueta,
  valor,
  plan,
  alCambiar,
  alConfirmar,
}: {
  etiqueta: string;
  valor: number | null;
  plan: EscalaDelPlan;
  alCambiar: (valor: number | null) => void;
  alConfirmar: (valor: number | null) => void;
}) {
  const idEtiqueta = useId();
  const idError = useId();
  const riel = useRef<HTMLDivElement>(null);
  const pista = useRef<HTMLDivElement>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);

  const vacia = valor == null;
  const porcentaje = vacia ? 0 : posicionDeNota(valor, plan) * 100;
  const textoValor = vacia ? "Sin nota" : formatoNota(valor);

  function poner(nuevo: number | null, confirmar: boolean) {
    if (nuevo !== valor) alCambiar(nuevo);
    if (confirmar) alConfirmar(nuevo);
  }

  function notaEn(clientX: number): number {
    const r = riel.current?.getBoundingClientRect();
    if (!r || r.width === 0) return valor ?? plan.notaAprobacion;
    return notaEnPosicion((clientX - r.left) / r.width, plan);
  }

  function capturar(el: HTMLElement, id: number) {
    try {
      el.setPointerCapture(id);
    } catch {
      // Un puntero que ya terminó no se puede capturar: el arrastre sigue igual sin captura.
    }
  }

  function alApoyar(evento: PointerEvent<HTMLDivElement>) {
    if (evento.button > 0) return;
    const tactil = evento.pointerType === "touch";
    arrastre.current = {
      id: evento.pointerId,
      x: evento.clientX,
      y: evento.clientY,
      tactil,
      activo: !tactil,
      original: valor,
    };
    // Con el dedo se espera a ver si es un scroll; con el mouse cambia ya.
    if (!tactil) {
      evento.preventDefault();
      capturar(evento.currentTarget, evento.pointerId);
      evento.currentTarget.focus();
      poner(notaEn(evento.clientX), false);
    }
  }

  function alMover(evento: PointerEvent<HTMLDivElement>) {
    const a = arrastre.current;
    if (!a || a.id !== evento.pointerId) return;
    if (!a.activo) {
      const dx = Math.abs(evento.clientX - a.x);
      const dy = Math.abs(evento.clientY - a.y);
      if (dx < UMBRAL_TACTIL_PX && dy < UMBRAL_TACTIL_PX) return;
      if (dy > dx) {
        arrastre.current = null;
        return;
      }
      a.activo = true;
      capturar(evento.currentTarget, evento.pointerId);
    }
    poner(notaEn(evento.clientX), false);
  }

  function alSoltar(evento: PointerEvent<HTMLDivElement>) {
    const a = arrastre.current;
    if (!a || a.id !== evento.pointerId) return;
    arrastre.current = null;
    // Un toque corto con el dedo, sin arrastrar, también elige.
    poner(a.activo ? valor : notaEn(evento.clientX), true);
  }

  function alCancelar(evento: PointerEvent<HTMLDivElement>) {
    const a = arrastre.current;
    if (!a || a.id !== evento.pointerId) return;
    arrastre.current = null;
    poner(a.original, false);
  }

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    const sube = evento.key === "ArrowRight" || evento.key === "ArrowUp";
    const baja = evento.key === "ArrowLeft" || evento.key === "ArrowDown";
    let nuevo: number;
    if (sube || baja) {
      const direccion = sube ? 1 : -1;
      nuevo = evento.shiftKey
        ? notaAUnEntero(valor, direccion, plan)
        : notaAUnPaso(valor, direccion, plan);
    } else if (evento.key === "PageUp") nuevo = notaAUnEntero(valor, 1, plan);
    else if (evento.key === "PageDown") nuevo = notaAUnEntero(valor, -1, plan);
    else if (evento.key === "Home") nuevo = plan.notaMin;
    else if (evento.key === "End") nuevo = plan.notaMax;
    else return;
    evento.preventDefault();
    poner(nuevo, true);
  }

  function empezarAEscribir() {
    setTexto(vacia ? "" : formatoNota(valor));
    setError(null);
    setEditando(true);
  }

  function terminarDeEscribir(aplicar: boolean): boolean {
    if (!aplicar) {
      setEditando(false);
      setError(null);
      return true;
    }
    const leida = leerNotaEscrita(texto, plan);
    if (leida.tipo === "invalida") {
      setError(
        `Tiene que ser un número entre ${formatoNota(plan.notaMin)} y ${formatoNota(plan.notaMax)}.`,
      );
      return false;
    }
    setEditando(false);
    setError(null);
    if (leida.tipo === "ok") poner(leida.valor, true);
    return true;
  }

  return (
    <div className={vacia ? "nt vacia" : "nt"}>
      <div className="nt-h">
        <span id={idEtiqueta}>{etiqueta}</span>
        <button
          type="button"
          className="nt-sin"
          aria-pressed={vacia}
          aria-label={`${etiqueta}: sin nota`}
          onClick={() => poner(null, true)}
        >
          Sin nota
        </button>
      </div>
      {editando ? (
        <>
          <input
            className="nt-inp"
            inputMode="decimal"
            autoComplete="off"
            // Al tocar el número, el teclado tiene que aparecer enseguida.
            autoFocus
            aria-label={`Escribir ${etiqueta}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? idError : undefined}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                terminarDeEscribir(true);
              } else if (e.key === "Escape") {
                // Cierra solo la edición, no el modal.
                e.preventDefault();
                e.stopPropagation();
                terminarDeEscribir(false);
              }
            }}
            onBlur={() => {
              if (!terminarDeEscribir(true)) terminarDeEscribir(false);
            }}
          />
          {error && (
            <span className="nt-err" id={idError} role="alert">
              {error}
            </span>
          )}
        </>
      ) : (
        <button
          type="button"
          className="nt-num"
          aria-label={`Escribir ${etiqueta}: ${textoValor}`}
          onClick={empezarAEscribir}
        >
          {vacia ? "–" : formatoNota(valor)}
        </button>
      )}
      <div className="nt-fila">
        <button
          type="button"
          className="nt-b"
          aria-label={`Bajar ${etiqueta}`}
          disabled={!vacia && valor <= plan.notaMin}
          onClick={() => poner(notaAUnPaso(valor, -1, plan), true)}
        >
          −
        </button>
        <div
          ref={pista}
          className="nt-track"
          role="slider"
          tabIndex={0}
          aria-labelledby={idEtiqueta}
          aria-orientation="horizontal"
          aria-valuemin={plan.notaMin}
          aria-valuemax={plan.notaMax}
          aria-valuenow={vacia ? plan.notaMin : valor}
          aria-valuetext={textoValor}
          onPointerDown={alApoyar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alCancelar}
          onKeyDown={alTeclear}
        >
          <div className="nt-riel" ref={riel}>
            {etiquetasDeEscala(plan).map((n) => {
              const izquierda = `${posicionDeNota(n, plan) * 100}%`;
              return (
                <span key={n} aria-hidden="true">
                  <i className="nt-marca" style={{ left: izquierda }} />
                  <span className="nt-et" style={{ left: izquierda }}>
                    {n}
                  </span>
                </span>
              );
            })}
            <i className="fill" style={{ width: `${porcentaje}%` }} />
            <span className="thumb" style={{ left: `${porcentaje}%` }} />
          </div>
        </div>
        <button
          type="button"
          className="nt-b"
          aria-label={`Subir ${etiqueta}`}
          disabled={!vacia && valor >= plan.notaMax}
          onClick={() => poner(notaAUnPaso(valor, 1, plan), true)}
        >
          +
        </button>
      </div>
    </div>
  );
}
