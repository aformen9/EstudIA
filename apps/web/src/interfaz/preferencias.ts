import { resolverPreferencias, type Perfil, type Preferencias } from "@estudia/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { clavesPlan, consultas } from "../plan/planActivo";
import { useRepositorio } from "../sesion/sesion";
import { acentoActual, aplicarAcento } from "./acento";
import { aplicarTema, temaActual } from "./tema";

/**
 * Acento y modo viajan entre dispositivos en el perfil (decisión del 2026-11-16). El dispositivo
 * guarda una copia para pintar sin parpadeo; al entrar con sesión manda el perfil.
 */
const EVENTO = "estudia:preferencias";

export function avisarCambio() {
  window.dispatchEvent(new Event(EVENTO));
}

export function suscribirPreferencias(alCambiar: () => void): () => void {
  window.addEventListener(EVENTO, alCambiar);
  return () => window.removeEventListener(EVENTO, alCambiar);
}

/**
 * Manda un cambio al perfil sin esperar. Si falla (sin conexión), queda la copia local: el próximo
 * cambio vuelve a intentarlo y, al entrar de nuevo, gana lo que tenga el perfil.
 */
export function useGuardarPreferencia(): (cambios: Partial<Preferencias>) => void {
  const repositorio = useRepositorio();
  const clienteQuery = useQueryClient();
  return useCallback(
    (cambios) => {
      repositorio
        .actualizarPerfil(cambios)
        .then((perfil) => clienteQuery.setQueryData<Perfil>(clavesPlan.perfil, perfil))
        .catch(() => {});
    },
    [repositorio, clienteQuery],
  );
}

/** Una vez por cuenta, cuando llega su perfil: aplica lo guardado y sube lo que falta. */
export function useSincronizarPreferencias() {
  const repositorio = useRepositorio();
  const perfil = useQuery(consultas.perfil(repositorio));
  const guardar = useGuardarPreferencia();
  const sincronizada = useRef<string | null>(null);

  useEffect(() => {
    const datos = perfil.data;
    if (!datos || sincronizada.current === datos.id) return;
    sincronizada.current = datos.id;
    const { aplicar, subir } = resolverPreferencias(
      { acento: acentoActual(), tema: temaActual() },
      { acento: datos.acento, tema: datos.tema },
    );
    if (aplicar.tema) aplicarTema(aplicar.tema);
    if (aplicar.acento) aplicarAcento(aplicar.acento);
    if (subir.acento !== undefined || subir.tema !== undefined) guardar(subir);
  }, [perfil.data, guardar]);
}
