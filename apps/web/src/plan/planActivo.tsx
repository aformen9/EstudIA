import type {
  DatosAlumno,
  EventoHistorial,
  Inscripcion,
  Material,
  Perfil,
  PlanCompleto,
  ProgresoMateria,
  Repositorio,
} from "@estudia/core";
import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRepositorio } from "../sesion/sesion";

export const clavesPlan = {
  inscripciones: ["inscripciones"] as const,
  materiales: ["materiales"] as const,
  perfil: ["perfil"] as const,
  plan: (planId: string) => ["plan", planId] as const,
  progreso: (planId: string) => ["progreso", planId] as const,
  historial: (planId: string) => ["historial", planId] as const,
};

export const consultas = {
  inscripciones: (repositorio: Repositorio) =>
    queryOptions<Inscripcion[]>({
      queryKey: clavesPlan.inscripciones,
      queryFn: () => repositorio.listarInscripciones(),
    }),
  materiales: (repositorio: Repositorio) =>
    queryOptions<Material[]>({
      queryKey: clavesPlan.materiales,
      queryFn: () => repositorio.listarMateriales(),
    }),
  perfil: (repositorio: Repositorio) =>
    queryOptions<Perfil>({
      queryKey: clavesPlan.perfil,
      queryFn: () => repositorio.obtenerPerfil(),
    }),
  plan: (repositorio: Repositorio, planId: string) =>
    queryOptions<PlanCompleto>({
      queryKey: clavesPlan.plan(planId),
      queryFn: () => repositorio.obtenerPlanCompleto(planId),
    }),
  progreso: (repositorio: Repositorio, planId: string) =>
    queryOptions<ProgresoMateria[]>({
      queryKey: clavesPlan.progreso(planId),
      queryFn: () => repositorio.obtenerProgreso(planId),
    }),
  historial: (repositorio: Repositorio, planId: string) =>
    queryOptions<EventoHistorial[]>({
      queryKey: clavesPlan.historial(planId),
      queryFn: () => repositorio.obtenerHistorial(planId),
    }),
};

export type InscripcionActiva =
  | { estado: "cargando" }
  | { estado: "error"; error: Error; reintentar: () => void }
  | { estado: "ninguna" }
  | { estado: "activa"; inscripcion: Inscripcion };

/** Si una recarga en segundo plano falla, sigue valiendo lo último que se leyó. */
export function useInscripcionActiva(): InscripcionActiva {
  const repositorio = useRepositorio();
  const consulta = useQuery(consultas.inscripciones(repositorio));
  if (consulta.data) {
    const inscripcion = consulta.data.find((i) => i.activa);
    return inscripcion ? { estado: "activa", inscripcion } : { estado: "ninguna" };
  }
  if (consulta.error) {
    return { estado: "error", error: consulta.error, reintentar: () => void consulta.refetch() };
  }
  return { estado: "cargando" };
}

export type PlanDelAlumno =
  | { estado: "sin-plan" }
  | { estado: "cargando" }
  | { estado: "error"; error: Error; reintentar: () => void }
  | { estado: "listo"; datos: DatosAlumno };

/** `DatosAlumno` del plan activo, la entrada de todos los cálculos de `core`. */
export function useDatosAlumno(): PlanDelAlumno {
  const repositorio = useRepositorio();
  const inscripcion = useInscripcionActiva();
  const planId = inscripcion.estado === "activa" ? inscripcion.inscripcion.planId : "";
  const enabled = planId !== "";

  const plan = useQuery({ ...consultas.plan(repositorio, planId), enabled });
  const progreso = useQuery({ ...consultas.progreso(repositorio, planId), enabled });
  const historial = useQuery({ ...consultas.historial(repositorio, planId), enabled });

  if (inscripcion.estado === "error") return inscripcion;
  if (inscripcion.estado === "cargando") return { estado: "cargando" };
  if (inscripcion.estado === "ninguna") return { estado: "sin-plan" };
  if (plan.data && progreso.data && historial.data) {
    return {
      estado: "listo",
      datos: { ...plan.data, progreso: progreso.data, historial: historial.data },
    };
  }
  const error =
    (!plan.data && plan.error) ||
    (!progreso.data && progreso.error) ||
    (!historial.data && historial.error);
  if (error) {
    return {
      estado: "error",
      error,
      reintentar: () => {
        if (!plan.data) void plan.refetch();
        if (!progreso.data) void progreso.refetch();
        if (!historial.data) void historial.refetch();
      },
    };
  }
  return { estado: "cargando" };
}

/** Deja `inscripcion` como la única activa en la caché, sin esperar a releerlas. */
export function ponerInscripcionActiva(clienteQuery: QueryClient, inscripcion: Inscripcion): void {
  clienteQuery.setQueryData<Inscripcion[]>(clavesPlan.inscripciones, (anteriores = []) => [
    ...anteriores.filter((i) => i.id !== inscripcion.id).map((i) => ({ ...i, activa: false })),
    inscripcion,
  ]);
}

/** Después de reemplazar los datos: se vuelven a leer, también las materias propias del plan. */
export async function invalidarDatosDelPlan(
  clienteQuery: QueryClient,
  planId: string,
): Promise<void> {
  await Promise.all(
    [
      clavesPlan.plan(planId),
      clavesPlan.progreso(planId),
      clavesPlan.historial(planId),
      clavesPlan.materiales,
    ].map((queryKey) => clienteQuery.invalidateQueries({ queryKey })),
  );
}

export function ErrorDeCarga({ mensaje, reintentar }: { mensaje: string; reintentar: () => void }) {
  return (
    <section className="card">
      <p className="msg err" role="alert">
        {mensaje}
      </p>
      <div className="acciones">
        <button className="btn" type="button" onClick={reintentar}>
          Reintentar
        </button>
      </div>
    </section>
  );
}

/** Muestra la carga o el error del plan, y `children` cuando `DatosAlumno` está listo. */
export function ConPlan({ children }: { children: (datos: DatosAlumno) => ReactNode }) {
  const plan = useDatosAlumno();
  if (plan.estado === "listo") return <>{children(plan.datos)}</>;
  if (plan.estado === "error") {
    return <ErrorDeCarga mensaje={plan.error.message} reintentar={plan.reintentar} />;
  }
  return (
    <p className="sub" role="status">
      Cargando tu plan…
    </p>
  );
}
