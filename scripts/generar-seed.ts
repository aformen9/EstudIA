/**
 * Genera supabase/seed.sql desde fixtures/lcd-7023-catalogo.json (`pnpm seed`).
 * Los uuids se derivan del catálogo (uuid v5) y el archivo no lleva fechas: correrlo dos veces da
 * el mismo resultado, y reaplicar el seed actualiza las filas en vez de duplicarlas.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

interface CorrelativaCatalogo {
  para: string;
  requiere: string;
  condicion: string;
}

interface MateriaCatalogo {
  codigo: string;
  nombre: string;
  anio: number;
  cuatrimestre: number | null;
  tipo: string;
  area: string | null;
  requiereAnioCompletoParaCursar: number | null;
  correlativas: CorrelativaCatalogo[];
}

interface Catalogo {
  universidad: { nombre: string; sigla: string; sede: string };
  carrera: { nombre: string; sigla: string };
  plan: {
    version: string;
    escala: { min: number; max: number; aprobacion: number };
    cuatrimestresPorAnio: number;
  };
  materias: MateriaCatalogo[];
}

/** El catálogo no trae los cierres: se usa el ejemplo de docs/arquitectura.md §4.1. */
const CIERRE_CUATRIMESTRES = [
  { cuatrimestre: 1, mes: 7 },
  { cuatrimestre: 2, mes: 12 },
];

/** Espacio de nombres de los uuid v5 de EstudIA. No cambiarlo: cambiaría todos los ids del catálogo. */
const ESPACIO_UUID = "6f0d6e0a-3b7c-5c1e-9a44-2d1f8e7b5a10";

function uuidV5(nombre: string): string {
  const hash = createHash("sha1")
    .update(Buffer.from(ESPACIO_UUID.replaceAll("-", ""), "hex"))
    .update(nombre, "utf8")
    .digest();
  const version = hash.readUInt8(6);
  const variante = hash.readUInt8(8);
  hash.writeUInt8((version & 0x0f) | 0x50, 6);
  hash.writeUInt8((variante & 0x3f) | 0x80, 8);
  const hex = hash.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function sql(valor: string | number | null): string {
  if (valor === null) return "null";
  if (typeof valor === "number") return String(valor);
  return `'${valor.replaceAll("'", "''")}'`;
}

function fila(...valores: (string | number | null)[]): string {
  return `  (${valores.map(sql).join(", ")})`;
}

function generar(catalogo: Catalogo): string {
  const { universidad, carrera, plan, materias } = catalogo;

  const universidadId = uuidV5(`universidad:${universidad.sigla}:${universidad.sede}`);
  const carreraId = uuidV5(`carrera:${universidadId}:${carrera.sigla}`);
  const planId = uuidV5(`plan:${carreraId}:${plan.version}`);
  const idMateria = new Map(
    materias.map((m) => [m.codigo, uuidV5(`materia:${planId}:${m.codigo}`)]),
  );

  const filasMaterias = materias.map((m, i) =>
    fila(
      idMateria.get(m.codigo) ?? null,
      planId,
      m.codigo,
      m.nombre,
      m.anio,
      m.cuatrimestre,
      m.tipo,
      m.area,
      m.requiereAnioCompletoParaCursar,
      i + 1,
    ),
  );

  const filasCorrelativas = materias.flatMap((m) =>
    m.correlativas.map((c) => {
      const requiereId = idMateria.get(c.requiere);
      if (requiereId === undefined) {
        throw new Error(
          `${m.codigo} tiene una correlativa a una materia que no existe: ${c.requiere}`,
        );
      }
      return fila(idMateria.get(m.codigo) ?? null, requiereId, c.para, c.condicion);
    }),
  );

  const texto = `-- GENERADO por scripts/generar-seed.ts desde fixtures/lcd-7023-catalogo.json. No editar a mano: correr \`pnpm seed\`.
-- ${String(materias.length)} materias y ${String(filasCorrelativas.length)} correlativas.

insert into public.universidades (id, nombre, sigla, sede, estado, creado_por) values
${fila(universidadId, universidad.nombre, universidad.sigla, universidad.sede, "publicado", null)}
on conflict (id) do update set
  nombre = excluded.nombre,
  sigla = excluded.sigla,
  sede = excluded.sede,
  estado = excluded.estado;

insert into public.carreras (id, universidad_id, nombre, sigla, estado, creado_por) values
${fila(carreraId, universidadId, carrera.nombre, carrera.sigla, "publicado", null)}
on conflict (id) do update set
  nombre = excluded.nombre,
  sigla = excluded.sigla,
  estado = excluded.estado;

insert into public.planes (id, carrera_id, version, estado, creado_por, nota_min, nota_max, nota_aprobacion, cuatrimestres_por_anio, cierre_cuatrimestres) values
  (${[
    sql(planId),
    sql(carreraId),
    sql(plan.version),
    sql("publicado"),
    "null",
    sql(plan.escala.min),
    sql(plan.escala.max),
    sql(plan.escala.aprobacion),
    sql(plan.cuatrimestresPorAnio),
    `${sql(JSON.stringify(CIERRE_CUATRIMESTRES))}::jsonb`,
  ].join(", ")})
on conflict (id) do update set
  estado = excluded.estado,
  nota_min = excluded.nota_min,
  nota_max = excluded.nota_max,
  nota_aprobacion = excluded.nota_aprobacion,
  cuatrimestres_por_anio = excluded.cuatrimestres_por_anio,
  cierre_cuatrimestres = excluded.cierre_cuatrimestres;

insert into public.materias (id, plan_id, codigo, nombre, anio, cuatrimestre, tipo, area, requiere_anio_completo_para_cursar, orden) values
${filasMaterias.join(",\n")}
on conflict (id) do update set
  codigo = excluded.codigo,
  nombre = excluded.nombre,
  anio = excluded.anio,
  cuatrimestre = excluded.cuatrimestre,
  tipo = excluded.tipo,
  area = excluded.area,
  requiere_anio_completo_para_cursar = excluded.requiere_anio_completo_para_cursar,
  orden = excluded.orden;

insert into public.correlativas (materia_id, requiere_id, para, condicion) values
${filasCorrelativas.join(",\n")}
on conflict (materia_id, requiere_id, para) do update set
  condicion = excluded.condicion;
`;
  return texto;
}

const rutaCatalogo = new URL("../fixtures/lcd-7023-catalogo.json", import.meta.url);
const rutaSeed = new URL("../supabase/seed.sql", import.meta.url);

const catalogo = JSON.parse(readFileSync(rutaCatalogo, "utf8")) as Catalogo;
writeFileSync(rutaSeed, generar(catalogo));

console.log(`supabase/seed.sql generado con ${String(catalogo.materias.length)} materias`);
