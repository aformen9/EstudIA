import { type Material } from "@estudia/core";
import { crearRespaldo } from "@estudia/core/importacion";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TiempoDeGuardadoAgotado } from "../guardado/almacenGuardado";
import { Shell } from "../interfaz/Shell";
import { ID_ALUMNO } from "../pruebas/clienteFalso";
import {
  abrirVista,
  elegirArchivo,
  elegirArchivoAlCargar,
  fila,
  INSCRIPCION,
  PLAN,
  repositorioFalso,
  type RepositorioFalso,
} from "../pruebas/entornoVistas";
import { materialDesde } from "../pruebas/entornoVistas";
import { basesDeIndexedDb, hacerFallarIndexedDb } from "../pruebas/indexedDbFalso";
import { LimiteDeDocumento } from "../repositorio/limites";
import { tituloDeArchivo } from "./useMateriales";
import { archivosDeUsuario, calcularSha256, nombreDeBase } from "./archivosLocales";
import { normalizarUrlIngresada, tipoQueSePuedeAbrir, urlSegura } from "./seguridad";
import { TAMANIO_MAXIMO_BYTES } from "./useMateriales";

const MATERIA = PLAN.materias.find((m) => m.codigo === "GMA0136") ?? PLAN.materias[0];
if (!MATERIA) throw new Error("Sin materias");
const SHA = "a".repeat(64);

const base = {
  materiaId: null,
  visibilidad: "privado",
  anonimo: false,
  periodo: null,
  oculto: false,
  createdAt: "2026-02-03T00:00:00Z",
} as const;

const nota = (id: string, cambios: Partial<Material> = {}) =>
  ({ ...base, id, titulo: id, tipo: "nota", texto: "contenido", ...cambios }) as Material;
const link = (id: string, url: string, cambios: Partial<Material> = {}) =>
  ({ ...base, id, titulo: id, tipo: "link", url, ...cambios }) as Material;
const archivo = (id: string, mime: string | null, sha256 = SHA, cambios: Partial<Material> = {}) =>
  ({
    ...base,
    id,
    titulo: id,
    tipo: "archivo",
    driveFileId: null,
    documento: { id: `doc-${id}`, sha256, mime, bytes: 2048, paginas: null },
    ...cambios,
  }) as Material;

const conMateriales = (materiales: Material[]) =>
  repositorioFalso({ inscripciones: [INSCRIPCION], materiales });

const abrir = (repositorio: RepositorioFalso) => abrirVista("materiales", <Shell />, repositorio);

