import { describe, expect, it } from "vitest";
import { planBase } from "../pruebas/auxiliares";
import {
  ajustarAlPaso,
  leerNotaEscrita,
  notaAUnEntero,
  notaAUnPaso,
  notaConComa,
  notaEnPosicion,
  posicionDeNota,
} from "./notas";

const plan = planBase({ notaMin: 1, notaMax: 10, notaAprobacion: 4, notaPaso: 0.1 });
const posicion = (nota: number) => (nota - 1) / 9;

describe("paso de nota", () => {
  it("ajusta al múltiplo más cercano, dentro de la escala", () => {
    expect(ajustarAlPaso(8.57, plan)).toBe(8.6);
    expect(ajustarAlPaso(0.2, plan)).toBe(1);
    expect(ajustarAlPaso(11, plan)).toBe(10);
    expect(ajustarAlPaso(8.3, planBase({ notaPaso: 0.5 }))).toBe(8.5);
    expect(ajustarAlPaso(8.4, planBase({ notaPaso: 1 }))).toBe(8);
  });

  it("no arrastra errores de coma flotante", () => {
    let nota = 1;
    for (let i = 0; i < 90; i++) nota = notaAUnPaso(nota, 1, plan);
    expect(nota).toBe(10);
    expect(notaAUnPaso(7.1, 1, plan)).toBe(7.2);
    expect(notaAUnPaso(0.3 + 0.6, -1, { ...plan, notaMin: 0 })).toBe(0.8);
  });

  it("frena en los extremos", () => {
    expect(notaAUnPaso(10, 1, plan)).toBe(10);
    expect(notaAUnPaso(1, -1, plan)).toBe(1);
    expect(notaAUnEntero(9.5, 1, plan)).toBe(10);
    expect(notaAUnEntero(1.5, -1, plan)).toBe(1);
  });

  it("lleva un valor fuera del paso al siguiente múltiplo en esa dirección", () => {
    expect(notaAUnPaso(7.25, 1, plan)).toBe(7.3);
    expect(notaAUnPaso(7.25, -1, plan)).toBe(7.2);
  });

  it("sin nota arranca en la nota de aprobación", () => {
    expect(notaAUnPaso(null, 1, plan)).toBe(4);
    expect(notaAUnPaso(null, -1, plan)).toBe(4);
    expect(notaAUnEntero(null, 1, plan)).toBe(4);
  });

  it("un entero conserva los decimales", () => {
    expect(notaAUnEntero(8.5, 1, plan)).toBe(9.5);
    expect(notaAUnEntero(8.5, -1, plan)).toBe(7.5);
  });
});

describe("imán del slider", () => {
  it("cae en el entero aunque el dedo no esté justo encima", () => {
    expect(notaEnPosicion(posicion(7.1), plan)).toBe(7);
    expect(notaEnPosicion(posicion(6.9), plan)).toBe(7);
  });

  it("se pueden alcanzar todos los valores de un tramo arrastrando", () => {
    const vistos = new Set<number>();
    for (let n = 7; n <= 8; n += 0.002) vistos.add(notaEnPosicion(posicion(n), plan));
    expect([...vistos].sort((a, b) => a - b)).toEqual([
      7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 8,
    ]);
  });

  it("respeta los extremos y las posiciones fuera del riel", () => {
    expect(notaEnPosicion(-1, plan)).toBe(1);
    expect(notaEnPosicion(0, plan)).toBe(1);
    expect(notaEnPosicion(1, plan)).toBe(10);
    expect(notaEnPosicion(2, plan)).toBe(10);
  });

  it("funciona con otros pasos", () => {
    const medio = planBase({ notaPaso: 0.5 });
    expect(notaEnPosicion(posicion(7.5), medio)).toBe(7.5);
    expect(notaEnPosicion(posicion(7.1), medio)).toBe(7);
    const enteros = planBase({ notaPaso: 1 });
    expect(notaEnPosicion(posicion(7.4), enteros)).toBe(7);
    expect(notaEnPosicion(posicion(7.6), enteros)).toBe(8);
  });

  it("da la posición del riel de una nota", () => {
    expect(posicionDeNota(1, plan)).toBe(0);
    expect(posicionDeNota(10, plan)).toBe(1);
    expect(posicionDeNota(5.5, plan)).toBe(0.5);
  });
});

describe("nota escrita", () => {
  it("acepta coma o punto y redondea al paso", () => {
    expect(leerNotaEscrita("8,5", plan)).toEqual({ tipo: "ok", valor: 8.5 });
    expect(leerNotaEscrita(" 8.57 ", plan)).toEqual({ tipo: "ok", valor: 8.6 });
  });

  it("rechaza lo que no es una nota de la escala", () => {
    for (const texto of ["11", "0", "abc", "8,5,2", "-3"]) {
      expect(leerNotaEscrita(texto, plan)).toEqual({ tipo: "invalida" });
    }
  });

  it("distingue el campo vacío", () => {
    expect(leerNotaEscrita("  ", plan)).toEqual({ tipo: "vacia" });
  });

  it("muestra la nota con coma", () => {
    expect(notaConComa(8.5)).toBe("8,5");
    expect(notaConComa(8)).toBe("8");
    expect(notaConComa(0.1 + 0.2)).toBe("0,3");
  });
});
