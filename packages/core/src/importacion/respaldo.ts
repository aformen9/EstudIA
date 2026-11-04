import { z } from "zod";
import type {
  DatosAlumno,
  EventoHistorial,
  FuenteHistorial,
  Material,
  Materia,
  MateriaPropiaImportada,
  ParaCorrelativa,
  CondicionCorrelativa,
  PlanCompleto,
  ProgresoMateria,
} from "../tipos";
import {
  Avisos,
  catalogoPorCodigo,
  normalizarEvento,
  normalizarProgreso,
  type OrigenMateria,
  resumirImportacion,
} from "./normalizar";
import type { MaterialImportado, ResultadoRespaldo } from "./tipos";

export const FORMATO_RESPALDO = "estudia-respaldo";
export const VERSION_RESPALDO = 1;

/** Los uuid cambian entre entornos: el catálogo se referencia por código y lo propio por clave. */
export type ReferenciaMateria = { codigo: string } | { clave: string };

export interface RespaldoMateriaPropia {
  clave: string;
  codigo: string | null;
  nombre: string;
  anio: number;
  cuatrimestre: number | null;
  tipo: string;
  area: string | null;
  requiereAnioCompletoParaCursar: number | null;
  correlativas: {
    requiere: ReferenciaMateria;
    para: ParaCorrelativa;
    condicion: CondicionCorrelativa;
  }[];
}

export interface RespaldoProgreso extends Omit<ProgresoMateria, "materiaId"> {
  materia: ReferenciaMateria;
}

export interface RespaldoEvento extends Omit<EventoHistorial, "materiaId"> {
  materia: ReferenciaMateria;
}

interface RespaldoMaterialBase {
  materia: ReferenciaMateria | null;
  titulo: string;
  periodo: string | null;
  createdAt: string;
}

/**
 * No guarda visibilidad, anonimato ni `oculto`: restaurar un material no puede volver a
 * compartirlo ni sacarle el ocultamiento por denuncias.
 */
export type RespaldoMaterial = RespaldoMaterialBase &
  (
    | {
        tipo: "archivo";
        sha256: string;
        mime: string | null;
        bytes: number | null;
        paginas: number | null;
      }
    | { tipo: "link"; url: string }
    | { tipo: "nota"; texto: string }
  );

export interface RespaldoEstudia {
  formato: typeof FORMATO_RESPALDO;
  version: typeof VERSION_RESPALDO;
  creadoEn: string;
  plan: { universidad: string | null; carrera: string | null; version: string };
  materiasPropias: RespaldoMateriaPropia[];
  progreso: RespaldoProgreso[];
  historial: RespaldoEvento[];
  materiales: RespaldoMaterial[];
}

export interface RespaldoCreado {
  respaldo: RespaldoEstudia;
  /** Materiales de materias que no son de este plan: no entran en el respaldo. */
  materialesOmitidos: Material[];
}

/**
 * Arma el respaldo de un plan, listo para `JSON.stringify`. `creadoEn` es un timestamp ISO que pasa
 * quien llama, para que `core` no dependa del reloj.
 */
