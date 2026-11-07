import type { Material } from "@estudia/core";

/** Aparte de sus vistas: el `Shell` los necesita enseguida y las vistas se cargan cuando hacen falta. */
export interface FiltrosMaterias {
  anio: number;
  cuatrimestre: number;
  busqueda: string;
}

export const FILTROS_MATERIAS_INICIALES: FiltrosMaterias = {
  anio: 1,
  cuatrimestre: 1,
  busqueda: "",
};

export type TipoFiltro = "todo" | Material["tipo"];

export interface FiltrosMateriales {
  busqueda: string;
  tipo: TipoFiltro;
  materiaId: string;
}

export const FILTROS_MATERIALES_INICIALES: FiltrosMateriales = {
  busqueda: "",
  tipo: "todo",
  materiaId: "",
};
