import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Material, Repositorio } from "@estudia/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../interfaz/Shell";
import {
  datosDelCasoDePrueba,
  elegirArchivo,
  fila,
  INSCRIPCION,
  leerFixtureLegacy,
  PLAN,
  renderConRepositorio,
  repositorioFalso,
  type RepositorioFalso,
} from "../pruebas/entornoVistas";

const DIECES_DEL_FIXTURE = 3;

const POR_CODIGO = new Map(PLAN.materias.map((m) => [m.codigo, m]));
function materia(codigo: string) {
  const encontrada = POR_CODIGO.get(codigo);
  if (!encontrada) throw new Error(`No existe ${codigo}`);
  return encontrada;
}

const material = (id: string, cambios: Partial<Material>): Material =>
  ({
    id,
    materiaId: null,
    titulo: id,
    tipo: "nota",
    texto: "x",
    visibilidad: "privado",
    anonimo: false,
    periodo: null,
    oculto: false,
    createdAt: "2026-01-01T00:00:00Z",
    ...cambios,
  }) as Material;

function conCasoDePrueba(extra: Parameters<typeof repositorioFalso>[0] = {}) {
  return repositorioFalso({ inscripciones: [INSCRIPCION], ...datosDelCasoDePrueba(), ...extra });
}

/** Muestra una vista y espera a que cargue el plan. */
async function abrir(hash: string, repositorio: RepositorioFalso | Repositorio) {
  window.location.hash = hash;
  const resultado = renderConRepositorio(<Shell />, repositorio);
  await waitFor(() => expect(screen.queryByText("Cargando tu plan…")).toBeNull());
  await waitFor(() =>
    expect(within(resultado.container.querySelector(".brand") as HTMLElement).getByText(/Plan/)),
  );
  return { ...resultado, main: within(screen.getByRole("main")) };
}

function sinValoresRotos() {
  const texto = screen.getByRole("main").textContent ?? "";
  expect(texto).not.toMatch(/NaN|undefined|null|Infinity/);
  for (const elemento of screen.getByRole("main").querySelectorAll("svg *")) {
    for (const { value } of elemento.attributes) expect(value).not.toMatch(/NaN|Infinity/);
  }
}

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  window.scrollTo = () => {};
});

