import { describe, expect, it } from "vitest";
import { describirDispositivo } from "./datosTecnicos";
import { largoTextoReporte, TEXTO_REPORTE_MAX, validarTextoReporte } from "./reportes";

describe("validarTextoReporte", () => {
  it("acepta de 1 a 1000 caracteres y devuelve el texto sin los espacios de las puntas", () => {
    expect(validarTextoReporte("  hola  ")).toEqual({ valido: true, texto: "hola" });
    expect(validarTextoReporte("a".repeat(TEXTO_REPORTE_MAX)).valido).toBe(true);
  });

  it("rechaza vacío, solo espacios y más de 1000", () => {
    expect(validarTextoReporte("")).toEqual({ valido: false, motivo: "vacio", largo: 0 });
    expect(validarTextoReporte(" \n ")).toMatchObject({ valido: false, motivo: "vacio" });
    expect(validarTextoReporte("a".repeat(1001))).toEqual({
      valido: false,
      motivo: "largo",
      largo: 1001,
    });
  });

  it("los espacios de las puntas no cuentan para el tope", () => {
    expect(validarTextoReporte(`  ${"a".repeat(1000)}  `).valido).toBe(true);
  });

  it("cuenta caracteres, no unidades de UTF-16, igual que la base", () => {
    expect(largoTextoReporte("😀ñ")).toBe(2);
  });
});

describe("describirDispositivo", () => {
  const casos: [string, string, string][] = [
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      "Safari 18",
      "iOS 18",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
      "Safari 18",
      "macOS",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Chrome 131",
      "macOS",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      "Chrome 131",
      "Android 14",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      "Edge 131",
      "Windows",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
      "Firefox 133",
      "Linux",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1",
      "Chrome 131",
      "iOS 17",
    ],
    ["algo raro", "Otro", "Otro"],
  ];

  it.each(casos)("%s", (ua, navegador, sistema) => {
    expect(describirDispositivo(ua)).toEqual({ navegador, sistema });
  });
});
