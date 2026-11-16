import type {
  EstadoMateria,
  EventoHistorial,
  FuenteHistorial,
  Instancia,
  ProgresoMateria,
  TipoInstancia,
} from "../tipos";

/** Una fila de progreso como la guardaban la app vieja y el respaldo v1: notas en campos fijos. */
export interface ProgresoLegacy {
  materiaId: string;
  estado: EstadoMateria;
  p1: number | null;
  p2: number | null;
  rec: number | null;
  notaCursada: number | null;
  notaFinalExamen: number | null;
  nota: number | null;
  aplazos: number[];
}

const TIPO_DE_EVENTO: Partial<Record<EventoHistorial["tipo"], TipoInstancia>> = {
  Regularidad: "cursada",
  Examen: "final",
  Promocion: "promocion",
};

/** Saca una vez cada valor de `disponibles` que aparezca en `buscados`; devuelve lo que no estaba. */
function sinLosQueYaEstan(buscados: number[], disponibles: number[]): number[] {
  const quedan = [...disponibles];
  return buscados.filter((valor) => {
    const posicion = quedan.indexOf(valor);
    if (posicion < 0) return true;
    quedan.splice(posicion, 1);
    return false;
  });
}

/**
 * Pasa el progreso y el historial viejos a instancias. El historial manda: Regularidad → cursada,
 * Examen → final (un ausente queda sin nota), Promoción → promoción; "En curso" se descarta porque ya
 * lo dice el estado. Lo que los campos fijos tienen y el historial no se agrega con \`fecha\` (la del
 * respaldo): primero parciales, recuperatorio y cursada; después los aplazos y al final la nota
 * aprobada, así quedan en ese orden. Con el fixture no se agrega nada: su historial está completo.
 */
export function instanciasDesdeLegacy(
  fila: ProgresoLegacy,
  eventos: EventoHistorial[],
  fecha: string,
  fuente: FuenteHistorial,
): ProgresoMateria {
  const instancias: Instancia[] = [];
  const agregar = (tipo: TipoInstancia, dia: string, nota: number | null, origen = fuente) => {
    const orden = instancias.length;
    instancias.push({ id: `importada-${orden}`, tipo, fecha: dia, nota, orden, fuente: origen });
  };

  const ordenados = eventos
    .map((evento, posicion) => ({ evento, posicion }))
    .sort((a, b) => a.evento.fecha.localeCompare(b.evento.fecha) || a.posicion - b.posicion);
  for (const { evento } of ordenados) {
    const tipo = TIPO_DE_EVENTO[evento.tipo];
    if (!tipo) continue;
    const nota = evento.resultado === "Ausente" ? null : evento.nota;
    agregar(tipo, evento.fecha, nota, evento.fuente);
  }

  const notasDe = (tipo: TipoInstancia) =>
    instancias.flatMap((i) => (i.tipo === tipo && i.nota != null ? [i.nota] : []));

  for (const nota of [fila.p1, fila.p2]) if (nota != null) agregar("parcial", fecha, nota);
  if (fila.rec != null) agregar("recuperatorio", fecha, fila.rec);
  if (fila.notaCursada != null && !instancias.some((i) => i.tipo === "cursada")) {
    agregar("cursada", fecha, fila.notaCursada);
  }

  const tienePromocion = instancias.some((i) => i.tipo === "promocion");
  const aprobada = fila.notaFinalExamen ?? fila.nota;
  const finales = notasDe("final");
  const aplazosFaltantes = sinLosQueYaEstan(fila.aplazos, finales);
  for (const nota of aplazosFaltantes) agregar("final", fecha, nota);
  if (aprobada != null && !tienePromocion && finales.length === 0) {
    agregar("final", fecha, aprobada);
  }

  return { materiaId: fila.materiaId, estado: fila.estado, instancias };
}

/** Una fila sin estado ni instancias equivale a no tener fila. */
export function progresoVacio(progreso: ProgresoMateria): boolean {
  return progreso.estado === "pendiente" && progreso.instancias.length === 0;
}
