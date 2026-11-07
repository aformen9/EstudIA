import {
  type EventoHistorial,
  type Materia,
  type Inscripcion,
  type Material,
  type NuevoMaterial,
  type PlanCompleto,
  type ProgresoMateria,
  type Repositorio,
} from "@estudia/core";
import { importarArchivo, parsearArchivo } from "@estudia/core/importacion";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { expect, vi, type Mocked } from "vitest";
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

/** Lo que queda en la base después de importar el caso de prueba legacy con `core`. */
export function datosDelCasoDePrueba() {
  const parseado = parsearArchivo(leerFixtureLegacy());
  if (!parseado.ok) throw new Error(parseado.error);
  const leido = importarArchivo(parseado.json, PLAN);
  if (!leido.ok) throw new Error(leido.error);
  return { progreso: leido.datos.progreso, historial: leido.datos.historial };
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

export function materialDesde(nuevo: NuevoMaterial, id = nuevo.id): Material {
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
      // `registrarDocumento` del repositorio falso arma el id con el hash.
      sha256: nuevo.documentoId.replace(/^doc-/, ""),
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
  base: Required<Inicial>;
};

/** `Repositorio` en memoria: cada método es un espía, con todos los pedidos en orden en `mock`. */
export function repositorioFalso(inicial: Inicial = {}): RepositorioFalso {
  const base = {
    plan: inicial.plan ?? PLAN,
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
    listarPlanes: async () => [base.plan.plan],
    obtenerPlanCompleto: async () => base.plan,
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
    // Idempotente por id, como la base: el reintento devuelve lo que hay, sin pisarlo.
    crearMateriaPropia: async (planId, { correlativas, ...datos }, id) => {
      const existente = base.plan.materias.find((m) => m.id === id);
      if (existente) return existente;
      const materia: Materia = {
        ...datos,
        id,
        planId,
        ownerId: "u",
        orden: base.plan.materias.length + 1,
      };
      base.plan = {
        ...base.plan,
        materias: [...base.plan.materias, materia],
        correlativas: [
          ...base.plan.correlativas,
          ...correlativas.map((c) => ({ ...c, materiaId: materia.id })),
        ],
      };
      return materia;
    },
    actualizarMateriaPropia: async (materiaId, { correlativas, ...datos }) => {
      const anterior = base.plan.materias.find((m) => m.id === materiaId) as Materia;
      const materia = { ...anterior, ...datos };
      base.plan = {
        ...base.plan,
        materias: base.plan.materias.map((m) => (m.id === materiaId ? materia : m)),
        correlativas: [
          ...base.plan.correlativas.filter((c) => c.materiaId !== materiaId),
          ...correlativas.map((c) => ({ ...c, materiaId })),
        ],
      };
      return materia;
    },
    // Igual que la base: cascada en correlativas, progreso e historial; el material queda sin materia.
    borrarMateriaPropia: async (materiaId) => {
      base.plan = {
        ...base.plan,
        materias: base.plan.materias.filter((m) => m.id !== materiaId),
        correlativas: base.plan.correlativas.filter(
          (c) => c.materiaId !== materiaId && c.requiereId !== materiaId,
        ),
      };
      base.progreso = base.progreso.filter((f) => f.materiaId !== materiaId);
      base.historial = base.historial.filter((h) => h.materiaId !== materiaId);
      base.materiales = base.materiales.map((m) =>
        m.materiaId === materiaId ? { ...m, materiaId: null, visibilidad: "privado" } : m,
      );
    },
    listarMateriales: async () => base.materiales,
    registrarDocumento: async (documento) => ({ ...documento, id: `doc-${documento.sha256}` }),
    agregarMaterial: async (nuevo) => {
      const existente = base.materiales.find((m) => m.id === nuevo.id);
      if (existente) return existente;
      const material = materialDesde(nuevo);
      base.materiales = [...base.materiales, material];
      return material;
    },
    actualizarMaterial: async (materialId, cambios) => {
      const anterior = base.materiales.find((m) => m.id === materialId);
      if (!anterior) throw new Error("no existe o no es tuyo");
      const corregido = { ...anterior, ...cambios } as Material;
      base.materiales = base.materiales.map((m) => (m.id === materialId ? corregido : m));
      return corregido;
    },
    moverMaterial: async (materialId, materiaId) => {
      const anterior = base.materiales.find((m) => m.id === materialId);
      if (!anterior) throw new Error("no existe o no es tuyo");
      const movido: Material = {
        ...anterior,
        materiaId,
        visibilidad: "privado",
      };
      base.materiales = base.materiales.map((m) => (m.id === materialId ? movido : m));
      return movido;
    },
    borrarMaterial: async (materialId) => {
      base.materiales = base.materiales.filter((m) => m.id !== materialId);
    },
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
export function renderConRepositorio(
  ui: ReactElement,
  repositorio: Repositorio,
  opciones: { tiempoGuardadoMs?: number; sesion?: Session } = {},
) {
  const guardado = crearAlmacenGuardado();
  const clienteQuery = crearClienteQuery(0);
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const valor = {
    cliente: { auth: { signOut } } as unknown as SupabaseClient,
    url: "http://127.0.0.1:54321",
    repositorio: conIndicador(repositorio, guardado, opciones.tiempoGuardadoMs),
    guardado,
    sesion: { estado: "activa" as const, sesion: opciones.sesion ?? sesionFalsa() },
  };
  const resultado = render(
    <QueryClientProvider client={clienteQuery}>
      <ContextoSesion.Provider value={valor}>{ui}</ContextoSesion.Provider>
    </QueryClientProvider>,
  );
  return { ...resultado, guardado, clienteQuery, signOut };
}

/** Muestra una vista y espera a que cargue el plan. */
export async function abrirVista(
  hash: string,
  ui: ReactElement,
  repositorio: Repositorio,
  opciones?: Parameters<typeof renderConRepositorio>[2],
) {
  window.location.hash = hash;
  const resultado = renderConRepositorio(ui, repositorio, opciones);
  await waitFor(() => expect(screen.queryByText("Cargando tu plan…")).toBeNull());
  await waitFor(() => expect(screen.queryByText("Cargando…")).toBeNull());
  await waitFor(() =>
    expect(within(resultado.container.querySelector(".brand") as HTMLElement).getByText(/Plan/)),
  );
  return { ...resultado, main: within(screen.getByRole("main")) };
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

export function elegirArchivo(
  contenido: string,
  nombre = "respaldo.json",
  tipo = "application/json",
) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Falta el selector de archivo");
  const archivo = new File([contenido], nombre, { type: tipo });
  fireEvent.change(input, { target: { files: [archivo] } });
}

/** Para cuando el importador recién se está cargando: se baja aparte del bundle inicial. */
export async function elegirArchivoAlCargar(contenido: string, nombre?: string) {
  await waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeNull());
  elegirArchivo(contenido, nombre);
}

export async function hashEs(hash: string) {
  await waitFor(() => {
    if (window.location.hash !== hash) throw new Error(`hash: ${window.location.hash}`);
  });
}
