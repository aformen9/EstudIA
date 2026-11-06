import type { Correlativa, DatosAlumno, DatosImportados, Materia, PlanCompleto } from "../tipos";

/** `ownerId` de las materias propias de una vista previa, que todavía no tienen dueño en la base. */
export const OWNER_VISTA_PREVIA = "vista-previa";

/**
 * Como `nullif(btrim(codigo), '')` de `reemplazar_datos_del_plan`. `btrim` saca solo espacios, no
 * tabs ni saltos de línea: por eso no se puede usar `trim()`.
 */
function codigoComoLaBase(codigo: string | null): string | null {
  if (codigo === null) return null;
  let inicio = 0;
  let fin = codigo.length;
  while (inicio < fin && codigo[inicio] === " ") inicio++;
  while (fin > inicio && codigo[fin - 1] === " ") fin--;
  return inicio === fin ? null : codigo.slice(inicio, fin);
}

/**
 * Simula cómo `reemplazar_datos_del_plan` empareja las materias propias del archivo, en su orden, con
 * las que ya existen: mismo código o, sin código, otra sin código y con el mismo nombre. Una materia
 * existente se reutiliza una sola vez: si no queda ninguna libre, la del archivo crea una nueva.
 * Devuelve `clave → materia reutilizada`.
 *
 * Solo el código del archivo se normaliza: la RPC compara contra el de la base tal como está. Entre
 * varias existentes iguales, la RPC ordena por `created_at`, `orden` e `id`, y acá por `orden` e `id`
 * porque `Materia` no trae la fecha. Eso no cambia cuántas se conservan, como mucho cuál.
 */
function materiasPropiasReutilizadas(
  plan: PlanCompleto,
  datos: DatosImportados,
): Map<string, Materia> {
  const libres = plan.materias
    .filter((m) => m.ownerId !== null)
    .sort((a, b) => a.orden - b.orden || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const reutilizadas = new Map<string, Materia>();
  for (const importada of datos.materiasPropias) {
    const codigo = codigoComoLaBase(importada.codigo);
    const posicion = libres.findIndex((materia) =>
      codigo === null
        ? materia.codigo === null && materia.nombre === importada.nombre
        : materia.codigo === codigo,
    );
    const [materia] = posicion === -1 ? [] : libres.splice(posicion, 1);
    if (materia) reutilizadas.set(importada.clave, materia);
  }
  return reutilizadas;
}

/** Las materias propias que siguen existiendo después de importar: las que la RPC no reutiliza. */
export function materiasPropiasConservadas(plan: PlanCompleto, datos: DatosImportados): Materia[] {
  const reutilizadas = new Set(materiasPropiasReutilizadas(plan, datos).values());
  return plan.materias.filter((m) => m.ownerId !== null && !reutilizadas.has(m));
}

/**
 * Arma los `DatosAlumno` que quedarían después de aplicar una importación, para calcular sobre ellos
 * antes de guardar. Las materias propias del archivo usan su `clave` como id. Las propias que no se
 * reutilizan se conservan, sin progreso ni historial porque esos se reemplazan.
 */
export function datosAlumnoDesdeImportacion(
  plan: PlanCompleto,
  datos: DatosImportados,
): DatosAlumno {
  const catalogo = plan.materias.filter((m) => m.ownerId === null);
  const reutilizadas = materiasPropiasReutilizadas(plan, datos);
  const conservadas = materiasPropiasConservadas(plan, datos);
  const idsQueSiguen = new Set([...catalogo, ...conservadas].map((m) => m.id));
  // Una conservada puede requerir a una reutilizada: la correlativa sigue, y acá esa materia es su clave.
  const claveDeReutilizada = new Map(
    [...reutilizadas].map(([clave, materia]) => [materia.id, clave]),
  );
  let ultimoOrden = plan.materias.reduce((max, m) => Math.max(max, m.orden), 0);

  const propias = datos.materiasPropias.map((materia): Materia => ({
    id: materia.clave,
    planId: plan.plan.id,
    codigo: codigoComoLaBase(materia.codigo),
    nombre: materia.nombre,
    anio: materia.anio,
    cuatrimestre: materia.cuatrimestre,
    tipo: materia.tipo,
    area: materia.area,
    requiereAnioCompletoParaCursar: materia.requiereAnioCompletoParaCursar,
    ownerId: OWNER_VISTA_PREVIA,
    orden: reutilizadas.get(materia.clave)?.orden ?? ++ultimoOrden,
  }));
  const correlativas: Correlativa[] = [
    ...plan.correlativas
      .filter((c) => idsQueSiguen.has(c.materiaId))
      .map((c) => ({ ...c, requiereId: claveDeReutilizada.get(c.requiereId) ?? c.requiereId })),
    ...datos.materiasPropias.flatMap((materia) =>
      materia.correlativas.map(({ requiere, para, condicion }) => ({
        materiaId: materia.clave,
        requiereId: requiere,
        para,
        condicion,
      })),
    ),
  ];

  return {
    plan: plan.plan,
    universidadSigla: plan.universidadSigla,
    carreraSigla: plan.carreraSigla,
    carreraNombre: plan.carreraNombre,
    materias: [...catalogo, ...conservadas, ...propias],
    correlativas,
    progreso: datos.progreso,
    historial: datos.historial,
  };
}