describe("Inicio con el caso de prueba", () => {
  it("muestra los números del criterio 2 y la alerta de 4° año", async () => {
    const { main } = await abrir("inicio", conCasoDePrueba());

    expect(await main.findByRole("heading", { name: "Llevás 26 de 50 materias aprobadas" }));
    expect(main.getByText(/52 % aprobado/)).toBeTruthy();
    expect(main.getByText(/56 % cursado/)).toBeTruthy();

    const kpi = (nombre: RegExp) => main.getByRole("link", { name: nombre }).textContent;
    expect(kpi(/^Aprobadas/)).toContain("26de 50 materias");
    expect(kpi(/^En curso/)).toContain("5");
    expect(kpi(/^Finales pendientes/)).toContain("2");
    expect(kpi(/^Pendientes/)).toContain("17");
    expect(kpi(/^Promedio/)).toContain("7,73");
    expect(kpi(/^Promedio/)).toContain("con aplazos 7,36");

    const alerta = main.getByText(/Para cursar 4° año necesitás todo 2° año aprobado/);
    expect(alerta.closest(".alert")?.textContent).toContain(materia("GMA0212").nombre);
    sinValoresRotos();
  });

  it("lista finales, este cuatrimestre y lo que se puede cursar", async () => {
    const { main } = await abrir("inicio", conCasoDePrueba());
    const tarjeta = (titulo: string) =>
      within(main.getByRole("heading", { name: titulo }).closest("section") as HTMLElement);

    const finales = tarjeta("Finales por rendir");
    expect(finales.getByRole("button", { name: /^Métodos y Cómputo Numéricos/ })).toBeTruthy();
    expect(finales.getByRole("button", { name: /Series de Tiempo/ }).textContent).toContain(
      `Antes tenés que aprobar ${materia("GMA0212").nombre}`,
    );

    expect(tarjeta("Este cuatrimestre").getAllByRole("button")).toHaveLength(5);

    const anotarte = tarjeta("Podés anotarte").getAllByRole("button");
    expect(anotarte.map((b) => b.querySelector(".nm")?.firstChild?.textContent)).toEqual([
      materia("GES0314").nombre,
      materia("GWA6803").nombre,
    ]);
    expect(main.getByRole("link", { name: "Ver todo: Podés anotarte" }).getAttribute("href")).toBe(
      "#pendientes",
    );
  });

  it("no ofrece cargar materias a quien ya tiene datos", async () => {
    const { main } = await abrir("inicio", conCasoDePrueba());
    await main.findByRole("heading", { name: /Llevás/ });
    expect(main.queryByRole("button", { name: /Cargar materias/ })).toBeNull();
  });

  it("material reciente: los últimos 4, sin materia y de otro plan llevan a Materiales", async () => {
    const m = materia("GMA0136");
    const { main } = await abrir(
      "inicio",
      conCasoDePrueba({
        materiales: [
          material("viejo", { createdAt: "2020-01-01T00:00:00Z" }),
          material("apunte.pdf", {
            tipo: "archivo",
            materiaId: m.id,
            createdAt: "2026-05-01T00:00:00Z",
            documento: { id: "d", sha256: "d", mime: null, bytes: null, paginas: null },
            driveFileId: null,
          } as Partial<Material>),
          material("suelta", { createdAt: "2026-04-01T00:00:00Z" }),
          material("ajeno", { materiaId: "otra-materia", createdAt: "2026-03-01T00:00:00Z" }),
          material("clase", {
            tipo: "link",
            url: "https://x.test",
            materiaId: m.id,
            createdAt: "2026-02-01T00:00:00Z",
          } as Partial<Material>),
        ],
      }),
    );
    const tarjeta = within(
      (await main.findByRole("heading", { name: "Material reciente" })).closest(
        "section",
      ) as HTMLElement,
    );

    await tarjeta.findByText("apunte.pdf");
    expect(tarjeta.getByText("pdf")).toBeTruthy();
    expect(tarjeta.getByRole("button", { name: /apunte\.pdf/ }).textContent).toContain(m.nombre);
    expect(tarjeta.getByRole("link", { name: /suelta.*Sin materia/ }).getAttribute("href")).toBe(
      "#materiales",
    );
    expect(tarjeta.getByRole("link", { name: /ajeno.*De otro plan/ })).toBeTruthy();
    expect(tarjeta.queryByText("viejo")).toBeNull();
    expect(tarjeta.getAllByRole("link", { name: /suelta|ajeno/ })).toHaveLength(2);
  });

  it("si no se puede leer el material lo dice y reintenta, sin tirar abajo Inicio", async () => {
    const repositorio = conCasoDePrueba();
    repositorio.listarMateriales.mockRejectedValue(new Error("sin red"));
    const { main } = await abrir("inicio", repositorio);

    await main.findByRole("heading", { name: /Llevás/ });
    expect((await main.findByRole("alert")).textContent).toContain("sin red");
    repositorio.listarMateriales.mockResolvedValue([]);
    fireEvent.click(main.getByRole("button", { name: "Reintentar" }));
    expect(await main.findByText(/Subí apuntes/)).toBeTruthy();
  });
});

