import type { DatosAlumno, Materia } from "../tipos";
import { lectorDeEstados } from "./estados";
import { notasDeEscala } from "./sugerencias";
import { ordenarInstancias, resumirMateria } from "./instancias";
import type { Instancia } from "../tipos";

const notasDeInstancias = (lista: Instancia[]) =>
  lista.flatMap((i) => (i.nota == null ? [] : [i.nota]));

function ordenarPorInstancia<T extends { i: Instancia }>(lista: T[]): T[] {
  const orden = ordenarInstancias(lista.map((x) => x.i));
  return [...lista].sort((a, b) => orden.indexOf(a.i) - orden.indexOf(b.i));
}

export interface ResultadoPromedio {
  /** Null si no hay notas que cuenten. Sin redondear. */
  promedio: number | null;
  n: number;
}

export interface PromedioCuatrimestre {
  anio: number;
  cuatrimestre: number;
  conAplazos: boolean;
  promedio: number;
  n: number;
}

export interface PromedioArea {
  area: string;
  conAplazos: boolean;
  promedio: number;
  n: number;
}

export interface PuntoPromedioEnElTiempo {
  fecha: string;
  nota: number;
  materia: Materia;
  /** True si el evento es un examen reprobado que suma al promedio con aplazos. */
  esAplazo: boolean;
  /** Promedio acumulado hasta este evento, sin redondear. */
  promedio: number;
}

export interface BarraDistribucion {
  nota: number;
  cantidad: number;
  /** Nota por debajo de la aprobación del plan: la vista la pinta como aplazo. */
  desaprobada: boolean;
}

export interface AplazoMateria {
  materia: Materia;
  nota: number;
  /** Nota final de la materia, si la tiene. */
  notaMateria: number | null;
}

/**
 * Notas que cuentan: la `nota` de cada materia aprobada y, con aplazos, todos sus aplazos
 * (aunque la materia todavía no esté aprobada).
 */
export function notasDe(
  datos: DatosAlumno,
  conAplazos: boolean,
  materias: Materia[] = datos.materias,
): number[] {
  const progresoPorMateria = new Map(datos.progreso.map((p) => [p.materiaId, p]));
  const notas: number[] = [];
  for (const materia of materias) {
    const progreso = progresoPorMateria.get(materia.id);
    if (!progreso) continue;
    const resumen = resumirMateria(progreso, datos.plan);
    if (progreso.estado === "aprobada" && resumen.nota != null) notas.push(resumen.nota);
    if (conAplazos) notas.push(...notasDeInstancias(resumen.aplazos));
  }
  return notas;
}

function resultado(notas: number[]): ResultadoPromedio {
  const n = notas.length;
  return { promedio: n ? notas.reduce((a, b) => a + b, 0) / n : null, n };
}

export function promedio(datos: DatosAlumno, conAplazos: boolean): ResultadoPromedio {
  return resultado(notasDe(datos, conAplazos));
}

/**
 * Promedio de cada cuatrimestre con notas, ordenado por año y cuatrimestre. Como en la referencia,
 * quedan afuera las materias sin cuatrimestre (anuales) y las de extras (año 0).
 */
export function promedioPorCuatrimestre(
  datos: DatosAlumno,
  conAplazos: boolean,
): PromedioCuatrimestre[] {
  const grupos = new Map<string, { anio: number; cuatrimestre: number; materias: Materia[] }>();
  for (const materia of datos.materias) {
    if (materia.anio < 1 || materia.cuatrimestre == null) continue;
    const clave = `${materia.anio}-${materia.cuatrimestre}`;
    const grupo = grupos.get(clave) ?? {
      anio: materia.anio,
      cuatrimestre: materia.cuatrimestre,
      materias: [],
    };
    grupo.materias.push(materia);
    grupos.set(clave, grupo);
  }
  return [...grupos.values()]
    .sort((a, b) => a.anio - b.anio || a.cuatrimestre - b.cuatrimestre)
    .flatMap(({ anio, cuatrimestre, materias }) => {
      const { promedio, n } = resultado(notasDe(datos, conAplazos, materias));
      return promedio == null ? [] : [{ anio, cuatrimestre, conAplazos, promedio, n }];
    });
}

