import catalogoLcd from "../../../../fixtures/lcd-7023-catalogo.json";
import type {
  Correlativa,
  DatosAlumno,
  EventoHistorial,
  Materia,
  Plan,
  PlanCompleto,
  ProgresoMateria,
} from "../tipos";

export function planBase(cambios: Partial<Plan> = {}): Plan {
  return {
    id: "plan-1",
    carreraId: "carrera-1",
    version: "7023",
    estado: "publicado",
    notaMin: 1,
    notaMax: 10,
    notaAprobacion: 4,
    cuatrimestresPorAnio: 2,
    cierreCuatrimestres: [],
    ...cambios,
  };
}

/** Arma el catálogo LCD 7023 como `PlanCompleto` con uuids de test. `entorno` cambia los uuids. */
export function planLcd(entorno = 0): PlanCompleto {
  const plan = planBase({
    version: catalogoLcd.plan.version,
    notaMin: catalogoLcd.plan.escala.min,
    notaMax: catalogoLcd.plan.escala.max,
    notaAprobacion: catalogoLcd.plan.escala.aprobacion,
  });
  const uuid = (i: number) =>
    `${String(entorno).padStart(8, "0")}-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const materias: Materia[] = catalogoLcd.materias.map((m, i) => ({
    id: uuid(i),
    planId: plan.id,
    codigo: m.codigo,
    nombre: m.nombre,
    anio: m.anio,
    cuatrimestre: m.cuatrimestre,
    tipo: m.tipo,
    area: m.area,
    requiereAnioCompletoParaCursar: m.requiereAnioCompletoParaCursar,
    ownerId: null,
    orden: i,
  }));
  const idPorCodigo = new Map(materias.map((m) => [m.codigo, m.id]));
  const correlativas: Correlativa[] = catalogoLcd.materias.flatMap((m) =>
    m.correlativas.map((c) => ({
      materiaId: idPorCodigo.get(m.codigo) as string,
      requiereId: idPorCodigo.get(c.requiere) as string,
      para: c.para as Correlativa["para"],
      condicion: c.condicion as Correlativa["condicion"],
    })),
  );
  return { plan, universidadSigla: "UCA", carreraSigla: "LCD", materias, correlativas };
}

export function materia(id: string, cambios: Partial<Materia> = {}): Materia {
  return {
    id,
    planId: "plan-1",
    codigo: id,
    nombre: `Materia ${id}`,
    anio: 1,
    cuatrimestre: 1,
    tipo: "Materia",
    area: null,
    requiereAnioCompletoParaCursar: null,
    ownerId: null,
    orden: 0,
    ...cambios,
  };
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

export function evento(
  materiaId: string,
  fecha: string,
  tipo: EventoHistorial["tipo"],
  resultado: EventoHistorial["resultado"],
  nota: number | null,
): EventoHistorial {
  return { materiaId, fecha, tipo, resultado, nota, fuente: "manual" };
}

export function datosDe(cambios: Partial<DatosAlumno> = {}): DatosAlumno {
  return {
    plan: planBase(),
    universidadSigla: "UCA",
    carreraSigla: "LCD",
    materias: [],
    correlativas: [],
    progreso: [],
    historial: [],
    ...cambios,
  };
}

export function redondear4(valor: number): number {
  return Math.round(valor * 10000) / 10000;
}
