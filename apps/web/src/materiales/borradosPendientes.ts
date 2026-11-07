import type { Material } from "@estudia/core";
import { createContext, useContext, useSyncExternalStore } from "react";

/** Arquitectura §7: unos 8 s para deshacer. */
export const PLAZO_DESHACER_MS = 8000;

export type MotivoPausa = "foco" | "puntero";

export interface FalloDeBorrado {
  id: number;
  texto: string;
}

export interface EstadoBorrados {
  /** Los que todavía se pueden deshacer, en el orden en que se pidieron. */
  pendientes: Material[];
  /** No se muestran en ningún lado: los pendientes y los que se están borrando. */
  ocultos: ReadonlySet<string>;
  fallos: FalloDeBorrado[];
  /** Los modales abiertos: los avisos se muestran adentro del último, porque lo demás queda inerte. */
  dialogos: number[];
}

export interface BorradosPendientes {
  leer(): EstadoBorrados;
  suscribir(alCambiar: () => void): () => void;
  pedir(material: Material): void;
  deshacer(materialId: string): void;
  pausar(materialId: string, motivo: MotivoPausa): void;
  reanudar(materialId: string, motivo: MotivoPausa): void;
  descartarFallo(id: number): void;
  /**
   * Borra ya lo que estaba por vencer y espera a que termine, también lo que se estaba borrando. Lo usa
   * la restauración: sin esto, un material pendiente contaría como existente, se omitiría y se borraría
   * después. Un fallo no la frena: queda en `fallos`, como cualquier otro.
   */
  ejecutarPendientes(): Promise<void>;
  /** Al cerrar la sesión o salir de la app: nada que no haya vencido se borra. */
  cancelarTodo(): void;
  abrirDialogo(id: number): () => void;
}

interface Plazo {
  material: Material;
  restanteMs: number;
  inicio: number;
  temporizador: ReturnType<typeof setTimeout> | null;
  pausas: Set<MotivoPausa>;
}

/**
 * El borrado real pasa recién al vencer el plazo, y el plazo vive solo en la memoria de esta pestaña:
 * recargar, cerrarla o cerrar la sesión antes de tiempo deja el material como estaba. Cada material
 * tiene su propio plazo.
 *
 * `ejecutar` hace el borrado real. Devuelve un aviso si quedó algo sin hacer, y rechaza si falló: en
 * ese caso el material vuelve a aparecer.
 */
export function crearBorradosPendientes(
  ejecutar: (material: Material) => Promise<string | null>,
  plazoMs = PLAZO_DESHACER_MS,
): BorradosPendientes {
  const plazos = new Map<string, Plazo>();
  const oyentes = new Set<() => void>();
  const enCurso = new Set<Promise<void>>();
  let proximoFallo = 1;
  let estado: EstadoBorrados = { pendientes: [], ocultos: new Set(), fallos: [], dialogos: [] };

  function cambiar(cambios: Partial<EstadoBorrados>) {
    estado = { ...estado, ...cambios };
    oyentes.forEach((oyente) => oyente());
  }

  function sinOcultar(materialId: string): ReadonlySet<string> {
    const ocultos = new Set(estado.ocultos);
    ocultos.delete(materialId);
    return ocultos;
  }

  function agregarFallo(texto: string): FalloDeBorrado[] {
    return [...estado.fallos, { id: proximoFallo++, texto }];
  }

  function arrancar(plazo: Plazo) {
    if (plazo.temporizador !== null || plazo.pausas.size > 0) return;
    plazo.inicio = Date.now();
    plazo.temporizador = setTimeout(() => void lanzar(plazo.material), plazo.restanteMs);
  }

  function frenar(plazo: Plazo) {
    if (plazo.temporizador === null) return;
    clearTimeout(plazo.temporizador);
    plazo.temporizador = null;
    plazo.restanteMs = Math.max(0, plazo.restanteMs - (Date.now() - plazo.inicio));
  }

  function lanzar(material: Material): Promise<void> {
    const borrado: Promise<void> = vencer(material).finally(() => enCurso.delete(borrado));
    enCurso.add(borrado);
    return borrado;
  }

  /** Sigue oculto mientras se borra: si no, reaparecería hasta que llegue la lista nueva. */
  async function vencer(material: Material) {
    plazos.delete(material.id);
    cambiar({ pendientes: estado.pendientes.filter((m) => m.id !== material.id) });
    try {
      const aviso = await ejecutar(material);
      cambiar({
        ocultos: sinOcultar(material.id),
        fallos: aviso ? agregarFallo(aviso) : estado.fallos,
      });
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      cambiar({
        ocultos: sinOcultar(material.id),
        fallos: agregarFallo(
          `No pude borrar "${material.titulo}", así que volvió a la lista. ${detalle}`,
        ),
      });
    }
  }

  return {
    leer: () => estado,
    suscribir(alCambiar) {
      oyentes.add(alCambiar);
      return () => oyentes.delete(alCambiar);
    },
    pedir(material) {
      if (estado.ocultos.has(material.id)) return;
      const plazo: Plazo = {
        material,
        restanteMs: plazoMs,
        inicio: 0,
        temporizador: null,
        pausas: new Set(),
      };
      plazos.set(material.id, plazo);
      arrancar(plazo);
      cambiar({
        pendientes: [...estado.pendientes, material],
        ocultos: new Set(estado.ocultos).add(material.id),
      });
    },
    deshacer(materialId) {
      const plazo = plazos.get(materialId);
      if (!plazo) return;
      frenar(plazo);
      plazos.delete(materialId);
      cambiar({
        pendientes: estado.pendientes.filter((m) => m.id !== materialId),
        ocultos: sinOcultar(materialId),
      });
    },
    pausar(materialId, motivo) {
      const plazo = plazos.get(materialId);
      if (!plazo) return;
      plazo.pausas.add(motivo);
      frenar(plazo);
    },
    reanudar(materialId, motivo) {
      const plazo = plazos.get(materialId);
      if (!plazo) return;
      plazo.pausas.delete(motivo);
      arrancar(plazo);
    },
    descartarFallo(id) {
      cambiar({ fallos: estado.fallos.filter((f) => f.id !== id) });
    },
    async ejecutarPendientes() {
      const vencidos = [...plazos.values()];
      vencidos.forEach(frenar);
      vencidos.forEach((plazo) => void lanzar(plazo.material));
      await Promise.all(enCurso);
    },
    cancelarTodo() {
      plazos.forEach(frenar);
      const cancelados = new Set(plazos.keys());
      plazos.clear();
      if (cancelados.size === 0) return;
      cambiar({
        pendientes: [],
        ocultos: new Set([...estado.ocultos].filter((id) => !cancelados.has(id))),
      });
    },
    abrirDialogo(id) {
      cambiar({ dialogos: [...estado.dialogos, id] });
      return () => cambiar({ dialogos: estado.dialogos.filter((d) => d !== id) });
    },
  };
}

export const ContextoBorrados = createContext<BorradosPendientes | null>(null);

export function useBorrados(): BorradosPendientes | null {
  return useContext(ContextoBorrados);
}

const SIN_OCULTOS: ReadonlySet<string> = new Set();
const sinSuscripcion = () => () => {};

/** Los ids que ninguna pantalla debe mostrar. */
export function useMaterialesOcultos(): ReadonlySet<string> {
  const borrados = useBorrados();
  return useSyncExternalStore(
    borrados?.suscribir ?? sinSuscripcion,
    () => borrados?.leer().ocultos ?? SIN_OCULTOS,
  );
}
