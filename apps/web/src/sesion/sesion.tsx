import type { Repositorio } from "@estudia/core";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Conexion } from "../conexion/conexion";
import { crearRepositorioSupabase } from "../repositorio/repositorioSupabase";

export type EstadoSesion =
  { estado: "cargando" } | { estado: "anonima" } | { estado: "activa"; sesion: Session };

interface ValorContexto extends Conexion {
  repositorio: Repositorio;
  sesion: EstadoSesion;
}

const Contexto = createContext<ValorContexto | null>(null);

function useContexto(): ValorContexto {
  const valor = useContext(Contexto);
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
  const repositorio = useMemo(() => crearRepositorioSupabase(cliente), [cliente]);

  useEffect(() => {
    let idAnterior: string | null = null;
    // Avisa también de la sesión guardada al arrancar. No se llama a Supabase dentro del callback:
    // su documentación lo desaconseja porque puede trabar el cliente.
    const { data } = cliente.auth.onAuthStateChange((_evento, nueva) => {
      const id = nueva?.user.id ?? null;
      // Lo cacheado de una cuenta no se le puede mostrar a la siguiente.
      if (id !== idAnterior) clienteQuery.clear();
      idAnterior = id;
      setSesion(nueva ? { estado: "activa", sesion: nueva } : { estado: "anonima" });
    });
    return () => data.subscription.unsubscribe();
  }, [cliente, clienteQuery]);

  const valor = useMemo(
    () => ({ cliente, url, repositorio, sesion }),
    [cliente, url, repositorio, sesion],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