describe("Inicio sin datos", () => {
  const sinDatos = () => repositorioFalso({ inscripciones: [INSCRIPCION] });

  it("muestra los accesos y no rompe sin notas", async () => {
    const { main } = await abrir("inicio", sinDatos());

    expect(await main.findByRole("button", { name: /Cargar materias/ })).toBeTruthy();
    expect(main.getByRole("button", { name: /Importar respaldo/ })).toBeTruthy();
    expect(main.getByRole("heading", { name: "Llevás 0 de 50 materias aprobadas" })).toBeTruthy();
    expect(main.getByRole("link", { name: /^Promedio/ }).textContent).toContain("–");
    sinValoresRotos();
  });

  it("Cargar materias abre la grilla, y Volver regresa a Inicio con los accesos", async () => {
    const { main } = await abrir("inicio", sinDatos());

    fireEvent.click(await main.findByRole("button", { name: /Cargar materias/ }));
    const titulo = main.getByRole("heading", { name: "Marcá cómo vas en cada materia" });
    expect(document.activeElement).toBe(titulo);
    expect(main.getAllByRole("radiogroup")).toHaveLength(50);
    expect(window.location.hash).toBe("#inicio");

    fireEvent.click(main.getByRole("button", { name: "Volver" }));
    expect(await main.findByRole("button", { name: /Cargar materias/ })).toBeTruthy();
    expect(main.queryByRole("radiogroup")).toBeNull();
    expect(document.activeElement).toBe(main.getByRole("heading", { name: "Inicio" }));
  });

  it("marcar una materia y terminar deja Inicio con el dato y sin accesos", async () => {
    const repositorio = sinDatos();
    const { main } = await abrir("inicio", repositorio);

    fireEvent.click(await main.findByRole("button", { name: /Cargar materias/ }));
    const grupo = main.getByRole("radiogroup", { name: PLAN.materias[0]?.nombre });
    fireEvent.click(within(grupo).getByRole("radio", { name: "Aprobada" }));
    await waitFor(() => expect(repositorio.base.progreso).toHaveLength(1));
    // Con datos ya guardados, la grilla sigue abierta hasta que el alumno decida salir.
    expect(main.getAllByRole("radiogroup")).toHaveLength(50);

    fireEvent.click(main.getByRole("button", { name: "Listo, ir a Inicio" }));

    expect(
      await main.findByRole("heading", { name: "Llevás 1 de 50 materias aprobadas" }),
    ).toBeTruthy();
    expect(main.queryByRole("button", { name: /Cargar materias/ })).toBeNull();
  });

  it("salir de la grilla con un fallo avisa y Salir igual vuelve a Inicio", async () => {
    const repositorio = sinDatos();
    repositorio.guardarProgreso.mockRejectedValueOnce(new Error("se cortó"));
    const { main } = await abrir("inicio", repositorio);

    fireEvent.click(await main.findByRole("button", { name: /Cargar materias/ }));
    const grupo = main.getByRole("radiogroup", { name: PLAN.materias[0]?.nombre });
    fireEvent.click(within(grupo).getByRole("radio", { name: "Aprobada" }));
    await main.findByText(/No se guardó/);

    fireEvent.click(main.getByRole("button", { name: "Listo, ir a Inicio" }));
    await main.findByText("1 materia no se guardó");
    fireEvent.click(main.getByRole("button", { name: "Salir igual" }));

    expect(await main.findByRole("button", { name: /Cargar materias/ })).toBeTruthy();
  });

  it("Importar respaldo guarda y vuelve a Inicio aunque el hash ya sea #inicio", async () => {
    const repositorio = sinDatos();
    const { main } = await abrir("inicio", repositorio);

    fireEvent.click(await main.findByRole("button", { name: /Importar respaldo/ }));
    expect(main.getByRole("heading", { name: "Importá tu respaldo" })).toBeTruthy();

    elegirArchivo(leerFixtureLegacy());
    fireEvent.click(await main.findByRole("button", { name: "Guardar estos datos" }));

    expect(
      await main.findByRole("heading", { name: "Llevás 26 de 50 materias aprobadas" }),
    ).toBeTruthy();
    expect(main.queryByRole("heading", { name: "Importá tu respaldo" })).toBeNull();
    expect(main.queryByRole("button", { name: /Cargar materias/ })).toBeNull();
  });

  it("Volver desde importar regresa a Inicio", async () => {
    const { main } = await abrir("inicio", sinDatos());
    fireEvent.click(await main.findByRole("button", { name: /Importar respaldo/ }));
    fireEvent.click(main.getByRole("button", { name: "Volver" }));
    expect(await main.findByRole("button", { name: /Cargar materias/ })).toBeTruthy();
  });

  it("recargar en medio de la grilla vuelve a Inicio con los accesos, sin trabar a nadie", async () => {
    const repositorio = sinDatos();
    const primera = await abrir("inicio", repositorio);
    fireEvent.click(await primera.main.findByRole("button", { name: /Cargar materias/ }));
    primera.unmount();

    const { main } = await abrir("inicio", repositorio);

    expect(await main.findByRole("button", { name: /Cargar materias/ })).toBeTruthy();
    expect(main.queryByRole("radiogroup")).toBeNull();
  });
});