/**
 * Promedio de cada área con notas, de mayor a menor como la vista Promedio. Las materias con
 * `area` null quedan afuera.
 */
export function promedioPorArea(datos: DatosAlumno, conAplazos: boolean): PromedioArea[] {
  const grupos = new Map<string, Materia[]>();
  for (const materia of datos.materias) {
    if (materia.area == null) continue;
    grupos.set(materia.area, [...(grupos.get(materia.area) ?? []), materia]);
  }
  return [...grupos.entries()]
    .flatMap(([area, materias]) => {
      const { promedio, n } = resultado(notasDe(datos, conAplazos, materias));
      return promedio == null ? [] : [{ area, conAplazos, promedio, n }];
    })
    .sort((a, b) => b.promedio - a.promedio);
}

/**
 * Promedio acumulado instancia por instancia: el final aprobado o la promoción de cada materia
 * aprobada y, con aplazos, los aplazos. A igual fecha conserva el orden de `datos.materias`.
 */
export function promedioEnElTiempo(
  datos: DatosAlumno,
  conAplazos: boolean,
): PuntoPromedioEnElTiempo[] {
  const eventos: Omit<PuntoPromedioEnElTiempo, "promedio">[] = [];
  const progresoPorMateria = new Map(datos.progreso.map((p) => [p.materiaId, p]));
  for (const materia of datos.materias) {
    const progreso = progresoPorMateria.get(materia.id);
    if (!progreso) continue;
    const resumen = resumirMateria(progreso, datos.plan);
    const aprobada =
      progreso.estado === "aprobada" ? (resumen.finalAprobado ?? resumen.promocion) : null;
    const deLaMateria = [
      ...(conAplazos ? resumen.aplazos.map((i) => ({ i, esAplazo: true })) : []),
      ...(aprobada ? [{ i: aprobada, esAplazo: false }] : []),
    ];
    for (const { i, esAplazo } of ordenarPorInstancia(deLaMateria)) {
      if (i.nota != null) eventos.push({ fecha: i.fecha, nota: i.nota, materia, esAplazo });
    }
  }
  eventos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  let suma = 0;
  return eventos.map((evento, i) => {
    suma += evento.nota;
    return { ...evento, promedio: suma / (i + 1) };
  });
}

/**
 * Cantidad de notas por cada valor entero de la escala del plan. Agrupa por la parte entera: un 3,5
 * va en la barra del 3 y no en la del 4, que aprueba.
 */
export function distribucionNotas(datos: DatosAlumno, conAplazos: boolean): BarraDistribucion[] {
  const notas = notasDe(datos, conAplazos);
  return notasDeEscala(datos.plan).map((nota) => ({
    nota,
    cantidad: notas.filter((n) => Math.floor(n) === nota).length,
    desaprobada: nota < datos.plan.notaAprobacion,
  }));
}

export function listaAplazos(datos: DatosAlumno): AplazoMateria[] {
  const progresoPorMateria = new Map(datos.progreso.map((p) => [p.materiaId, p]));
  return datos.materias.flatMap((materia) => {
    const progreso = progresoPorMateria.get(materia.id);
    if (!progreso) return [];
    const resumen = resumirMateria(progreso, datos.plan);
    return notasDeInstancias(resumen.aplazos).map((nota) => ({
      materia,
      nota,
      notaMateria: resumen.nota,
    }));
  });
}

/** Materias aprobadas con la nota máxima del plan. */
export function dieces(datos: DatosAlumno): Materia[] {
  const progresoPorMateria = new Map(datos.progreso.map((p) => [p.materiaId, p]));
  return datos.materias.filter((materia) => {
    const progreso = progresoPorMateria.get(materia.id);
    return (
      progreso?.estado === "aprobada" &&
      resumirMateria(progreso, datos.plan).nota === datos.plan.notaMax
    );
  });
}

/** Materias aprobadas con una promoción. */
export function promocionadas(datos: DatosAlumno): Materia[] {
  const estadoDeMateria = lectorDeEstados(datos);
  const conPromocion = new Set(
    datos.progreso
      .filter((p) => p.instancias.some((i) => i.tipo === "promocion"))
      .map((p) => p.materiaId),
  );
  return datos.materias.filter(
    (materia) => estadoDeMateria(materia.id) === "aprobada" && conPromocion.has(materia.id),
  );
}
