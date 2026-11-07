import type { Repositorio } from "@estudia/core";

export interface EstadoGuardado {
  /** Escrituras en curso. */
  pendientes: number;
  /** Resultado de la última escritura terminada. `ninguno`: todavía no se escribió nada. */
  ultimo: "ninguno" | "ok" | "error";
  /** Fallos que alguna pantalla sigue mostrando sin resolver (ver `marcarFallo`). */
  fallosVisibles: number;
  /**
   * Materias cuyo último guardado falló. A diferencia de `fallosVisibles` sobreviven a salir de la
   * pantalla: hasta que se guarden, recargar o cerrar la pestaña avisa.
   */
  filasFallidas: string[];
}

const INICIAL: EstadoGuardado = {
  pendientes: 0,
  ultimo: "ninguno",
  fallosVisibles: 0,
  filasFallidas: [],
};

/** Tiempo máximo de una escritura. Una red colgada no puede dejar nada en "Guardando…". */
export const TIEMPO_MAXIMO_GUARDADO_MS = 20_000;
/** Reemplazar todos los datos de un plan es una sola operación, bastante más larga. */
export const TIEMPO_MAXIMO_IMPORTACION_MS = 60_000;

/** La escritura no respondió a tiempo: no se sabe si llegó a aplicarse. */
export class TiempoDeGuardadoAgotado extends Error {
  constructor() {
    super("El guardado tardó demasiado y no pude confirmarlo.");
    this.name = "TiempoDeGuardadoAgotado";
  }
}

/** Una respuesta que llega después del límite se ignora: ya se avisó que no se pudo guardar. */
function conTiempoMaximo<T>(escritura: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const temporizador = setTimeout(() => rechazar(new TiempoDeGuardadoAgotado()), ms);
    escritura.then(
      (valor) => {
        clearTimeout(temporizador);
        resolver(valor);
      },
      (error: unknown) => {
        clearTimeout(temporizador);
        rechazar(error);
      },
    );
  });
}

export interface AlmacenGuardado {
  leer(): EstadoGuardado;
  suscribir(alCambiar: () => void): () => void;
  seguir<T>(escritura: () => Promise<T>): Promise<T>;
  /**
   * Mientras una pantalla muestre un guardado fallido, una escritura exitosa posterior de otra materia
   * no puede hacer decir "Guardado en la nube". Devuelve la función que lo da por resuelto.
   */
  marcarFallo(): () => void;
  marcarFilaFallida(materiaId: string): void;
  resolverFilas(materiaIds: string[]): void;
  reiniciar(): void;
}

export function crearAlmacenGuardado(): AlmacenGuardado {
  let estado = INICIAL;
  const oyentes = new Set<() => void>();

  function cambiar(cambios: Partial<EstadoGuardado>) {
    estado = { ...estado, ...cambios };
    oyentes.forEach((oyente) => oyente());
  }

  return {
    leer: () => estado,
    suscribir(alCambiar) {
      oyentes.add(alCambiar);
      return () => oyentes.delete(alCambiar);
    },
    async seguir(escritura) {
      cambiar({ pendientes: estado.pendientes + 1 });
      try {
        const resultado = await escritura();
        cambiar({ pendientes: Math.max(0, estado.pendientes - 1), ultimo: "ok" });
        return resultado;
      } catch (error) {
        cambiar({ pendientes: Math.max(0, estado.pendientes - 1), ultimo: "error" });
        throw error;
      }
    },
    marcarFallo() {
      cambiar({ fallosVisibles: estado.fallosVisibles + 1 });
      let resuelto = false;
      return () => {
        if (resuelto) return;
        resuelto = true;
        cambiar({ fallosVisibles: Math.max(0, estado.fallosVisibles - 1) });
      };
    },
    marcarFilaFallida(materiaId) {
      if (estado.filasFallidas.includes(materiaId)) return;
      cambiar({ filasFallidas: [...estado.filasFallidas, materiaId] });
    },
    resolverFilas(materiaIds) {
      const quedan = estado.filasFallidas.filter((id) => !materiaIds.includes(id));
      if (quedan.length !== estado.filasFallidas.length) cambiar({ filasFallidas: quedan });
    },
    reiniciar: () => cambiar(INICIAL),
  };
}

/** Todas las escrituras pasan por acá: una pantalla nueva no se puede olvidar de avisar al indicador. */
export function conIndicador(
  repositorio: Repositorio,
  almacen: AlmacenGuardado,
  tiempoMaximoMs = TIEMPO_MAXIMO_GUARDADO_MS,
  tiempoImportacionMs = TIEMPO_MAXIMO_IMPORTACION_MS,
): Repositorio {
  function seguida<A extends unknown[], R>(
    escritura: (...args: A) => Promise<R>,
    ms = tiempoMaximoMs,
  ) {
    return (...args: A) => almacen.seguir(() => conTiempoMaximo(escritura(...args), ms));
  }
  return {
    ...repositorio,
    actualizarPerfil: seguida(repositorio.actualizarPerfil),
    activarPlan: seguida(repositorio.activarPlan),
    guardarProgreso: seguida(repositorio.guardarProgreso),
    crearMateriaPropia: seguida(repositorio.crearMateriaPropia),
    actualizarMateriaPropia: seguida(repositorio.actualizarMateriaPropia),
    borrarMateriaPropia: seguida(repositorio.borrarMateriaPropia),
    registrarDocumento: seguida(repositorio.registrarDocumento),
    agregarMaterial: seguida(repositorio.agregarMaterial),
    moverMaterial: seguida(repositorio.moverMaterial),
    borrarMaterial: seguida(repositorio.borrarMaterial),
    reemplazarDatosDelPlan: seguida(repositorio.reemplazarDatosDelPlan, tiempoImportacionMs),
  };
}

/** Qué dice el indicador. Antes de la primera escritura no afirma haber guardado nada. */
export function textoGuardado(
  estado: EstadoGuardado,
  enLinea: boolean,
): { clase: string; texto: string } {
  if (!enLinea) return { clase: "local", texto: "Sin conexión" };
  if (estado.pendientes > 0) return { clase: "saving", texto: "Guardando…" };
  if (estado.fallosVisibles > 0 || estado.filasFallidas.length > 0 || estado.ultimo === "error") {
    return { clase: "err", texto: "No se pudo guardar" };
  }
  if (estado.ultimo === "ok") return { clase: "", texto: "Guardado en la nube" };
  return { clase: "idle", texto: "Sin cambios" };
}
