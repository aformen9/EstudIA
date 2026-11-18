import { describe, expect, it } from "vitest";
import { pasosEmbudo } from "./metricas";

describe("pasosEmbudo", () => {
  it("da los cuatro pasos en orden, con el porcentaje respecto de los registrados", () => {
    expect(
      pasosEmbudo({
        registrados: 8,
        eligieronCarrera: 6,
        cargaronMaterias: 3,
        importaronRespaldo: 1,
      }),
    ).toEqual([
      { etiqueta: "Se registraron", alumnos: 8, porcentaje: 100 },
      { etiqueta: "Eligieron carrera", alumnos: 6, porcentaje: 75 },
      { etiqueta: "Cargaron al menos una materia", alumnos: 3, porcentaje: 38 },
      { etiqueta: "Importaron un respaldo", alumnos: 1, porcentaje: 13 },
    ]);
  });

  it("sin registrados no divide por cero", () => {
    const pasos = pasosEmbudo({
      registrados: 0,
      eligieronCarrera: 0,
      cargaronMaterias: 0,
      importaronRespaldo: 0,
    });
    expect(pasos.map((p) => p.porcentaje)).toEqual([null, null, null, null]);
  });
});