const MIOS = archivosDeUsuario(ID_ALUMNO);

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  window.scrollTo = () => {};
  URL.createObjectURL = vi.fn(() => "blob:falso");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("seguridad de links", () => {
  it.each(["https://x.test/a", "http://x.test"])("acepta %s", (url) => {
    expect(urlSegura(url)).not.toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "vbscript:x",
    "no es una url",
  ])("rechaza %j", (url) => {
    expect(urlSegura(url)).toBeNull();
  });

  it("lo que escribe el alumno: sin protocolo asume https y otro protocolo se rechaza", () => {
    expect(normalizarUrlIngresada(" ejemplo.com/a ")).toBe("https://ejemplo.com/a");
    expect(normalizarUrlIngresada("ejemplo.com:8080/a")).toBe("https://ejemplo.com:8080/a");
    expect(normalizarUrlIngresada("javascript:alert(1)")).toBeNull();
    expect(normalizarUrlIngresada("")).toBeNull();
  });

  it("un link válido abre con noopener noreferrer", async () => {
    const { main } = await abrir(conMateriales([link("clase", "https://x.test/a")]));
    const abrirLink = await main.findByRole("link", { name: "Abrir" });
    expect(abrirLink.getAttribute("href")).toBe("https://x.test/a");
    expect(abrirLink.getAttribute("rel")).toBe("noopener noreferrer");
    expect(abrirLink.getAttribute("target")).toBe("_blank");
  });

  it("un javascript: que ya esté en la base no llega a un href", async () => {
    const { main, container } = await abrir(conMateriales([link("malo", "javascript:alert(1)")]));
    expect(await main.findByText("Link no válido")).toBeTruthy();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it("al agregar, un link con otro protocolo no se guarda", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const { main } = await abrirVista("materias", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: new RegExp(`^${MATERIA?.nombre}`) }));
    const panel = within(await screen.findByRole("dialog"));

    fireEvent.click(panel.getByRole("button", { name: "Link" }));
    fireEvent.change(panel.getByLabelText("Dirección del link"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(panel.getByRole("button", { name: "Agregar link" }));

    expect((await panel.findByRole("alert")).textContent).toContain("http o https");
    expect(repositorio.agregarMaterial).not.toHaveBeenCalled();
  });
});

describe("tipos que se abren en la app", () => {
  it.each(["application/pdf", "image/png", "image/jpeg", "IMAGE/WEBP", "application/pdf; x=1"])(
    "abre %s",
    (mime) => {
      expect(tipoQueSePuedeAbrir(mime)).not.toBeNull();
    },
  );

  it.each([
    "text/html",
    "image/svg+xml",
    "application/xhtml+xml",
    "text/xml",
    "application/octet-stream",
    "",
    null,
  ])("descarga %s", (mime) => {
    expect(tipoQueSePuedeAbrir(mime)).toBeNull();
  });
});

describe("abrir un archivo local", () => {
  const guardarLocal = (mime: string | null, sha256 = SHA) =>
    MIOS.guardar({
      sha256,
      nombre: "x",
      mime,
      bytes: 3,
      contenido: new Blob(["<script>alert(1)</script>"], { type: mime ?? "" }),
    });

  it("un PDF se abre en una pestaña sin acceso a la app", async () => {
    await guardarLocal("application/pdf");
    const ventana = { opener: window, location: { href: "" }, close: vi.fn() };
    const abrirVentana = vi
      .spyOn(window, "open")
      .mockReturnValue(ventana as unknown as WindowProxy);
    const { main } = await abrir(conMateriales([archivo("apunte.pdf", "application/pdf")]));

    fireEvent.click(await main.findByRole("button", { name: "Abrir" }));

    await waitFor(() => expect(ventana.location.href).toBe("blob:falso"));
    expect(abrirVentana).toHaveBeenCalledOnce();
    expect(ventana.opener).toBeNull();
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("application/pdf");
  });

  it.each(["text/html", "image/svg+xml"])(
    "un %s no se abre en el origen de la app: se descarga",
    async (mime) => {
      await guardarLocal(mime);
      const abrirVentana = vi.spyOn(window, "open");
      const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const { main } = await abrir(conMateriales([archivo("pagina", mime)]));

      expect(main.queryByRole("button", { name: "Abrir" })).toBeNull();
      fireEvent.click(await main.findByRole("button", { name: "Descargar" }));

      await waitFor(() => expect(clic).toHaveBeenCalledOnce());
      expect(abrirVentana).not.toHaveBeenCalled();
      const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
      expect(blob.type).toBe("application/octet-stream");
    },
  );

  it("decide por el tipo guardado acá, no por el del documento compartido", async () => {
    await guardarLocal("text/html");
    const { main } = await abrir(conMateriales([archivo("trampa.pdf", "application/pdf")]));
    expect(await main.findByRole("button", { name: "Descargar" })).toBeTruthy();
    expect(main.queryByRole("button", { name: "Abrir" })).toBeNull();
  });
});

describe("archivos locales", () => {
  it("cada usuario tiene su base", () => {
    expect(nombreDeBase("a")).not.toBe(nombreDeBase("b"));
    expect(nombreDeBase("a")).toContain("a");
  });

  it("otra cuenta en el mismo navegador no ve ni borra los archivos", async () => {
    const ajenos = archivosDeUsuario("otra-cuenta");
    const contenido = new Blob(["x"]);
    await ajenos.guardar({ sha256: SHA, nombre: "x", mime: null, bytes: 1, contenido });

    expect(await MIOS.leer(SHA)).toBeNull();
    expect(await MIOS.listar()).toEqual([]);
    await MIOS.borrarTodo();
    await MIOS.borrar(SHA);
    expect(await ajenos.contar()).toBe(1);
    expect(basesDeIndexedDb()).toContain(nombreDeBase("otra-cuenta"));
  });

  it("la vista no muestra el archivo de otra cuenta como disponible", async () => {
    await archivosDeUsuario("otra-cuenta").guardar({
      sha256: SHA,
      nombre: "x",
      mime: "application/pdf",
      bytes: 1,
      contenido: new Blob(["x"]),
    });
    const { main } = await abrir(conMateriales([archivo("apunte.pdf", "application/pdf")]));
    expect(await main.findByText(/Disponible en el dispositivo donde lo subiste/)).toBeTruthy();
    expect(main.queryByRole("button", { name: "Abrir" })).toBeNull();
  });

  it("calcula el sha256 de verdad", async () => {
    expect(await calcularSha256(new Blob(["abc"]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("subir un archivo", () => {
  async function abrirSubir(repositorio: RepositorioFalso) {
    const { main } = await abrir(repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Subir material" }));
    return within(await screen.findByRole("dialog", { name: "Subir material" }));
  }

  it("la materia se elige entre las del plan activo, con las en curso primero", async () => {
    const enCurso = PLAN.materias.at(-1);
    const repositorio = repositorioFalso({
      inscripciones: [INSCRIPCION],
      progreso: [fila(enCurso?.id ?? "", { estado: "cursando" })],
    });
    const dialogo = await abrirSubir(repositorio);
    const opciones = within(
      dialogo.getByLabelText("¿De qué materia es?"),
    ).getAllByRole<HTMLOptionElement>("option");
    expect(opciones).toHaveLength(PLAN.materias.length);
    expect(opciones[0]?.textContent).toBe(`${enCurso?.nombre} · en curso`);
    const ids = new Set(PLAN.materias.map((m) => m.id));
    expect(opciones.every((o) => ids.has(o.value))).toBe(true);
  });

  it("guarda la copia local por sha256 y registra el documento sin texto", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    await abrirSubir(repositorio);

    elegirArchivo("abc", "apunte.pdf", "application/pdf");

    const sha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    await waitFor(() => expect(repositorio.agregarMaterial).toHaveBeenCalledOnce());
    expect(repositorio.registrarDocumento).toHaveBeenCalledExactlyOnceWith({
      sha256: sha,
      mime: "application/pdf",
      bytes: 3,
      paginas: null,
      texto: null,
    });
    expect(repositorio.agregarMaterial.mock.calls[0]?.[0]).toMatchObject({
      tipo: "archivo",
      titulo: "apunte.pdf",
      documentoId: `doc-${sha}`,
    });
    expect((await MIOS.leer(sha))?.mime).toBe("application/pdf");
  });

  it("si falla la nube no deja una copia suelta, y lo dice", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.registrarDocumento.mockRejectedValueOnce(new Error("sin red"));
    const dialogo = await abrirSubir(repositorio);

    elegirArchivo("abc", "apunte.pdf", "application/pdf");

    expect((await dialogo.findByRole("alert")).textContent).toContain("sin red");
    expect(await MIOS.contar()).toBe(0);
    expect(repositorio.agregarMaterial).not.toHaveBeenCalled();
  });

  it("pasado el tiempo máximo conserva la copia: pudo haberse guardado", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.agregarMaterial.mockRejectedValueOnce(new TiempoDeGuardadoAgotado());
    const dialogo = await abrirSubir(repositorio);

    elegirArchivo("abc", "apunte.pdf", "application/pdf");

    expect((await dialogo.findByRole("alert")).textContent).toContain("tardó demasiado");
    expect(await MIOS.contar()).toBe(1);
  });

  it("volver a elegir el archivo después de un timeout usa el mismo id y no duplica", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const original = repositorio.agregarMaterial.getMockImplementation();
    repositorio.listarMateriales.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    repositorio.agregarMaterial.mockImplementationOnce(async (nuevo) => {
      await original?.(nuevo);
      throw new TiempoDeGuardadoAgotado();
    });
    const dialogo = await abrirSubir(repositorio);

    elegirArchivo("reintento", "apunte.pdf", "application/pdf");
    await dialogo.findByRole("alert");
    // La lectura también se había perdido: no se entera de que ya está.
    repositorio.listarMateriales.mockResolvedValueOnce([]);
    elegirArchivo("reintento", "apunte.pdf", "application/pdf");

    await waitFor(() => expect(repositorio.agregarMaterial).toHaveBeenCalledTimes(2));
    const [primero, segundo] = repositorio.agregarMaterial.mock.calls;
    expect(segundo?.[0].id).toBe(primero?.[0].id);
    expect(repositorio.base.materiales).toHaveLength(1);
  });

  it.each([
    ["EQ001", "demasiado texto"],
    ["EQ002", "límite de espacio de tu cuenta"],
    ["EQ003", "más de 50 MB"],
    ["EQ004", "tipo de archivo"],
  ] as const)("%s se le explica al alumno, nombrando el archivo", async (codigo, texto) => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.registrarDocumento.mockRejectedValueOnce(new LimiteDeDocumento(codigo));
    const dialogo = await abrirSubir(repositorio);

    elegirArchivo("abc", "apunte.pdf", "application/pdf");

    const alerta = (await dialogo.findByRole("alert")).textContent ?? "";
    expect(alerta).toContain('"apunte.pdf"');
    expect(alerta).toContain(texto);
    expect(alerta).not.toContain("No pude subir");
    expect(screen.queryAllByText("Sin conexión")).toHaveLength(0);
    expect(screen.getAllByText("No se pudo guardar").length).toBeGreaterThan(0);
    expect(repositorio.registrarDocumento).toHaveBeenCalledOnce();
    expect(await MIOS.contar()).toBe(0);
  });

  it("si no se puede guardar acá no registra nada", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const dialogo = await abrirSubir(repositorio);
    hacerFallarIndexedDb("put");

    elegirArchivo("abc", "apunte.pdf", "application/pdf");

    expect((await dialogo.findByRole("alert")).textContent).toContain("No pude subir");
    expect(repositorio.registrarDocumento).not.toHaveBeenCalled();
  });

  it("rechaza un archivo de más de 50 MB", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const dialogo = await abrirSubir(repositorio);
    const grande = new File(["x"], "grande.pdf");
    Object.defineProperty(grande, "size", { value: TAMANIO_MAXIMO_BYTES + 1 });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [grande] },
    });
    expect((await dialogo.findByRole("alert")).textContent).toContain("50 MB");
    expect(repositorio.registrarDocumento).not.toHaveBeenCalled();
  });
});