export function crearRespaldo(
  datos: DatosAlumno,
  materiales: Material[],
  creadoEn: string,
): RespaldoCreado {
  const materiasPorId = new Map(datos.materias.map((m) => [m.id, m]));
  const referencia = (materiaId: string): ReferenciaMateria | null => {
    const materia = materiasPorId.get(materiaId);
    if (!materia) return null;
    if (materia.ownerId !== null) return { clave: materia.id };
    return materia.codigo ? { codigo: materia.codigo } : null;
  };

  const materiasPropias = datos.materias
    .filter((m) => m.ownerId !== null)
    .map((materia: Materia): RespaldoMateriaPropia => ({
      clave: materia.id,
      codigo: materia.codigo,
      nombre: materia.nombre,
      anio: materia.anio,
      cuatrimestre: materia.cuatrimestre,
      tipo: materia.tipo,
      area: materia.area,
      requiereAnioCompletoParaCursar: materia.requiereAnioCompletoParaCursar,
      correlativas: datos.correlativas
        .filter((c) => c.materiaId === materia.id)
        .flatMap((c) => {
          const requiere = referencia(c.requiereId);
          return requiere ? [{ requiere, para: c.para, condicion: c.condicion }] : [];
        }),
    }));

  const progreso = datos.progreso.flatMap(({ materiaId, ...fila }): RespaldoProgreso[] => {
    const materia = referencia(materiaId);
    return materia ? [{ materia, ...fila }] : [];
  });

  const historial = datos.historial.flatMap(({ materiaId, ...evento }): RespaldoEvento[] => {
    const materia = referencia(materiaId);
    return materia ? [{ materia, ...evento }] : [];
  });

  const omitidos: Material[] = [];
  const materialesRespaldados = materiales.flatMap((material): RespaldoMaterial[] => {
    const materia = material.materiaId === null ? null : referencia(material.materiaId);
    if (material.materiaId !== null && materia === null) {
      omitidos.push(material);
      return [];
    }
    const base = {
      materia,
      titulo: material.titulo,
      periodo: material.periodo,
      createdAt: material.createdAt,
    };
    switch (material.tipo) {
      case "archivo":
        return [
          {
            ...base,
            tipo: "archivo",
            sha256: material.documento.sha256,
            mime: material.documento.mime,
            bytes: material.documento.bytes,
            paginas: material.documento.paginas,
          },
        ];
      case "link":
        return [{ ...base, tipo: "link", url: material.url }];
      case "nota":
        return [{ ...base, tipo: "nota", texto: material.texto }];
    }
  });

  return {
    respaldo: {
      formato: FORMATO_RESPALDO,
      version: VERSION_RESPALDO,
      creadoEn,
      plan: {
        universidad: datos.universidadSigla,
        carrera: datos.carreraSigla,
        version: datos.plan.version,
      },
      materiasPropias,
      progreso,
      historial,
      materiales: materialesRespaldados,
    },
    materialesOmitidos: omitidos,
  };
}

/* ---------- Lectura ---------- */

const esquemaReferencia = z.union([
  z.strictObject({ codigo: z.string().min(1) }),
  z.strictObject({ clave: z.string().min(1) }),
]);

const esquemaMaterialBase = {
  materia: esquemaReferencia.nullable(),
  titulo: z.string().min(1),
  periodo: z.string().nullable(),
  createdAt: z.string().min(1),
};

const esquemaRespaldo = z.object({
  creadoEn: z.string().min(1),
  plan: z.object({
    universidad: z.string().nullable(),
    carrera: z.string().nullable(),
    version: z.string().min(1),
  }),
  materiasPropias: z.array(
    z.object({
      clave: z.string().min(1),
      codigo: z.string().min(1).nullable(),
      nombre: z.string().trim().min(1),
      anio: z.number().int().min(0),
      cuatrimestre: z.number().int().min(1).nullable(),
      tipo: z.string().min(1),
      area: z.string().nullable(),
      requiereAnioCompletoParaCursar: z.number().int().min(1).nullable(),
      correlativas: z.array(
        z.object({
          requiere: esquemaReferencia,
          para: z.enum(["cursar", "rendir"]),
          condicion: z.enum(["regular", "aprobada"]),
        }),
      ),
    }),
  ),
  // Estados y notas se validan después, para reportarlos en vez de rechazar el archivo.
  progreso: z.array(z.looseObject({ materia: esquemaReferencia })),
  historial: z.array(z.looseObject({ materia: esquemaReferencia })),
  materiales: z.array(
    z.discriminatedUnion("tipo", [
      z.object({
        ...esquemaMaterialBase,
        tipo: z.literal("archivo"),
        sha256: z.string(),
        mime: z.string().nullable(),
        bytes: z.number().nullable(),
        paginas: z.number().nullable(),
      }),
      z.object({
        ...esquemaMaterialBase,
        tipo: z.literal("link"),
        url: z.string(),
      }),
      z.object({
        ...esquemaMaterialBase,
        tipo: z.literal("nota"),
        texto: z.string(),
      }),
    ]),
  ),
});
type LecturaRespaldo = z.infer<typeof esquemaRespaldo>;

function nombreDeReferencia(referencia: ReferenciaMateria): string {
  return "codigo" in referencia ? referencia.codigo : referencia.clave;
}

function origenDe(referencia: ReferenciaMateria): OrigenMateria {
  const nombre = nombreDeReferencia(referencia);
  return { id: nombre, nombre };
}

