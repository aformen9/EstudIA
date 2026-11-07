import { progresoInicial, type ProgresoMateria } from "@estudia/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useGuardado, useRepositorio } from "../sesion/sesion";
import { clavesPlan } from "./planActivo";

export type CambiosProgreso = Partial<Omit<ProgresoMateria, "materiaId">>;

export interface EstadoGuardadoFila {
  guardando: boolean;
  /** El último guardado de la materia falló y sigue sin resolver. */
  fallo: boolean;
}

/**
 * Guarda una materia conservando los demás campos de su fila. El cambio se ve al instante y, si falla,
 * vuelve a lo último confirmado por la base: lo que queda en pantalla nunca parece guardado sin estarlo.
 * Los guardados de una misma materia van en fila (`scope`), así uno viejo no pisa a uno nuevo. El
 * repositorio les pone un tiempo máximo (`conIndicador`): uno colgado falla y deja pasar al siguiente,
 * y lo que responda después se ignora. `alCambiarEstado` avisa en el momento en que se pide guardar,
 * sin esperar al próximo render. `materiaId` null: una materia que todavía no existe, y cada guardado
 * dice cuál es.
 */
export function useGuardarProgreso(
  planId: string,
  materiaId: string | null,
  alCambiarEstado?: (estado: EstadoGuardadoFila) => void,
) {
  const repositorio = useRepositorio();
  const almacen = useGuardado();
  const clienteQuery = useQueryClient();
  const clave = clavesPlan.progreso(planId);
  const enCamino = useRef(0);
  const pedidos = useRef(0);
  const confirmada = useRef<ProgresoMateria | null>(null);
  const ultimosCambios = useRef<CambiosProgreso>({});

  function filaActual(id: string): ProgresoMateria | null {
    const filas = clienteQuery.getQueryData<ProgresoMateria[]>(clave) ?? [];
    return filas.find((f) => f.materiaId === id) ?? null;
  }

  function ponerFila(id: string, fila: ProgresoMateria | null) {
    clienteQuery.setQueryData<ProgresoMateria[]>(clave, (filas = []) => {
      const otras = filas.filter((f) => f.materiaId !== id);
      return fila ? [...otras, fila] : otras;
    });
  }

  const mutacion = useMutation({
    scope: { id: `progreso:${materiaId ?? "nueva"}` },
    mutationFn: (fila: ProgresoMateria) => repositorio.guardarProgreso(fila),
    onMutate: async (fila) => {
      if (enCamino.current === 0) confirmada.current = filaActual(fila.materiaId);
      enCamino.current += 1;
      // Una lectura en camino traería el valor de antes del cambio.
      await clienteQuery.cancelQueries({ queryKey: clave });
      ponerFila(fila.materiaId, fila);
    },
    onSuccess: (_resultado, fila) => {
      confirmada.current = fila;
      almacen.resolverFilas([fila.materiaId]);
      if (enCamino.current === 1) ponerFila(fila.materiaId, fila);
    },
    onError: (_error, fila) => {
      almacen.marcarFilaFallida(fila.materiaId);
      if (enCamino.current === 1) ponerFila(fila.materiaId, confirmada.current);
    },
    onSettled: (_resultado, error) => {
      enCamino.current -= 1;
      pedidos.current -= 1;
      if (pedidos.current === 0) alCambiarEstado?.({ guardando: false, fallo: error !== null });
    },
  });

  function armarFila(cambios: CambiosProgreso, id: string): ProgresoMateria {
    ultimosCambios.current = cambios;
    pedidos.current += 1;
    alCambiarEstado?.({ guardando: true, fallo: false });
    return { ...(filaActual(id) ?? progresoInicial(id)), ...cambios, materiaId: id };
  }

  function guardar(cambios: CambiosProgreso) {
    if (materiaId !== null) mutacion.mutate(armarFila(cambios, materiaId));
  }

  return {
    guardar,
    /** Para quien tiene que saber cómo terminó: rechaza si no se pudo guardar. */
    guardarYEsperar: (cambios: CambiosProgreso, id: string) =>
      mutacion.mutateAsync(armarFila(cambios, id)),
    /** Vuelve a mandar los mismos valores: es un upsert, así que repetirlo no cambia nada. */
    reintentar: () => guardar(ultimosCambios.current),
    error: mutacion.error,
  };
}
