import type {
  EventoHistorial,
  Inscripcion,
  Material,
  NuevoMaterial,
  PlanCompleto,
  ProgresoMateria,
  Repositorio,
} from "@estudia/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { vi, type Mocked } from "vitest";
import { planLcd } from "../../../../packages/core/src/pruebas/auxiliares";
import { conIndicador, crearAlmacenGuardado } from "../guardado/almacenGuardado";
import { crearClienteQuery } from "../plan/clienteQuery";
import { ContextoSesion } from "../sesion/sesion";
import { sesionFalsa } from "./clienteFalso";

export const PLAN = planLcd();
export const ID_PLAN = PLAN.plan.id;
export const INSCRIPCION: Inscripcion = { id: "ins-1", planId: ID_PLAN, activa: true };

export function leerFixtureLegacy(): string {
  return readFileSync(
    resolve(import.meta.dirname, "../../../../fixtures/caso-prueba-legacy.json"),
    "utf8",
  );
}

export function fila(materiaId: string, cambios: Partial<ProgresoMateria> = {}): ProgresoMateria {
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
    ...cambios,
  };
}

export function materialDesde(nuevo: NuevoMaterial, id: string): Material {
  const base = {
    id,
    materiaId: nuevo.materiaId,
    titulo: nuevo.titulo,
    visibilidad: "privado" as const,
    anonimo: false,
    periodo: nuevo.periodo ?? null,
    oculto: false,
    createdAt: nuevo.createdAt ?? "2026-01-01T00:00:00Z",
  };
  if (nuevo.tipo === "link") return { ...base, tipo: "link", url: nuevo.url };
  if (nuevo.tipo === "nota") return { ...base, tipo: "nota", texto: nuevo.texto };
  return {
    ...base,
    tipo: "archivo",
    driveFileId: null,
    documento: {
      id: nuevo.documentoId,
      sha256: nuevo.documentoId,
      mime: null,
      bytes: null,
      paginas: null,
    },
  };
}

interface Inicial {
  plan?: PlanCompleto;
  inscripciones?: Inscripcion[];
  progreso?: ProgresoMateria[];
  historial?: EventoHistorial[];
  materiales?: Material[];
}

export type RepositorioFalso = Mocked<Repositorio> & {
  /** Lo que "hay en la base" en este momento. */
  base: Required<Omit<Inicial, "plan">>;
};

/** `Repositorio` en memoria: cada método es un espía, con todos los pedidos en orden en `mock`. */
export function repositorioFalso(inicial: Inicial = {}): RepositorioFalso {
  const plan = inicial.plan ?? PLAN;
  const base = {
    inscripciones: inicial.inscripciones ?? [],
    progreso: inicial.progreso ?? [],
    historial: inicial.historial ?? [],
    materiales: inicial.materiales ?? [],
  };
  const repositorio: Repositorio = {
    listarUniversidades: async () => [
      { id: "uni-1", nombre: "UCA", sigla: "UCA", sede: "Rosario", estado: "publicado" },
    ],
    listarCarreras: async (universidadId) => [
      {
        id: "car-1",
        universidadId,
        nombre: "Licenciatura en Ciencias de Datos",
        sigla: "LCD",
        estado: "publicado",
      },
    ],
    listarPlanes: async () => [plan.plan],
    obtenerPlanCompleto: async () => plan,
    obtenerPerfil: async () => ({
      id: "u",
      nombre: "Ana Pérez",
      avatarUrl: null,
      esAdmin: false,
    }),
    actualizarPerfil: async () => ({ id: "u", nombre: "x", avatarUrl: null, esAdmin: false }),
    listarInscripciones: async () => base.inscripciones,
    activarPlan: async (planId) => {
      const inscripcion = { id: "ins-1", planId, activa: true };
      base.inscripciones = [inscripcion];
      return inscripcion;
    },
    obtenerProgreso: async () => base.progreso,
    guardarProgreso: async (progreso) => {
      base.progreso = [
        ...base.progreso.filter((f) => f.materiaId !== progreso.materiaId),
        progreso,
      ];
    },
    obtenerHistorial: async () => base.historial,
    crearMateriaPropia: async () => {
      throw new Error("sin implementar");
    },
    actualizarMateriaPropia: async () => {
      throw new Error("sin implementar");
    },
    borrarMateriaPropia: async () => {},
    listarMateriales: async () => base.materiales,
    registrarDocumento: async (documento) => ({ ...documento, id: `doc-${documento.sha256}` }),
    agregarMaterial: async (nuevo) => {
      const material = materialDesde(nuevo, `mat-${base.materiales.length}`);
      base.materiales = [...base.materiales, material];
      return material;
    },
    borrarMaterial: async () => {},
    reemplazarDatosDelPlan: async (_planId, datos) => {
      base.progreso = datos.progreso;
      base.historial = datos.historial;
      return Object.fromEntries(datos.materiasPropias.map((m) => [m.clave, `uuid-${m.clave}`]));
    },
  };
  for (const metodo of Object.keys(repositorio) as (keyof Repositorio)[]) {
    vi.spyOn(repositorio, metodo);
  }
  return Object.assign(repositorio as Mocked<Repositorio>, { base });
}

/** Sin reintentos de lectura, con el mismo indicador y repositorio envuelto que la app real. */
export function renderConRepositorio(ui: ReactElement, repositorio: Repositorio) {
  const guardado = crearAlmacenGuardado();
  const clienteQuery = crearClienteQuery(0);
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const valor = {
    cliente: { auth: { signOut } } as unknown as SupabaseClient,
    url: "http://127.0.0.1:54321",
    repositorio: conIndicador(repositorio, guardado),
    guardado,
    sesion: { estado: "activa" as const, sesion: sesionFalsa() },
  };
  const resultado = render(
    <QueryClientProvider client={clienteQuery}>
      <ContextoSesion.Provider value={valor}>{ui}</ContextoSesion.Provider>
    </QueryClientProvider>,
  );
  return { ...resultado, guardado, clienteQuery };
}

/** Avanza por universidad, carrera y plan, confirmando cada opción. */
export async function pasarPasosDelCatalogo() {
  await screen.findByRole("radio", { name: /UCA/ });
  fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
  await screen.findByRole("radio", { name: /Ciencias de Datos/ });
  fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
  await screen.findByRole("radio", { name: /Plan 7023/ });
  fireEvent.click(screen.getByRole("button", { name: "Elegir este plan" }));
  await screen.findByRole("heading", { name: "¿Cómo querés cargar tus materias?" });
}

export function elegirArchivo(contenido: string, nombre = "respaldo.json") {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Falta el selector de archivo");
  const archivo = new File([contenido], nombre, { type: "application/json" });
  fireEvent.change(input, { target: { files: [archivo] } });
}

export async function hashEs(hash: string) {
  await waitFor(() => {
    if (window.location.hash !== hash) throw new Error(`hash: ${window.location.hash}`);
  });
}
