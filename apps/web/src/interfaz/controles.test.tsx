import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tipoParaAbrir } from "../materiales/seguridad";
import { primerasLineas } from "../materiales/vistasPrevias";
import { desplazamientoIman, TOPE_IMAN } from "./efectos";
import { CapaFestejo, DURACION_FESTEJO_MS, festejar } from "./Festejo";
import { Segmentado } from "./Segmentado";
import { gruposDeMaterias, SelectorMateria, type OpcionMateria } from "./SelectorMateria";

const MATERIAS: OpcionMateria[] = [
  { id: "a", nombre: "Cálculo Elemental", codigo: "GMA0101", anio: 1, estado: "aprobada" },
  { id: "b", nombre: "Álgebra", codigo: "GMA0102", anio: 1, estado: "pendiente" },
  { id: "c", nombre: "Ingeniería de Datos", codigo: "GTC0319", anio: 3, estado: "cursando" },
  { id: "d", nombre: "Inglés I", codigo: "GID0001", anio: 0, estado: "final" },
];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Segmentado", () => {
  function Prueba() {
    const [valor, setValor] = useState<string>("b");
    return (
      <>
        <span id="et">Estado</span>
        <Segmentado
          idEtiqueta="et"
          valor={valor}
          alCambiar={setValor}
          opciones={[
            { valor: "a", texto: "Uno" },
            { valor: "b", texto: "Dos" },
            { valor: "c", texto: "Tres" },
          ]}
        />
      </>
    );
  }

  it("es un grupo de radios con un solo punto de tabulación, y las flechas eligen", () => {
    render(<Prueba />);
    const grupo = screen.getByRole("radiogroup", { name: "Estado" });
    const radios = within(grupo).getAllByRole("radio");
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(grupo, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Tres" }).getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Tres" }));
    fireEvent.keyDown(grupo, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Uno" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(grupo, { key: "End" });
    expect(screen.getByRole("radio", { name: "Tres" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("SelectorMateria", () => {
  it("agrupa en curso arriba, después por año, y Extras al final", () => {
    const grupos = gruposDeMaterias(MATERIAS, [], "");
    expect(grupos.map((g) => g.titulo)).toEqual(["En curso ahora", "1.° año", "Extras"]);
  });

  it("busca por nombre o código, sin tildes ni mayúsculas", () => {
    expect(gruposDeMaterias(MATERIAS, [], "calculo").flatMap((g) => g.opciones)).toHaveLength(1);
    expect(gruposDeMaterias(MATERIAS, [], "algebra").flatMap((g) => g.opciones)).toHaveLength(1);
    expect(gruposDeMaterias(MATERIAS, [], "gtc0319").flatMap((g) => g.opciones)).toHaveLength(1);
  });

  function Prueba({ alCambiar = () => {} }: { alCambiar?: (id: string) => void }) {
    const [valor, setValor] = useState<string | null>(null);
    return (
      <>
        <span id="et">Materia</span>
        <SelectorMateria
          idEtiqueta="et"
          opciones={MATERIAS}
          valor={valor}
          alCambiar={(id) => {
            setValor(id);
            alCambiar(id);
          }}
        />
      </>
    );
  }

  it("se maneja con teclado: abre, filtra, elige con Enter y devuelve el foco", () => {
    const elegido = vi.fn();
    render(<Prueba alCambiar={elegido} />);
    const boton = screen.getByRole("button", { name: "Materia" });
    fireEvent.click(boton);
    const buscador = screen.getByRole("combobox");
    expect(document.activeElement).toBe(buscador);
    fireEvent.change(buscador, { target: { value: "ingl" } });
    fireEvent.keyDown(buscador, { key: "Enter" });
    expect(elegido).toHaveBeenCalledExactlyOnceWith("d");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(boton);
    expect(boton.textContent).toContain("Inglés I");
    expect(boton.textContent).toContain("Falta final");
  });

  it("Escape cierra solo el selector y no llega al modal", () => {
    const deAfuera = vi.fn();
    render(
      <div onKeyDown={deAfuera}>
        <Prueba />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Materia" }));
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(deAfuera).not.toHaveBeenCalled();
  });

  it("cada opción muestra el estado con texto, no solo con color", () => {
    render(<Prueba />);
    fireEvent.click(screen.getByRole("button", { name: "Materia" }));
    expect(screen.getByRole("option", { name: /^Álgebra/ }).textContent).toContain("Por cursar");
    expect(screen.getByRole("group", { name: "En curso ahora" })).toBeTruthy();
  });
});

describe("Festejo", () => {
  function conMovimiento(reduce: boolean) {
    vi.stubGlobal("matchMedia", (consulta: string) => ({
      matches: consulta.includes("reduce") ? reduce : false,
    }));
    window.matchMedia = globalThis.matchMedia;
  }

  it("muestra la materia y la nota, y se cierra solo", () => {
    conMovimiento(true);
    vi.useFakeTimers();
    render(<CapaFestejo />);
    act(() => festejar({ materia: "Álgebra", nota: 8.5 }));
    expect(screen.getByRole("status").textContent).toContain("¡Felicitaciones!");
    expect(screen.getByText("Álgebra")).toBeTruthy();
    expect(screen.getByText("8,5")).toBeTruthy();
    act(() => vi.advanceTimersByTime(DURACION_FESTEJO_MS));
    expect(screen.queryByText("¡Felicitaciones!")).toBeNull();
    Reflect.deleteProperty(window, "matchMedia");
    vi.unstubAllGlobals();
  });

  it("sin nota no la muestra, y cualquier tecla lo cierra", () => {
    conMovimiento(true);
    vi.useFakeTimers();
    render(<CapaFestejo />);
    act(() => festejar({ materia: "Álgebra", nota: null }));
    expect(screen.queryByText(/con un/)).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    fireEvent.keyDown(document, { key: "a" });
    expect(screen.queryByText("¡Felicitaciones!")).toBeNull();
    Reflect.deleteProperty(window, "matchMedia");
    vi.unstubAllGlobals();
  });
});

describe("imán de los botones primarios", () => {
  it("tiene tope aunque el botón sea ancho", () => {
    const ancho = { left: 0, top: 0, width: 400, height: 48 };
    expect(desplazamientoIman(ancho, 400, 48)).toEqual({ x: TOPE_IMAN.x, y: TOPE_IMAN.y });
    expect(desplazamientoIman(ancho, 0, 0)).toEqual({ x: -TOPE_IMAN.x, y: -TOPE_IMAN.y });
    expect(desplazamientoIman(ancho, 204, 24)).toEqual({ x: 1, y: 0 });
  });
});

describe("abrir archivos", () => {
  it("solo PDF, imágenes y texto se abren adentro; el texto siempre como texto plano", () => {
    expect(tipoParaAbrir("a.pdf", null)).toBe("application/pdf");
    expect(tipoParaAbrir("foto.JPG", "")).toBe("image/jpeg");
    expect(tipoParaAbrir("nota.txt", "text/html")).toBe("text/plain;charset=utf-8");
    expect(tipoParaAbrir("codigo.py", null)).toBe("text/plain;charset=utf-8");
    for (const [nombre, mime] of [
      ["pagina.html", "text/html"],
      ["dibujo.svg", "image/svg+xml"],
      ["tp.docx", null],
      ["programa.exe", null],
      ["foto.heic", "image/heic"],
    ] as const) {
      expect(tipoParaAbrir(nombre, mime)).toBeNull();
    }
  });

  it("la vista previa de texto son las primeras líneas, sin caracteres de control", async () => {
    const texto = ["uno", "dos\u0007", ...Array.from({ length: 30 }, (_, i) => `l${i}`)].join(
      "\r\n",
    );
    const lineas = (await primerasLineas(new Blob([texto]))).split("\n");
    expect(lineas).toHaveLength(14);
    expect(lineas[1]).toBe("dos");
  });
});

describe("ninguna lista nativa", () => {
  it("no queda ningún <select> en la app", () => {
    const raiz = resolve(__dirname, "..");
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (/\.tsx$/.test(nombre) && !/\.test\.tsx$/.test(nombre)) archivos.push(ruta);
      }
    };
    recorrer(raiz);
    const conSelect = archivos.filter((ruta) =>
      /(?<!`)<select[\s>]/.test(readFileSync(ruta, "utf8")),
    );
    expect(conSelect).toEqual([]);
  });
});
