import type { ProgresoMateria } from "@estudia/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useFalloVisible } from "../guardado/IndicadorGuardado";
import { useRepositorio } from "../sesion/sesion";
import { clavesPlan } from "./planActivo";

export type CambiosProgreso = Partial<Omit<ProgresoMateria, "materiaId">>;

export interface EstadoGuardadoFila {
  guardando: boolean;
  /** El último guardado de la materia falló y sigue sin resolver. */
  fallo: boolean;
}

function progresoVacio(materiaId: string): ProgresoMateria {
  return {
    materiaId,
    estado: "pendiente",
    p1: null,
    p2: null,
    rec: null,
    notaCursada: null,
    notaFinalExamen: null,
    nota: null,
    aplazos: [],
  };
}

/**
 * Guarda una materia conservando los demás campos de su fila. El cambio se ve al instante y, si falla,
 * vuelve a lo último confirmado por la base: lo que queda en pantalla nunca parece guardado sin estarlo.
 * Los guardados de una misma materia van en fila (`scope`), así uno viejo no pisa a uno nuevo.
 * `alCambiarEstado` avisa en el momento en que se pide guardar, sin esperar al próximo render.
 */
export function useGuardarProgreso(
  planId: string,
  materiaId: string,
  alCambiarEstado?: (estado: EstadoGuardadoFila) => void,
) {
  const repositorio = useRepositorio();
  const clienteQuery = useQueryClient();
  const clave = clavesPlan.progreso(planId);
  const enCamino = useRef(0);
  const pedidos = useRef(0);
  const confirmada = useRef<ProgresoMateria | null>(null);
  const ultimosCambios = useRef<CambiosProgreso>({});

  function filaActual(): ProgresoMateria | null {
    const filas = clienteQuery.getQueryData<ProgresoMateria[]>(clave) ?? [];
    return filas.find((f) => f.materiaId === materiaId) ?? null;
  }

  function ponerFila(fila: ProgresoMateria | null) {
    clienteQuery.setQueryData<ProgresoMateria[]>(clave, (filas = []) => {
      const otras = filas.filter((f) => f.materiaId !== materiaId);
      return fila ? [...otras, fila] : otras;
    });
  }

  const mutacion = useMutation({
    scope: { id: `progreso:${materiaId}` },
    mutationFn: (fila: ProgresoMateria) => repositorio.guardarProgreso(fila),
    onMutate: async (fila) => {
      if (enCamino.current === 0) confirmada.current = filaActual();
      enCamino.current += 1;
      // Una lectura en camino traería el valor de antes del cambio.
      await clienteQuery.cancelQueries({ queryKey: clave });
      ponerFila(fila);
    },
    onSuccess: (_resultado, fila) => {
      confirmada.current = fila;
      if (enCamino.current === 1) ponerFila(fila);
    },
    onError: () => {
      if (enCamino.current === 1) ponerFila(confirmada.current);
    },
    onSettled: (_resultado, error) => {
      enCamino.current -= 1;
      pedidos.current -= 1;
      if (pedidos.current === 0) alCambiarEstado?.({ guardando: false, fallo: error !== null });
    },
  });

  useFalloVisible(mutacion.isError);

  function guardar(cambios: CambiosProgreso) {
    ultimosCambios.current = cambios;
    pedidos.current += 1;
    alCambiarEstado?.({ guardando: true, fallo: false });
    mutacion.mutate({ ...(filaActual() ?? progresoVacio(materiaId)), ...cambios, materiaId });
  }

  return {
    guardar,
    reintentar: () => guardar(ultimosCambios.current),
    error: mutacion.error,
  };
}