describe("Materias", () => {
  it("muestra por defecto 1° año y 1° cuatrimestre, con el estado de cada una", async () => {
    const { main } = await abrir("materias", conCasoDePrueba());
    expect(main.getByRole("button", { name: "1° año" }).getAttribute("aria-pressed")).toBe("true");
    const calculo = await main.findByRole("button", { name: /^Cálculo Elemental/ });
    expect(calculo.querySelector(".grade")?.textContent).toBe("9");
    expect(
      main.getAllByRole("button", { name: /./ }).filter((b) => b.classList.contains("subj")),
    ).toHaveLength(5);
  });

  it("las pestañas cambian de año y cuatrimestre, y Extras no tiene cuatrimestres", async () => {
    const { main } = await abrir("materias", conCasoDePrueba());
    const filas = () => screen.getByRole("main").querySelectorAll(".subj");
    await waitFor(() => expect(filas()).toHaveLength(5));

    fireEvent.click(main.getByRole("button", { name: "4° año" }));
    expect(filas()).toHaveLength(7);
    expect(main.getByRole("button", { name: "4° año" }).getAttribute("aria-pressed")).toBe("true");
    expect(main.getByRole("button", { name: "1° año" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(main.getByRole("button", { name: "2° cuatrimestre" }));
    expect(filas()).toHaveLength(7);
    expect(main.getByRole("button", { name: "2° cuatrimestre" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    fireEvent.click(main.getByRole("button", { name: "Extras" }));
    expect(filas()).toHaveLength(3);
    expect(main.queryByRole("button", { name: "1° cuatrimestre" })).toBeNull();
  });

  it("marca requisitos con los datos de core", async () => {
    const { main } = await abrir("materias", conCasoDePrueba());
    fireEvent.click(await main.findByRole("button", { name: "4° año" }));
    const filas = [...screen.getByRole("main").querySelectorAll(".subj")].map((f) => f.textContent);
    expect(filas.some((t) => /Te falta(n \d+ requisitos| 1 requisito)/.test(t ?? ""))).toBe(true);
  });

  it("la búsqueda encuentra por nombre, sin tildes y por código, y oculta las pestañas", async () => {
    const { main } = await abrir("materias", conCasoDePrueba());
    const buscador = await main.findByRole("searchbox", { name: "Buscar materia o código" });

    fireEvent.change(buscador, { target: { value: "calculo elemental" } });
    expect(main.getByRole("button", { name: /^Cálculo Elemental/ })).toBeTruthy();
    expect(main.queryByRole("button", { name: "1° año" })).toBeNull();
    expect(main.getByRole("heading", { name: "1° año · 1° cuatrimestre" })).toBeTruthy();
    expect(main.getByText("1 materia encontrada").getAttribute("role")).toBe("status");
    expect(buscador.isConnected).toBe(true);

    fireEvent.change(buscador, { target: { value: "gma0212" } });
    expect(main.getByRole("button", { name: /Métodos y Cómputo Numéricos/ })).toBeTruthy();

    fireEvent.change(buscador, { target: { value: "no existe" } });
    expect(main.getByRole("heading", { name: "Sin resultados" })).toBeTruthy();

    fireEvent.change(buscador, { target: { value: "" } });
    expect(main.getByRole("button", { name: "1° año" })).toBeTruthy();
  });

  it("recuerda la pestaña y la búsqueda al ir a otra vista y volver", async () => {
    const { main } = await abrir("materias", conCasoDePrueba());
    fireEvent.click(await main.findByRole("button", { name: "3° año" }));

    await act(async () => {
      window.location.hash = "aprobadas";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await act(async () => {
      window.location.hash = "materias";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    const principal = within(screen.getByRole("main"));
    expect(principal.getByRole("button", { name: "3° año" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("una materia anual se ve en todas las pestañas de su año", async () => {
    const base = PLAN.materias[0];
    if (!base) throw new Error("sin materias");
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.obtenerPlanCompleto.mockResolvedValue({
      ...PLAN,
      materias: [
        { ...base, id: "anual", nombre: "Anual propia", cuatrimestre: null, ownerId: "u" },
      ],
    });
    const { main } = await abrir("materias", repositorio);

    const fila1 = await main.findByRole("button", { name: /Anual propia/ });
    expect(fila1.textContent).toContain("Anual");
    fireEvent.click(main.getByRole("button", { name: "2° cuatrimestre" }));
    expect(main.getByRole("button", { name: /Anual propia/ })).toBeTruthy();
  });

  it("abrir una materia es un botón que avisa que llega pronto", async () => {
    const { main } = await abrir("materias", conCasoDePrueba());
    fireEvent.click(await main.findByRole("button", { name: /^Cálculo Elemental/ }));
    expect(screen.getByText(/Próximamente vas a poder abrir cada materia/)).toBeTruthy();
    expect(screen.getByText(/Próximamente/).closest("[role=status]")).toBeTruthy();
  });
});

describe("Aprobadas", () => {
  it("muestra cantidad, promedio, dieces y promocionadas, agrupadas", async () => {
    const { main } = await abrir("aprobadas", conCasoDePrueba());
    const dato = (nombre: string) =>
      main.getByText(nombre).closest("div")?.querySelector(".big-num")?.textContent;

    await waitFor(() => expect(dato("Materias aprobadas")).toBe("26"));
    expect(dato("Promedio")).toBe("7,73");
    expect(dato("Dieces")).toBe(String(DIECES_DEL_FIXTURE));
    expect(dato("Promocionadas")).toBe("2");
    expect(screen.getByRole("main").querySelectorAll(".subj.s-aprobada")).toHaveLength(26);
    expect(main.getByRole("heading", { name: "1° año · 1° cuatrimestre" })).toBeTruthy();
  });

  it("sin aprobadas muestra la caja vacía y un guion en el promedio", async () => {
    const { main } = await abrir("aprobadas", repositorioFalso({ inscripciones: [INSCRIPCION] }));
    expect(await main.findByRole("heading", { name: "Todavía no hay aprobadas" })).toBeTruthy();
    expect(main.getByText("Promedio").closest("div")?.textContent).toContain("–");
    sinValoresRotos();
  });
});

describe("En curso", () => {
  it("lista las 5, con su lugar en el plan", async () => {
    const { main } = await abrir("cursando", conCasoDePrueba());
    await waitFor(() =>
      expect(screen.getByRole("main").querySelectorAll(".subj.s-cursando")).toHaveLength(5),
    );
    expect(main.getAllByText(/° año · \d° cuatrimestre/).length).toBeGreaterThanOrEqual(5);
    expect(main.getByText(/Cargá tus parciales/)).toBeTruthy();
  });

  it("sin materias en curso muestra la caja vacía", async () => {
    const { main } = await abrir("cursando", repositorioFalso({ inscripciones: [INSCRIPCION] }));
    expect(await main.findByRole("heading", { name: "No tenés materias en curso" })).toBeTruthy();
  });
});

describe("Finales pendientes", () => {
  it("muestra nota de cursada, fecha y si se puede rendir", async () => {
    const { main } = await abrir("finales", conCasoDePrueba());

    const series = (await main.findByRole("heading", { name: materia("GES0315").nombre })).closest(
      "section",
    ) as HTMLElement;
    expect(series.querySelector(".nota-cursada")?.textContent).toBe("10");
    expect(series.textContent).toContain("Cursada aprobada el 24/06/2025");
    expect(series.textContent).toContain(`Antes tenés que aprobar ${materia("GMA0212").nombre}`);

    const metodos = main
      .getByRole("heading", { name: materia("GMA0212").nombre })
      .closest("section") as HTMLElement;
    expect(metodos.textContent).toContain("Cursada aprobada el 24/11/2024");
    expect(within(metodos).getByRole("button", { name: "Abrir materia" })).toBeTruthy();
  });

  it("cuenta los intentos de final, también los ausentes", async () => {
    const m = materia("GMA0212");
    const { main } = await abrir(
      "finales",
      repositorioFalso({
        inscripciones: [INSCRIPCION],
        progreso: [fila(m.id, { estado: "final", aplazos: [2] })],
        historial: [
          {
            materiaId: m.id,
            fecha: "2025-02-01",
            tipo: "Examen",
            nota: 2,
            resultado: "Reprobado",
            fuente: "manual",
          },
          {
            materiaId: m.id,
            fecha: "2025-03-01",
            tipo: "Examen",
            nota: null,
            resultado: "Ausente",
            fuente: "manual",
          },
        ],
      }),
    );
    expect(await main.findByText(/2 intentos de final \(2, ausente\)/)).toBeTruthy();
  });

  it("sin finales muestra la caja vacía", async () => {
    const { main } = await abrir("finales", repositorioFalso({ inscripciones: [INSCRIPCION] }));
    expect(await main.findByRole("heading", { name: "No tenés finales pendientes" })).toBeTruthy();
  });
});

describe("Pendientes", () => {
  it("separa las 2 que se pueden cursar de las 15 que no", async () => {
    const { main } = await abrir("pendientes", conCasoDePrueba());

    const podes = (await main.findByRole("region", { name: "Podés cursarlas" })) as HTMLElement;
    const nombres = [...podes.querySelectorAll(".subj b")].map((b) => b.textContent);
    expect(nombres).toEqual([materia("GES0314").nombre, materia("GWA6803").nombre]);
    expect(podes.querySelector(".group-t span")?.textContent).toBe("2");

    const todaviaNo = main.getByRole("region", { name: "Todavía no" });
    expect(todaviaNo.querySelectorAll(".subj")).toHaveLength(15);
    expect(todaviaNo.querySelector(".tag.lock")).toBeTruthy();
  });

  it("sin pendientes muestra la caja vacía", async () => {
    const repositorio = repositorioFalso({
      inscripciones: [INSCRIPCION],
      progreso: PLAN.materias.map((m) => fila(m.id, { estado: "aprobada", nota: 8 })),
    });
    const { main } = await abrir("pendientes", repositorio);
    expect(
      await main.findByRole("heading", { name: "No te quedan materias pendientes" }),
    ).toBeTruthy();
  });
});

describe("Promedio", () => {
  it("muestra los dos promedios y cambia entre sin y con aplazos", async () => {
    const { main } = await abrir("promedio", conCasoDePrueba());
    const dato = (nombre: string) => {
      const fila = screen.getByRole("main").querySelector<HTMLElement>(".stat-row");
      return within(fila as HTMLElement)
        .getByText(nombre)
        .closest("div")
        ?.querySelector(".big-num")?.textContent;
    };

    await waitFor(() => expect(dato("Promedio sin aplazos")).toBe("7,73"));
    expect(dato("Con aplazos")).toBe("7,36");
    expect(dato("Notas que cuentan")).toBe("26");
    expect(dato("Aplazos")).toBe("2");

    const con = main.getByRole("button", { name: "Con aplazos" });
    fireEvent.click(con);
    expect(con.getAttribute("aria-pressed")).toBe("true");
    expect(dato("Promedio con aplazos")).toBe("7,36");
    expect(dato("Sin aplazos")).toBe("7,73");
    expect(dato("Notas que cuentan")).toBe("28");
  });

  it("lista los aplazos de GMA1234 y GCO0406", async () => {
    const { main } = await abrir("promedio", conCasoDePrueba());
    const probabilidad = await main.findByRole("button", {
      name: new RegExp(`^${materia("GMA1234").nombre}`),
    });
    expect(probabilidad.textContent).toContain("después aprobada con 6");
    expect(probabilidad.querySelector(".pill")?.textContent).toBe("2");
    const bases = main.getByRole("button", { name: new RegExp(`^${materia("GCO0406").nombre}`) });
    expect(bases.querySelector(".pill")?.textContent).toBe("3");
    sinValoresRotos();
  });

  it("cada gráfico tiene nombre, resumen y tabla", async () => {
    const { main } = await abrir("promedio", conCasoDePrueba());
    await main.findByRole("group", { name: "Promedio acumulado en el tiempo" });

    for (const nombre of [
      "Promedio acumulado en el tiempo",
      "Promedio por cuatrimestre",
      "Cantidad de notas por valor",
      "Promedio por área",
    ]) {
      const grafico = main.getByRole("group", { name: nombre });
      const resumen = document.getElementById(grafico.getAttribute("aria-describedby") ?? "");
      expect(resumen?.textContent).not.toBe("");
      expect(main.getByRole("table", { name: nombre })).toBeTruthy();
    }

    const distribucion = main.getByRole("table", { name: "Cantidad de notas por valor" });
    expect(within(distribucion).getAllByRole("row")).toHaveLength(11);
    const tiempo = main.getByRole("table", { name: "Promedio acumulado en el tiempo" });
    expect(within(tiempo).getAllByRole("row").at(-1)?.textContent).toContain("7,73");
  });

  it("con aplazos, la tabla del tiempo marca los aplazos y termina en 7,36", async () => {
    const { main } = await abrir("promedio", conCasoDePrueba());
    fireEvent.click(await main.findByRole("button", { name: "Con aplazos" }));
    const tiempo = main.getByRole("table", { name: "Promedio acumulado en el tiempo" });
    expect(tiempo.textContent).toContain("2 (aplazo)");
    expect(within(tiempo).getAllByRole("row").at(-1)?.textContent).toContain("7,36");
  });

  it("el tooltip funciona con el teclado: una parada de Tab, flechas y Escape", async () => {
    const { main } = await abrir("promedio", conCasoDePrueba());
    const grafico = await main.findByRole("group", { name: "Promedio por área" });
    const marcas = within(grafico).getAllByRole("img");
    expect(marcas.filter((m) => m.getAttribute("tabindex") === "0")).toHaveLength(1);

    act(() => (marcas[0] as unknown as HTMLElement).focus());
    expect(screen.getByRole("tooltip").textContent).toMatch(/: \d.*\(\d+ notas?\)/);

    fireEvent.keyDown(marcas[0] as Element, { key: "ArrowRight" });
    expect(document.activeElement).toBe(marcas[1]);
    expect(marcas[1]?.getAttribute("tabindex")).toBe("0");
    expect(marcas[0]?.getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("tooltip").textContent).toBe(marcas[1]?.getAttribute("aria-label"));

    fireEvent.keyDown(marcas[1] as Element, { key: "End" });
    expect(document.activeElement).toBe(marcas.at(-1));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();

    act(() => (marcas.at(-1) as unknown as HTMLElement).blur());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("el tooltip funciona con el táctil: se abre al tocar y se cierra al tocar afuera", async () => {
    const { main } = await abrir("promedio", conCasoDePrueba());
    const grafico = await main.findByRole("group", { name: "Cantidad de notas por valor" });
    const marca = within(grafico).getAllByRole("img")[0] as Element;

    fireEvent.pointerEnter(marca, { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(marca, { clientX: 200, clientY: 200 });
    expect(screen.getByRole("tooltip").textContent).toMatch(/^Nota \d+: \d+ (vez|veces)/);

    // Levantar el dedo no lo cierra.
    fireEvent.pointerLeave(marca, { pointerType: "touch" });
    expect(screen.getByRole("tooltip")).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("el tooltip acompaña a la marca enfocada si el gráfico se desplaza, y si no se cierra", async () => {
    const { main } = await abrir("promedio", conCasoDePrueba());
    const grafico = await main.findByRole("group", { name: "Promedio acumulado en el tiempo" });
    const marca = within(grafico).getAllByRole("img")[0] as unknown as HTMLElement;

    act(() => marca.focus());
    fireEvent.scroll(window);
    expect(screen.getByRole("tooltip")).toBeTruthy();

    act(() => marca.blur());
    fireEvent.click(marca, { clientX: 10, clientY: 10 });
    fireEvent.scroll(window);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("el tooltip sigue al mouse y se va al salir", async () => {
    const { main } = await abrir("promedio", conCasoDePrueba());
    const grafico = await main.findByRole("group", { name: "Promedio por cuatrimestre" });
    const marca = within(grafico).getAllByRole("img")[0] as Element;

    fireEvent.pointerEnter(marca, { pointerType: "mouse", clientX: 300, clientY: 200 });
    expect(screen.getByRole("tooltip").textContent).toContain("1° año 1° cuat.");
    fireEvent.pointerLeave(marca, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("sin notas ni historial no rompe ni muestra NaN", async () => {
    const { main } = await abrir("promedio", repositorioFalso({ inscripciones: [INSCRIPCION] }));

    expect(await main.findByText("Todavía no hay suficientes notas.")).toBeTruthy();
    expect(main.getAllByText("Sin datos.")).toHaveLength(2);
    expect(main.getByText("No tenés aplazos. 💪")).toBeTruthy();
    expect(main.getByText("Promedio sin aplazos").closest("div")?.textContent).toContain("–");
    sinValoresRotos();
  });

  it("con notas pero sin historial no rompe", async () => {
    const m = materia("GMA0136");
    const { main } = await abrir(
      "promedio",
      repositorioFalso({
        inscripciones: [INSCRIPCION],
        progreso: [fila(m.id, { estado: "aprobada", nota: 8 })],
      }),
    );
    expect(await main.findByText("Todavía no hay suficientes notas.")).toBeTruthy();
    expect(main.getByRole("group", { name: "Promedio por cuatrimestre" })).toBeTruthy();
    sinValoresRotos();
  });

  it("con historial de la misma fecha y una sola nota por cuatrimestre no rompe", async () => {
    const [a, b] = [materia("GMA0136"), materia("GMA1234")];
    const evento = (materiaId: string, nota: number) => ({
      materiaId,
      fecha: "2025-01-01",
      tipo: "Examen" as const,
      nota,
      resultado: "Aprobado" as const,
      fuente: "manual" as const,
    });
    const { main } = await abrir(
      "promedio",
      repositorioFalso({
        inscripciones: [INSCRIPCION],
        progreso: [
          fila(a.id, { estado: "aprobada", nota: 10 }),
          fila(b.id, { estado: "aprobada", nota: 10 }),
        ],
        historial: [evento(a.id, 10), evento(b.id, 10)],
      }),
    );
    await main.findByRole("group", { name: "Promedio acumulado en el tiempo" });
    sinValoresRotos();
  });

  it("recuerda sin o con aplazos al ir a otra vista y volver", async () => {
    const { main } = await abrir("promedio", conCasoDePrueba());
    fireEvent.click(await main.findByRole("button", { name: "Con aplazos" }));
    await act(async () => {
      window.location.hash = "inicio";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await act(async () => {
      window.location.hash = "promedio";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(
      within(screen.getByRole("main"))
        .getByRole("button", { name: "Con aplazos" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("vistas sin datos de una materia", () => {
  it.each(["inicio", "materias", "aprobadas", "cursando", "finales", "pendientes", "promedio"])(
    "#%s con plan vacío no rompe",
    async (hash) => {
      const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
      repositorio.obtenerPlanCompleto.mockResolvedValue({
        ...PLAN,
        materias: [],
        correlativas: [],
      });
      const consola = vi.spyOn(console, "error");
      window.location.hash = hash;
      renderConRepositorio(<Shell />, repositorio);
      await waitFor(() => expect(repositorio.obtenerHistorial).toHaveBeenCalled());
      await act(async () => {});
      await waitFor(() => expect(screen.queryByText("Cargando tu plan…")).toBeNull());
      sinValoresRotos();
      expect(consola).not.toHaveBeenCalled();
      consola.mockRestore();
    },
  );
});