describe("sha256", () => {
  it("no se muestra en ningún lado, ni en la vista ni en el panel", async () => {
    await MIOS.guardar({
      sha256: SHA,
      nombre: "x",
      mime: "application/pdf",
      bytes: 1,
      contenido: new Blob(["x"]),
    });
    const m = archivo("apunte.pdf", "application/pdf", SHA, { materiaId: MATERIA?.id ?? null });
    const { main } = await abrir(conMateriales([m]));
    await main.findByText("apunte.pdf");
    fireEvent.click(main.getByRole("button", { name: MATERIA?.nombre }));
    await screen.findByRole("dialog");
    expect(document.documentElement.outerHTML).not.toContain(SHA);
  });
});

describe("vista Materiales", () => {
  const delPlan = nota("del plan", { materiaId: MATERIA?.id ?? null });
  const suelta = nota("suelta");
  const ajena = nota("de otro plan", { materiaId: "otra-materia" });

  it("muestra los del plan activo y los sin materia, no los de otro plan", async () => {
    const { main } = await abrir(conMateriales([delPlan, suelta, ajena]));
    expect(await main.findByText("del plan")).toBeTruthy();
    expect(main.getByText("suelta")).toBeTruthy();
    expect(main.getByText("Sin materia")).toBeTruthy();
    expect(main.queryByText("de otro plan")).toBeNull();
    expect(main.getByRole("button", { name: "Todo 2" })).toBeTruthy();
  });

  it("sin material muestra la caja vacía", async () => {
    const { main } = await abrir(conMateriales([ajena]));
    expect(await main.findByRole("heading", { name: "Todavía no subiste material" })).toBeTruthy();
  });

  it("filtra por tipo, materia y texto, y resalta lo buscado", async () => {
    const { main, container } = await abrir(
      conMateriales([delPlan, suelta, link("clase", "https://x.test")]),
    );
    await main.findByText("clase");

    fireEvent.click(main.getByRole("button", { name: "Links 1" }));
    expect(main.queryByText("suelta")).toBeNull();
    expect(main.getByText("clase")).toBeTruthy();
    fireEvent.click(main.getByRole("button", { name: "Todo 3" }));

    fireEvent.change(main.getByLabelText("Filtrar por materia"), {
      target: { value: MATERIA?.id },
    });
    expect(main.queryByText("suelta")).toBeNull();
    fireEvent.change(main.getByLabelText("Filtrar por materia"), { target: { value: "" } });

    fireEvent.change(main.getByRole("searchbox"), { target: { value: "SUEL" } });
    expect(main.queryByText("clase")).toBeNull();
    expect(container.querySelector("mark")?.textContent).toBe("suel");

    fireEvent.change(main.getByRole("searchbox"), { target: { value: "no existe" } });
    expect(main.getByRole("heading", { name: "Sin resultados" })).toBeTruthy();
  });

  it("si no se puede leer el material lo dice y reintenta", async () => {
    const repositorio = conMateriales([]);
    repositorio.listarMateriales.mockRejectedValueOnce(new Error("sin red"));
    const { main } = await abrir(repositorio);
    expect((await main.findByRole("alert")).textContent).toContain("sin red");
    fireEvent.click(main.getByRole("button", { name: "Reintentar" }));
    expect(await main.findByRole("heading", { name: "Todavía no subiste material" })).toBeTruthy();
  });
});

