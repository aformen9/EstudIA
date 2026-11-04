import type { Repositorio } from "@estudia/core";

export interface EstadoGuardado {
  /** Escrituras en curso. */
  pendientes: number;
  /** Resultado de la última escritura terminada. `ninguno`: todavía no se escribió nada. */
  ultimo: "ninguno" | "ok" | "error";
  /** Fallos que alguna pantalla sigue mostrando sin resolver (ver `marcarFallo`). */
  fallosVisibles: number;
}

const INICIAL: EstadoGuardado = { pendientes: 0, ultimo: "ninguno", fallosVisibles: 0 };

export interface AlmacenGuardado {
  leer(): EstadoGuardado;
  suscribir(alCambiar: () => void): () => void;
  seguir<T>(escritura: () => Promise<T>): Promise<T>;
  /**
   * Mientras una pantalla muestre un guardado fallido, una escritura exitosa posterior de otra materia
   * no puede hacer decir "Guardado en la nube". Devuelve la función que lo da por resuelto.
   */
  marcarFallo(): () => void;
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
    reiniciar: () => cambiar(INICIAL),
  };
}

/** Todas las escrituras pasan por acá: una pantalla nueva no se puede olvidar de avisar al indicador. */
export function conIndicador(repositorio: Repositorio, almacen: AlmacenGuardado): Repositorio {
  function seguida<A extends unknown[], R>(escritura: (...args: A) => Promise<R>) {
    return (...args: A) => almacen.seguir(() => escritura(...args));
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
    borrarMaterial: seguida(repositorio.borrarMaterial),
    reemplazarDatosDelPlan: seguida(repositorio.reemplazarDatosDelPlan),
  };
}

/** Qué dice el indicador. Antes de la primera escritura no afirma haber guardado nada. */
export function textoGuardado(
  estado: EstadoGuardado,
  enLinea: boolean,
): { clase: string; texto: string } {
  if (!enLinea) return { clase: "local", texto: "Sin conexión" };
  if (estado.pendientes > 0) return { clase: "saving", texto: "Guardando…" };
  if (estado.fallosVisibles > 0 || estado.ultimo === "error") {
    return { clase: "err", texto: "No se pudo guardar" };
  }
  if (estado.ultimo === "ok") return { clase: "", texto: "Guardado en la nube" };
  return { clase: "idle", texto: "Sin cambios" };
}
