import type { Material } from "@estudia/core";
import { createContext, useContext, useSyncExternalStore } from "react";

/** Arquitectura §7: unos 8 s para deshacer. */
export const PLAZO_DESHACER_MS = 8000;

export type MotivoPausa = "foco" | "puntero";

export interface FalloDeBorrado {
  id: number;
  texto: string;
}

/**
 * Lo que se borra junto y se deshace con un solo botón: un material, o todas las referencias de un
 * archivo al tocar "Borrar archivo". El `id` es el del primer material.
 */
export interface BorradoPendiente {
  id: string;
  materiales: Material[];
  /** Lo que dice el aviso: "Borrado de 2 materias". Sin texto, nombra al material. */
  texto: string | null;
}

export interface EstadoBorrados {
  /** Los que todavía se pueden deshacer, en el orden en que se pidieron. */
  pendientes: BorradoPendiente[];
  /** No se muestran en ningún lado: los pendientes y los que se están borrando. */
  ocultos: ReadonlySet<string>;
  fallos: FalloDeBorrado[];
  /** Los modales abiertos: los avisos se muestran adentro del último, porque lo demás queda inerte. */
  dialogos: number[];
}

export interface BorradosPendientes {
  leer(): EstadoBorrados;
  suscribir(alCambiar: () => void): () => void;
  /** Varios materiales se borran juntos, uno por vez, y vuelven juntos con un solo "Deshacer". */
  pedir(materiales: Material | Material[], texto?: string): void;
  /** `id` es el del borrado, que es el de su primer material. */
  deshacer(id: string): void;
  pausar(id: string, motivo: MotivoPausa): void;
  reanudar(id: string, motivo: MotivoPausa): void;
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
  borrado: BorradoPendiente;
  restanteMs: number;
  inicio: number;
  temporizador: ReturnType<typeof setTimeout> | null;
  pausas: Set<MotivoPausa>;
}

/**
 * El borrado real pasa recién al vencer el plazo, y el plazo vive solo en la memoria de esta pestaña:
 * recargar, cerrarla o cerrar la sesión antes de tiempo deja el material como estaba. Cada material
 * borrado tiene su propio plazo.
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

  function sinOcultar(ids: string[]): ReadonlySet<string> {
    const ocultos = new Set(estado.ocultos);
    ids.forEach((id) => ocultos.delete(id));
    return ocultos;
  }

  const idsDe = (borrado: BorradoPendiente) => borrado.materiales.map((m) => m.id);

  function agregarFallo(texto: string): FalloDeBorrado[] {
    return [...estado.fallos, { id: proximoFallo++, texto }];
  }

  function arrancar(plazo: Plazo) {
    if (plazo.temporizador !== null || plazo.pausas.size > 0) return;
    plazo.inicio = Date.now();
    plazo.temporizador = setTimeout(() => void lanzar(plazo.borrado), plazo.restanteMs);
  }

  function frenar(plazo: Plazo) {
    if (plazo.temporizador === null) return;
    clearTimeout(plazo.temporizador);
    plazo.temporizador = null;
    plazo.restanteMs = Math.max(0, plazo.restanteMs - (Date.now() - plazo.inicio));
  }

  function lanzar(borrado: BorradoPendiente): Promise<void> {
    const promesa: Promise<void> = vencer(borrado).finally(() => enCurso.delete(promesa));
    enCurso.add(promesa);
    return promesa;
  }

  /**
   * Sigue oculto mientras se borra: si no, reaparecería hasta que llegue la lista nueva. Las
   * referencias de un mismo archivo van una por vez: así la última ve que nadie más usa la copia local
   * y la borra.
   */
  async function vencer(borrado: BorradoPendiente) {
    plazos.delete(borrado.id);
    cambiar({ pendientes: estado.pendientes.filter((b) => b.id !== borrado.id) });
    for (const material of borrado.materiales) {
      try {
        const aviso = await ejecutar(material);
        cambiar({
          ocultos: sinOcultar([material.id]),
          fallos: aviso ? agregarFallo(aviso) : estado.fallos,
        });
      } catch (error) {
        const detalle = error instanceof Error ? error.message : String(error);
        cambiar({
          ocultos: sinOcultar([material.id]),
          fallos: agregarFallo(
            `No pude borrar "${material.titulo}", así que volvió a la lista. ${detalle}`,
          ),
        });
      }
    }
  }

  /** El borrado por su id o por el de cualquiera de sus materiales. */
  function plazoDe(id: string): Plazo | undefined {
    return plazos.get(id) ?? [...plazos.values()].find((p) => idsDe(p.borrado).includes(id));
  }

  return {
    leer: () => estado,
    suscribir(alCambiar) {
      oyentes.add(alCambiar);
      return () => oyentes.delete(alCambiar);
    },
    pedir(materiales, texto) {
      const lista = (Array.isArray(materiales) ? materiales : [materiales]).filter(
        (m) => !estado.ocultos.has(m.id),
      );
      const primero = lista[0];
      if (!primero) return;
      const borrado: BorradoPendiente = { id: primero.id, materiales: lista, texto: texto ?? null };
      const plazo: Plazo = {
        borrado,
        restanteMs: plazoMs,
        inicio: 0,
        temporizador: null,
        pausas: new Set(),
      };
      plazos.set(borrado.id, plazo);
      arrancar(plazo);
      cambiar({
        pendientes: [...estado.pendientes, borrado],
        ocultos: new Set([...estado.ocultos, ...idsDe(borrado)]),
      });
    },
    deshacer(id) {
      const plazo = plazoDe(id);
      if (!plazo) return;
      frenar(plazo);
      plazos.delete(plazo.borrado.id);
      cambiar({
        pendientes: estado.pendientes.filter((b) => b.id !== plazo.borrado.id),
        ocultos: sinOcultar(idsDe(plazo.borrado)),
      });
    },
    pausar(id, motivo) {
      const plazo = plazoDe(id);
      if (!plazo) return;
      plazo.pausas.add(motivo);
      frenar(plazo);
    },
    reanudar(id, motivo) {
      const plazo = plazoDe(id);
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
      vencidos.forEach((plazo) => void lanzar(plazo.borrado));
      await Promise.all(enCurso);
    },
    cancelarTodo() {
      plazos.forEach(frenar);
      const cancelados = new Set([...plazos.values()].flatMap((p) => idsDe(p.borrado)));
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