describe("material en el panel", () => {
  it("queda aparte del formulario y aclara que se guarda solo", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const { main } = await abrirVista("materias", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: new RegExp(`^${MATERIA?.nombre}`) }));
    const dialogo = await screen.findByRole("dialog");
    const seccion = within(dialogo).getByRole("region", { name: "Material de estudio" });
    expect(seccion.textContent).toContain("Se guarda solo");
    expect(seccion.closest("form")).toBeNull();
    expect(dialogo.querySelector("form")?.contains(seccion)).toBe(false);
  });

  it("reintentar un link usa siempre el mismo id, aunque haya corregido algo", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.agregarMaterial
      .mockRejectedValueOnce(new TiempoDeGuardadoAgotado())
      .mockRejectedValueOnce(new TiempoDeGuardadoAgotado());
    const { main } = await abrirVista("materias", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: new RegExp(`^${MATERIA?.nombre}`) }));
    const panel = within(await screen.findByRole("dialog"));

    fireEvent.click(panel.getByRole("button", { name: "Link" }));
    const direccion = panel.getByLabelText("Dirección del link");
    fireEvent.change(direccion, { target: { value: "ejemplo.com/a" } });
    fireEvent.click(panel.getByRole("button", { name: "Agregar link" }));
    await panel.findByRole("alert");
    fireEvent.click(panel.getByRole("button", { name: "Agregar link" }));
    await waitFor(() => expect(repositorio.agregarMaterial).toHaveBeenCalledTimes(2));
    await panel.findByRole("button", { name: "Agregar link" });
    fireEvent.change(direccion, { target: { value: "ejemplo.com/b" } });
    fireEvent.click(panel.getByRole("button", { name: "Agregar link" }));
    await waitFor(() => expect(repositorio.agregarMaterial).toHaveBeenCalledTimes(3));

    const ids = repositorio.agregarMaterial.mock.calls.map(([nuevo]) => nuevo.id);
    expect(new Set(ids).size).toBe(1);
    await waitFor(() => expect(repositorio.base.materiales).toHaveLength(1));
    expect(repositorio.base.materiales[0]).toMatchObject({ url: "https://ejemplo.com/b" });
  });

  it("si el primer intento llegó aunque no respondió, corregir no duplica y aplica lo corregido", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    repositorio.agregarMaterial.mockImplementationOnce(async (nuevo) => {
      repositorio.base.materiales = [...repositorio.base.materiales, materialDesde(nuevo)];
      throw new TiempoDeGuardadoAgotado();
    });
    const { main } = await abrirVista("materias", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: new RegExp(`^${MATERIA?.nombre}`) }));
    const panel = within(await screen.findByRole("dialog"));

    fireEvent.click(panel.getByRole("button", { name: "Nota" }));
    fireEvent.change(panel.getByLabelText("Título de la nota"), { target: { value: "Resumen" } });
    fireEvent.change(panel.getByLabelText("Texto de la nota"), { target: { value: "Primero" } });
    fireEvent.click(panel.getByRole("button", { name: "Guardar nota" }));
    await panel.findByRole("alert");
    fireEvent.change(panel.getByLabelText("Texto de la nota"), { target: { value: "Corregido" } });
    fireEvent.click(panel.getByRole("button", { name: "Guardar nota" }));

    await waitFor(() => expect(repositorio.actualizarMaterial).toHaveBeenCalledOnce());
    const ids = repositorio.agregarMaterial.mock.calls.map(([nuevo]) => nuevo.id);
    expect(new Set(ids).size).toBe(1);
    expect(repositorio.actualizarMaterial).toHaveBeenCalledWith(ids[0], { texto: "Corregido" });
    expect(repositorio.base.materiales).toHaveLength(1);
    expect(repositorio.base.materiales[0]).toMatchObject({ texto: "Corregido" });
  });

  it("avisa antes de mandar una nota de más de 50 KB, contando bytes", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const { main } = await abrirVista("materias", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: new RegExp(`^${MATERIA?.nombre}`) }));
    const panel = within(await screen.findByRole("dialog"));

    fireEvent.click(panel.getByRole("button", { name: "Nota" }));
    fireEvent.change(panel.getByLabelText("Texto de la nota"), {
      target: { value: "ñ".repeat(25601) },
    });
    fireEvent.click(panel.getByRole("button", { name: "Guardar nota" }));

    expect((await panel.findByRole("alert")).textContent).toContain("unos 50 KB");
    expect(repositorio.agregarMaterial).not.toHaveBeenCalled();
  });

  it("un link sin título usa la dirección, recortada al tope del título", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const { main } = await abrirVista("materias", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: new RegExp(`^${MATERIA?.nombre}`) }));
    const panel = within(await screen.findByRole("dialog"));

    fireEvent.click(panel.getByRole("button", { name: "Link" }));
    fireEvent.change(panel.getByLabelText("Dirección del link"), {
      target: { value: `https://ejemplo.com/${"a".repeat(500)}` },
    });
    fireEvent.click(panel.getByRole("button", { name: "Agregar link" }));

    await waitFor(() => expect(repositorio.base.materiales).toHaveLength(1));
    expect(repositorio.base.materiales[0]?.titulo).toHaveLength(200);
  });

  it("recorta el nombre de un archivo al tope del título sin perder la extensión", () => {
    expect(tituloDeArchivo("corto.pdf")).toBe("corto.pdf");
    const largo = tituloDeArchivo(`${"a".repeat(300)}.pdf`);
    expect(largo).toHaveLength(200);
    expect(largo.endsWith(".pdf")).toBe(true);
  });

  it("agrega un link y una nota a la materia, y la nota se puede ver", async () => {
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const { main } = await abrirVista("materias", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: new RegExp(`^${MATERIA?.nombre}`) }));
    const panel = within(await screen.findByRole("dialog"));

    fireEvent.click(panel.getByRole("button", { name: "Link" }));
    fireEvent.change(panel.getByLabelText("Título del link"), { target: { value: "Clase 3" } });
    fireEvent.change(panel.getByLabelText("Dirección del link"), {
      target: { value: "ejemplo.com/clase" },
    });
    fireEvent.click(panel.getByRole("button", { name: "Agregar link" }));
    expect(await panel.findByText("Clase 3")).toBeTruthy();
    expect(repositorio.base.materiales[0]).toMatchObject({
      materiaId: MATERIA?.id,
      url: "https://ejemplo.com/clase",
    });

    fireEvent.click(panel.getByRole("button", { name: "Nota" }));
    fireEvent.change(panel.getByLabelText("Texto de la nota"), { target: { value: " Resumen " } });
    fireEvent.click(panel.getByRole("button", { name: "Guardar nota" }));
    fireEvent.click(await panel.findByRole("button", { name: "Ver" }));
    expect(panel.getByText("Resumen")).toBeTruthy();
  });
});

