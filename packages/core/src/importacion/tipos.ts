import type { ConteoEstados } from "../calculo/estados";
import type { DatosImportados } from "../tipos";

export type TipoAviso =
  /** Materia del respaldo sin código en el catálogo: pasa a materia propia. */
  | "materia-sin-match"
  /** Materia del respaldo legacy repetida o con un id que choca con el catálogo: se descarta. */
  | "materia-descartada"
  /** Materia del catálogo que el respaldo legacy no trae: queda `pendiente`. */
  | "materia-sin-datos"
  | "correlativa-sin-resolver"
  | "estado-desconocido"
  | "nota-fuera-de-escala"
  | "evento-descartado"
  /** Fila del respaldo nuevo que apunta a una materia que este plan no tiene: se descarta. */
  | "referencia-sin-resolver"
  | "material-descartado"
  /** Dato inválido reemplazado por un valor por defecto. */
  | "dato-invalido";

export interface AvisoImportacion {
  tipo: TipoAviso;
  /** Código, id o clave de la materia en el archivo. Null si el aviso no es de una materia. */
  materia: string | null;
  /** Mensaje en español, listo para mostrar. */
  mensaje: string;
  /** Valor crudo del archivo que causó el aviso. */
  valor?: unknown;
}

export interface ReporteImportacion {
  avisos: AvisoImportacion[];
}

export interface ResumenImportacion {
  /** Materias del catálogo más materias propias importadas. */
  totalMaterias: number;
  porEstado: ConteoEstados;
  /** Materias del catálogo a las que apunta el archivo. */
  materiasConMatch: number;
  materiasPropias: number;
  eventos: number;
  /** Siempre 0 en un respaldo legacy. */
  materiales: number;
  avisos: number;
}

export interface ErrorImportacion {
  ok: false;
  /** Mensaje en español, listo para mostrar. */
  error: string;
}

export interface ImportacionExitosa {
  ok: true;
  datos: DatosImportados;
  reporte: ReporteImportacion;
  resumen: ResumenImportacion;
}

export type ResultadoImportacion = ImportacionExitosa | ErrorImportacion;

interface MaterialImportadoBase {
  /** Uuid del catálogo, `clave` de una materia propia o null ("sin materia"). */
  materiaId: string | null;
  titulo: string;
  periodo: string | null;
  createdAt: string;
}

/** El binario no viaja en el respaldo: el archivo se abre solo si el dispositivo tiene una copia. */
export interface ArchivoImportado extends MaterialImportadoBase {
  tipo: "archivo";
  sha256: string;
  mime: string | null;
  bytes: number | null;
  paginas: number | null;
}

export interface LinkImportado extends MaterialImportadoBase {
  tipo: "link";
  url: string;
}

export interface NotaImportada extends MaterialImportadoBase {
  tipo: "nota";
  texto: string;
}

export type MaterialImportado = ArchivoImportado | LinkImportado | NotaImportada;

export interface RespaldoLeido extends ImportacionExitosa {
  materiales: MaterialImportado[];
}

export type ResultadoRespaldo = RespaldoLeido | ErrorImportacion;
