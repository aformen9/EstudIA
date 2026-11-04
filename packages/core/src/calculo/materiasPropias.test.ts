import { describe, expect, it } from "vitest";
import { materia } from "../pruebas/auxiliares";
import type { BorradorCorrelativa, Correlativa } from "../tipos";
import { cicloDeCorrelativas } from "./materiasPropias";

const materias = ["a", "b", "c"].map((id) => materia(id));

function pide(
  requiereId: string,
  para: Correlativa["para"],
  condicion: Correlativa["condicion"],
): BorradorCorrelativa {
  return { requiereId, para, condicion };
}

function de(materiaId: string, correlativa: BorradorCorrelativa): Correlativa {
  return { materiaId, ...correlativa };
}

describe("cicloDeCorrelativas", () => {
  it("detecta un ciclo directo para cursar", () => {
    const correlativas = [de("b", pide("a", "cursar", "regular"))];
    expect(
      cicloDeCorrelativas({ materias, correlativas }, "a", [pide("b", "cursar", "regular")]),
    ).toEqual(["a", "b"]);
  });

  it("detecta un ciclo de 3 materias y las devuelve en orden", () => {
    const correlativas = [
      de("b", pide("c", "cursar", "regular")),
      de("c", pide("a", "cursar", "aprobada")),
    ];
    expect(
      cicloDeCorrelativas({ materias, correlativas }, "a", [pide("b", "cursar", "regular")]),
    ).toEqual(["a", "b", "c"]);
  });

  it("deja guardar A cursar→B regular con B rendir→A aprobada, porque no bloquea", () => {
    const correlativas = [de("b", pide("a", "rendir", "aprobada"))];
    expect(
      cicloDeCorrelativas({ materias, correlativas }, "a", [pide("b", "cursar", "regular")]),
    ).toBeNull();
  });

  it("da lo mismo si se guarda desde la otra materia", () => {
    const correlativas = [de("a", pide("b", "cursar", "regular"))];
    expect(
      cicloDeCorrelativas({ materias, correlativas }, "b", [pide("a", "rendir", "aprobada")]),
    ).toBeNull();
  });

  it("A cursar→B aprobada con B rendir→A aprobada tampoco deja avanzar a ninguna", () => {
    const correlativas = [de("b", pide("a", "rendir", "aprobada"))];
    expect(
      cicloDeCorrelativas({ materias, correlativas }, "a", [pide("b", "cursar", "aprobada")]),
    ).toEqual(["a", "b"]);
  });

  it("detecta dos materias que se piden aprobadas para rendir", () => {
    const correlativas = [de("b", pide("a", "rendir", "aprobada"))];
    expect(
      cicloDeCorrelativas({ materias, correlativas }, "a", [pide("b", "rendir", "aprobada")]),
    ).toEqual(["a", "b"]);
  });

  it("detecta la autorreferencia que bloquea", () => {
    const datos = { materias, correlativas: [] };
    expect(cicloDeCorrelativas(datos, "a", [pide("a", "cursar", "regular")])).toEqual(["a"]);
    expect(cicloDeCorrelativas(datos, "a", [pide("a", "cursar", "aprobada")])).toEqual(["a"]);
    expect(cicloDeCorrelativas(datos, "a", [pide("a", "rendir", "aprobada")])).toEqual(["a"]);
  });

  it("no considera bloqueo pedirse a sí misma regular para rendir", () => {
    const datos = { materias, correlativas: [] };
    expect(cicloDeCorrelativas(datos, "a", [pide("a", "rendir", "regular")])).toBeNull();
  });

  it("una materia nueva no forma ciclo", () => {
    const correlativas = [de("b", pide("a", "cursar", "regular"))];
    expect(
      cicloDeCorrelativas({ materias, correlativas }, null, [pide("b", "cursar", "regular")]),
    ).toBeNull();
  });

  it("el borrador reemplaza a las anteriores: sacar la que cerraba el ciclo da null", () => {
    const correlativas = [
      de("a", pide("b", "cursar", "regular")),
      de("b", pide("a", "cursar", "regular")),
    ];
    expect(cicloDeCorrelativas({ materias, correlativas }, "a", [])).toBeNull();
  });

  it("ignora una correlativa a una materia que no está en la lista, aunque cierre un ciclo", () => {
    const correlativas = [de("fantasma", pide("a", "cursar", "regular"))];
    expect(
      cicloDeCorrelativas({ materias, correlativas }, "a", [pide("fantasma", "cursar", "regular")]),
    ).toBeNull();
  });

  it("un ciclo ajeno que no pasa por la materia no le impide guardar", () => {
    const correlativas = [
      de("b", pide("c", "cursar", "regular")),
      de("c", pide("b", "cursar", "regular")),
    ];
    expect(
      cicloDeCorrelativas({ materias, correlativas }, "a", [pide("b", "cursar", "regular")]),
    ).toBeNull();
  });
});