function fuenteDelEvento(valor: unknown, materia: string, avisos: Avisos): FuenteHistorial {
  if (valor === "siu" || valor === "manual" || valor === "ia") return valor;
  avisos.agregar(
    "dato-invalido",
    materia,
    `${materia}: la fuente ${String(valor)} de un evento no existe, usé "manual".`,
    valor,
  );
  return "manual";
}

/** Todas las referencias al catálogo del archivo, para detectar un respaldo de otro plan. */
function codigosReferenciados(respaldo: LecturaRespaldo): Set<string> {
  const referencias: (ReferenciaMateria | null)[] = [
    ...respaldo.progreso.map((fila) => fila.materia),
    ...respaldo.historial.map((evento) => evento.materia),
    ...respaldo.materiales.map((material) => material.materia),
    ...respaldo.materiasPropias.flatMap((m) => m.correlativas.map((c) => c.requiere)),
  ];
  const codigos = new Set<string>();
  for (const referencia of referencias) {
    if (referencia && "codigo" in referencia) codigos.add(referencia.codigo);
  }
  return codigos;
}

function nombreDelPlan(
  universidad: string | null,
  carrera: string | null,
  version: string,
): string {
  return [universidad, carrera, `plan ${version}`].filter((parte) => parte !== null).join(" ");
}

function versionNoSoportada(json: object): string | null {
  const version = "version" in json ? json.version : undefined;
  if (version === VERSION_RESPALDO) return null;
  if (typeof version === "number" && version > VERSION_RESPALDO) {
    return "Este respaldo es de una versión más nueva de EstudIA. Actualizá la app y probá de nuevo.";
  }
  return "El respaldo no es válido: no pude reconocer su versión.";
}

/**
 * Lee un respaldo nuevo contra el plan. Rechaza un archivo inválido o de otro plan con un mensaje
 * claro; lo que no se puede mapear dentro de un archivo válido se reporta. Nunca lanza excepciones
 * por el contenido del archivo. Un plan se reconoce por sus siglas de universidad y carrera, su
 * versión y por compartir códigos con el catálogo. Una sigla vacía solo coincide con otra vacía.
 */