describe("restaurar materiales de un respaldo, de punta a punta", () => {
  function respaldoCon(materiales: Material[]) {
    const { respaldo } = crearRespaldo(
      { ...PLAN, progreso: [], historial: [] },
      materiales,
      "2026-03-01T00:00:00Z",
    );
    return respaldo;
  }

  async function importar(repositorio: RepositorioFalso, contenido: string) {
    const { main, unmount } = await abrirVista("ajustes", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Importar respaldo" }));
    await elegirArchivoAlCargar(contenido);
    fireEvent.click(
      await main.findByRole("button", { name: /Guardar estos datos|Reemplazar mis datos/ }),
    );
    return { main, unmount };
  }

  it("restaura links, notas y archivos con su materia, y otra vez no duplica", async () => {
    const m = MATERIA?.id ?? null;
    const contenido = JSON.stringify(
      respaldoCon([
        link("clase", "https://x.test/a", { materiaId: m, periodo: "2025-2C" }),
        nota("resumen", { createdAt: "2024-05-05T00:00:00Z" }),
        archivo("apunte.pdf", "application/pdf", SHA, { materiaId: m }),
      ]),
    );
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });

    const primera = await importar(repositorio, contenido);
    const resumen = await primera.main.findByRole("heading", { name: "Materiales" });
    const datos = resumen.closest("[role=status]") as HTMLElement;
    expect(within(datos).getByText("Agregados").closest("div")?.textContent).toContain("3");

    expect(repositorio.base.materiales).toHaveLength(3);
    expect(repositorio.base.materiales.find((x) => x.titulo === "clase")).toMatchObject({
      materiaId: m,
      periodo: "2025-2C",
    });
    expect(repositorio.base.materiales.find((x) => x.titulo === "resumen")?.createdAt).toBe(
      "2024-05-05T00:00:00Z",
    );
    expect(repositorio.registrarDocumento).toHaveBeenCalledWith(
      expect.objectContaining({ sha256: SHA, texto: null }),
    );
    primera.unmount();

    const segunda = await importar(repositorio, contenido);
    await segunda.main.findByText("Omitidos (ya estaban)");
    expect(repositorio.base.materiales).toHaveLength(3);
  });

  it("el archivo restaurado avisa que está en otro dispositivo", async () => {
    const contenido = JSON.stringify(respaldoCon([archivo("apunte.pdf", "application/pdf")]));
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const { main } = await importar(repositorio, contenido);
    fireEvent.click(await main.findByRole("button", { name: "Ir a Inicio" }));
    await waitFor(() => expect(window.location.hash).toBe("#inicio"));
    window.location.hash = "materiales";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    const principal = within(screen.getByRole("main"));
    expect(
      await principal.findByText(/Disponible en el dispositivo donde lo subiste/),
    ).toBeTruthy();
  });

  it("un link javascript: del respaldo se descarta con aviso y no se guarda", async () => {
    const respaldo = respaldoCon([link("bueno", "https://x.test")]);
    const contenido = JSON.stringify({
      ...respaldo,
      materiales: [
        ...respaldo.materiales,
        {
          materia: null,
          titulo: "malo",
          periodo: null,
          createdAt: "2026-01-01T00:00:00Z",
          tipo: "link",
          url: "javascript:alert(1)",
        },
      ],
    });
    const repositorio = repositorioFalso({ inscripciones: [INSCRIPCION] });
    const { main } = await abrirVista("ajustes", <Shell />, repositorio);
    fireEvent.click(await main.findByRole("button", { name: "Importar respaldo" }));
    await elegirArchivoAlCargar(contenido);
    expect(
      await main.findByText(/malo: lo descarté porque su link no es http ni https/),
    ).toBeTruthy();
    fireEvent.click(main.getByRole("button", { name: "Guardar estos datos" }));
    await main.findByText("Omitidos (ya estaban)");
    expect(repositorio.base.materiales.map((m) => m.titulo)).toEqual(["bueno"]);
  });
});
