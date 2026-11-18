import { describe, expect, it } from "vitest";
import { urlPanelVisitas } from "./panelVisitas";

describe("urlPanelVisitas", () => {
  it("acepta un enlace para compartir de Umami Cloud", () => {
    expect(urlPanelVisitas(" https://cloud.umami.is/analytics/eu/share/AbC123 ")).toBe(
      "https://cloud.umami.is/analytics/eu/share/AbC123",
    );
  });

  it.each([
    undefined,
    "",
    "no es una url",
    "http://cloud.umami.is/analytics/eu/share/AbC123",
    "https://cloud.umami.is.ejemplo.com/share/AbC123",
    "https://otro.com/share/AbC123",
    "https://cloud.umami.is/websites/123",
    "javascript:alert(1)",
  ])("rechaza %s", (valor) => {
    expect(urlPanelVisitas(valor)).toBeNull();
  });
});
