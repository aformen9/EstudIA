import type { Repositorio } from "@estudia/core";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Conexion } from "../conexion/conexion";
import {
  conIndicador,
  crearAlmacenGuardado,
  type AlmacenGuardado,
} from "../guardado/almacenGuardado";
import { crearRepositorioSupabase } from "../repositorio/repositorioSupabase";

export type EstadoSesion =
  { estado: "cargando" } | { estado: "anonima" } | { estado: "activa"; sesion: Session };

export interface ValorContexto extends Conexion {
  repositorio: Repositorio;
  guardado: AlmacenGuardado;
  sesion: EstadoSesion;
}

export const ContextoSesion = createContext<ValorContexto | null>(null);

function useContexto(): ValorContexto {
  const valor = useContext(ContextoSesion);
  if (!valor) throw new Error("Falta el ProveedorSesion");
  return valor;
}

export function useSesion(): EstadoSesion {
  return useContexto().sesion;
}

export function useConexion(): Conexion {
  return useContexto();
}

export function useRepositorio(): Repositorio {
  return useContexto().repositorio;
}

export function useGuardado(): AlmacenGuardado {
  return useContexto().guardado;
}

export function ProveedorSesion({
  conexion,
  children,
}: {
  conexion: Conexion;
  children: ReactNode;
}) {
  const { cliente, url } = conexion;
  const clienteQuery = useQueryClient();
  const [sesion, setSesion] = useState<EstadoSesion>({ estado: "cargando" });
  const [guardado] = useState(crearAlmacenGuardado);
  const repositorio = useMemo(
    () => conIndicador(crearRepositorioSupabase(cliente), guardado),
    [cliente, guardado],
  );

  useEffect(() => {
    let idAnterior: string | null = null;
    // Avisa también de la sesión guardada al arrancar. No se llama a Supabase dentro del callback:
    // su documentación lo desaconseja porque puede trabar el cliente.
    const { data } = cliente.auth.onAuthStateChange((_evento, nueva) => {
      const id = nueva?.user.id ?? null;
      // Lo cacheado de una cuenta no se le puede mostrar a la siguiente.
      if (id !== idAnterior) {
        clienteQuery.clear();
        guardado.reiniciar();
      }
      idAnterior = id;
      setSesion(nueva ? { estado: "activa", sesion: nueva } : { estado: "anonima" });
    });
    return () => data.subscription.unsubscribe();
  }, [cliente, clienteQuery, guardado]);

  const valor = useMemo(
    () => ({ cliente, url, repositorio, guardado, sesion }),
    [cliente, url, repositorio, guardado, sesion],
  );
  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}