export function leerRespaldo(json: unknown, plan: PlanCompleto): ResultadoRespaldo {
  if (typeof json !== "object" || json === null || !("formato" in json)) {
    return { ok: false, error: "El archivo no es un respaldo de EstudIA." };
  }
  if (json.formato !== FORMATO_RESPALDO) {
    return { ok: false, error: "El archivo no es un respaldo de EstudIA." };
  }
  const version = versionNoSoportada(json);
  if (version) return { ok: false, error: version };

  const lectura = esquemaRespaldo.safeParse(json);
  if (!lectura.success) {
    const ruta = lectura.error.issues[0]?.path.join(".") ?? "";
    return {
      ok: false,
      error: `El respaldo no es válido: revisá el dato en "${ruta}".`,
    };
  }
  const respaldo = lectura.data;

  const origen = respaldo.plan;
  if (
    origen.universidad !== plan.universidadSigla ||
    origen.carrera !== plan.carreraSigla ||
    origen.version !== plan.plan.version
  ) {
    const deOrigen = nombreDelPlan(origen.universidad, origen.carrera, origen.version);
    const actual = nombreDelPlan(plan.universidadSigla, plan.carreraSigla, plan.plan.version);
    return {
      ok: false,
      error: `Este respaldo es de ${deOrigen} y estás en ${actual}. Cambiá de plan para restaurarlo.`,
    };
  }
  const catalogo = catalogoPorCodigo(plan);
  const codigos = codigosReferenciados(respaldo);
  const conMatch = [...codigos].filter((codigo) => catalogo.has(codigo));
  if (codigos.size > 0 && conMatch.length === 0) {
    return {
      ok: false,
      error: `Este respaldo es de otro plan: ninguna de sus materias está en el plan ${plan.plan.version}.`,
    };
  }

  const avisos = new Avisos();
  const idsDelCatalogo = new Set([...catalogo.values()].map((m) => m.id));

  const claves = new Set<string>();
  const propias = respaldo.materiasPropias.filter((materia) => {
    if (claves.has(materia.clave) || idsDelCatalogo.has(materia.clave)) {
      avisos.agregar(
        "materia-descartada",
        materia.clave,
        `${materia.nombre}: la descarté porque su clave ya existe.`,
      );
      return false;
    }
    claves.add(materia.clave);
    return true;
  });

  const resolver = (referencia: ReferenciaMateria): string | null => {
    if ("codigo" in referencia) return catalogo.get(referencia.codigo)?.id ?? null;
    return claves.has(referencia.clave) ? referencia.clave : null;
  };
  const sinResolver = (referencia: ReferenciaMateria, que: string) => {
    const nombre = nombreDeReferencia(referencia);
    avisos.agregar(
      "referencia-sin-resolver",
      nombre,
      `${nombre}: no está en este plan, descarté ${que}.`,
    );
  };

  const materiasPropias = propias.map((materia): MateriaPropiaImportada => {
    const correlativas: MateriaPropiaImportada["correlativas"] = [];
    for (const { requiere, para, condicion } of materia.correlativas) {
      const destino = resolver(requiere);
      if (destino === null || destino === materia.clave) {
        avisos.agregar(
          "correlativa-sin-resolver",
          materia.clave,
          `${materia.nombre}: no encontré la correlativa ${nombreDeReferencia(requiere)} para ${para}.`,
          requiere,
        );
      } else if (!correlativas.some((c) => c.requiere === destino && c.para === para)) {
        correlativas.push({ requiere: destino, para, condicion });
      }
    }
    return { ...materia, correlativas };
  });

  const progreso: ProgresoMateria[] = [];
  const conProgreso = new Set<string>();
  for (const fila of respaldo.progreso) {
    const materiaId = resolver(fila.materia);
    if (materiaId === null) {
      sinResolver(fila.materia, "su progreso");
    } else if (conProgreso.has(materiaId)) {
      const nombre = nombreDeReferencia(fila.materia);
      avisos.agregar(
        "dato-invalido",
        nombre,
        `${nombre}: tiene más de una fila de progreso, usé la primera.`,
      );
    } else {
      conProgreso.add(materiaId);
      progreso.push(normalizarProgreso(fila, materiaId, origenDe(fila.materia), plan.plan, avisos));
    }
  }

  const historial: EventoHistorial[] = [];
  for (const crudo of respaldo.historial) {
    const materiaId = resolver(crudo.materia);
    if (materiaId === null) {
      sinResolver(crudo.materia, "un evento del historial");
      continue;
    }
    const origen = origenDe(crudo.materia);
    const fuente = fuenteDelEvento(crudo.fuente, origen.id, avisos);
    const evento = normalizarEvento(crudo, materiaId, origen, fuente, plan.plan, avisos);
    if (evento) historial.push(evento);
  }

  const materiales = respaldo.materiales.flatMap((material): MaterialImportado[] => {
    let materiaId: string | null = null;
    if (material.materia) {
      materiaId = resolver(material.materia);
      if (materiaId === null) {
        const nombre = nombreDeReferencia(material.materia);
        avisos.agregar(
          "referencia-sin-resolver",
          nombre,
          `${material.titulo}: su materia ${nombre} no está en este plan, quedó sin materia.`,
        );
      }
    }
    const base = {
      materiaId,
      titulo: material.titulo,
      periodo: material.periodo,
      createdAt: material.createdAt,
    };
    const descartar = (motivo: string) => {
      avisos.agregar(
        "material-descartado",
        material.materia && nombreDeReferencia(material.materia),
        `${material.titulo}: lo descarté porque ${motivo}.`,
      );
      return [];
    };
    switch (material.tipo) {
      case "archivo":
        if (!/^[0-9a-f]{64}$/i.test(material.sha256)) {
          return descartar("su sha256 no es válido");
        }
        return [
          {
            ...base,
            tipo: "archivo",
            sha256: material.sha256,
            mime: material.mime,
            bytes: material.bytes,
            paginas: material.paginas,
          },
        ];
      case "link":
        // Solo http(s): la UI pone esta URL en un href y un `javascript:` ejecutaría código.
        if (!/^https?:\/\//i.test(material.url)) return descartar("su link no es http ni https");
        return [{ ...base, tipo: "link", url: material.url }];
      case "nota":
        return [{ ...base, tipo: "nota", texto: material.texto }];
    }
  });

  const datos = { materiasPropias, progreso, historial };
  return {
    ok: true,
    datos,
    materiales,
    reporte: { avisos: avisos.lista },
    resumen: resumirImportacion(plan, datos, conMatch.length, materiales.length, avisos),
  };
}
