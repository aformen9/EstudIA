import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("muestra el nombre de la app", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "EstudIA" })).toBeTruthy();
  });
});
