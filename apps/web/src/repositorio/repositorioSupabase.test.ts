// @vitest-environment node
import type { BorradorMateriaPropia } from "@estudia/core";
import { describe, expect, it, vi } from "vitest";
import { clienteConFetchFalso, ID_ALUMNO, type PedidoRegistrado } from "../pruebas/clienteFalso";
import { errorDeLimite, LimiteDeDocumento } from "./limites";
import { crearRepositorioSupabase } from "./repositorioSupabase";

const FILA_NOTA = {
  id: "m1",
  materia_id: null,
  tipo: "nota",
  titulo: "T",
  url: null,
  texto: "x",
  drive_file_id: null,
  visibilidad: "privado",
  anonimo: false,
  periodo: null,
  oculto: false,
  created_at: "2026-01-01T00:00:00+00:00",
  documentos: null,
};

const BORRADOR: BorradorMateriaPropia = {
  codigo: null,
  nombre: "N",
  anio: 1,
  cuatrimestre: null,
  tipo: "Materia",
  area: null,
  requiereAnioCompletoParaCursar: null,
  correlativas: [],
};

function esTabla(pedido: PedidoRegistrado, tabla: string): boolean {
  return pedido.url.pathname === `/rest/v1/${tabla}`;
}

describe("crearRepositorioSupabase", () => {
  it("cada método rechaza con un Error si la operación falla", async () => {
    const { cliente } = clienteConFetchFalso(() => ({
      estado: 500,
      cuerpo: { message: "se rompió", code: "XX000", details: null, hint: null },
    }));
    const repositorio = crearRepositorioSupabase(cliente);
    const llamadas = [
      repositorio.listarUniversidades(),
      repositorio.listarCarreras("u"),
      repositorio.listarPlanes("c"),
      repositorio.obtenerPlanCompleto("p"),
      repositorio.obtenerPerfil(),
      repositorio.actualizarPerfil({ nombre: "N" }),
      repositorio.listarInscripciones(),
      repositorio.activarPlan("p"),
      repositorio.obtenerProgreso("p"),
      repositorio.guardarProgreso({
        materiaId: "m",
        estado: "cursando",
        p1: null,
        p2: null,
        rec: null,
        notaCursada: null,
        notaFinalExamen: null,
        nota: null,
        aplazos: [],
      }),
      repositorio.obtenerHistorial("p"),
      repositorio.crearMateriaPropia("p", BORRADOR, "id-nuevo"),
      repositorio.actualizarMateriaPropia("m", BORRADOR),
      repositorio.borrarMateriaPropia("m"),
      repositorio.listarMateriales(),
      repositorio.registrarDocumento({
        sha256: "h",
        mime: null,
        bytes: null,
        paginas: null,
        texto: null,
      }),
      repositorio.agregarMaterial({
        id: "i",
        materiaId: null,
        titulo: "T",
        tipo: "nota",
        texto: "x",
      }),
      repositorio.moverMaterial("m", null),
      repositorio.borrarMaterial("m"),
      repositorio.reemplazarDatosDelPlan("p", { materiasPropias: [], progreso: [], historial: [] }),
    ];
    const resultados = await Promise.allSettled(llamadas);
    expect(resultados).toHaveLength(20);
    for (const resultado of resultados) {
      expect(resultado.status).toBe("rejected");
      if (resultado.status === "rejected") {
        expect(resultado.reason).toBeInstanceOf(Error);
        expect(resultado.reason.message).toContain("se rompió");
      }
    }
  });

  it("sin sesión rechaza lo que necesita saber quién es el alumno", async () => {
    const { cliente } = clienteConFetchFalso(() => ({ cuerpo: [] }));
    vi.spyOn(cliente.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });
    await expect(crearRepositorioSupabase(cliente).listarMateriales()).rejects.toThrow(
      "Hace falta una sesión",
    );
  });

  it("se limita a los datos propios aunque la RLS le deje más a un admin", async () => {
    const { cliente, pedidos } = clienteConFetchFalso((p) => ({
      cuerpo: esTabla(p, "perfiles")
        ? { id: ID_ALUMNO, nombre: "N", avatar_url: null, es_admin: true }
        : [{ id: "x" }],
    }));
    const repositorio = crearRepositorioSupabase(cliente);

    await repositorio.obtenerPerfil();
    expect(pedidos.at(-1)?.url.searchParams.get("id")).toBe(`eq.${ID_ALUMNO}`);

    pedidos.length = 0;
    await repositorio.borrarMaterial("m");
    await repositorio.borrarMateriaPropia("m");
    await repositorio.actualizarMateriaPropia("m", BORRADOR).catch(() => {});
    expect(pedidos[0]?.url.searchParams.get("user_id")).toBe(`eq.${ID_ALUMNO}`);
    expect(pedidos[1]?.url.searchParams.get("owner_id")).toBe(`eq.${ID_ALUMNO}`);
    expect(pedidos[2]?.url.searchParams.get("owner_id")).toBe(`eq.${ID_ALUMNO}`);
  });

  it("listarMateriales filtra por el alumno", async () => {
    const { cliente, pedidos } = clienteConFetchFalso(() => ({ cuerpo: [FILA_NOTA] }));
    const materiales = await crearRepositorioSupabase(cliente).listarMateriales();
    expect(pedidos[0]?.url.searchParams.get("user_id")).toBe(`eq.${ID_ALUMNO}`);
    expect(materiales).toHaveLength(1);
  });

  it("borrar algo que no existe o no es propio rechaza en vez de hacer de cuenta", async () => {
    const { cliente } = clienteConFetchFalso(() => ({ cuerpo: [] }));
    const repositorio = crearRepositorioSupabase(cliente);
    await expect(repositorio.borrarMaterial("m")).rejects.toThrow("no es tuyo");
    await expect(repositorio.borrarMateriaPropia("m")).rejects.toThrow("no es tuya");
  });

  it("obtenerProgreso y obtenerHistorial filtran por plan", async () => {
    const { cliente, pedidos } = clienteConFetchFalso(() => ({ cuerpo: [] }));
    const repositorio = crearRepositorioSupabase(cliente);
    await repositorio.obtenerProgreso("p1");
    await repositorio.obtenerHistorial("p1");
    expect(pedidos).toHaveLength(2);
    for (const pedido of pedidos) {
      expect(pedido.url.searchParams.get("materias.plan_id")).toBe("eq.p1");
      expect(pedido.url.searchParams.get("select")).toContain("materias!inner(plan_id)");
    }
  });

  it("registrarDocumento arma el Documento con los datos de entrada", async () => {
    const { cliente, pedidos } = clienteConFetchFalso(() => ({ cuerpo: "uuid-doc" }));
    const documento = await crearRepositorioSupabase(cliente).registrarDocumento({
      sha256: "h",
      mime: "application/pdf",
      bytes: 10,
      paginas: 2,
      texto: null,
    });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.url.pathname).toBe("/rest/v1/rpc/registrar_documento");
    expect(documento).toEqual({
      id: "uuid-doc",
      sha256: "h",
      mime: "application/pdf",
      bytes: 10,
      paginas: 2,
    });
  });

  it("agregarMaterial no pisa si el id ya existe, y relee la fila propia para traer el documento", async () => {
    const { cliente, pedidos } = clienteConFetchFalso((p) => ({
      cuerpo: p.metodo === "POST" ? null : [FILA_NOTA],
    }));
    const material = await crearRepositorioSupabase(cliente).agregarMaterial({
      id: "m1",
      materiaId: null,
      titulo: "T",
      tipo: "nota",
      texto: "x",
      periodo: "2025-2C",
      createdAt: "2025-03-01T00:00:00Z",
    });
    expect(pedidos.map((p) => p.metodo)).toEqual(["POST", "GET"]);
    expect(pedidos[0]?.url.searchParams.get("on_conflict")).toBe("id");
    expect(pedidos[0]?.cabeceras.get("Prefer")).toContain("resolution=ignore-duplicates");
    expect(pedidos[0]?.cuerpo).toMatchObject({
      id: "m1",
      periodo: "2025-2C",
      created_at: "2025-03-01T00:00:00Z",
    });
    expect(pedidos[1]?.url.searchParams.get("id")).toBe("eq.m1");
    expect(pedidos[1]?.url.searchParams.get("user_id")).toBe(`eq.${ID_ALUMNO}`);
    expect(pedidos[1]?.url.searchParams.get("select")).toContain("documentos(");
    expect(material.id).toBe("m1");
  });

  it("agregarMaterial rechaza si el id es de otro: no aparece entre los propios", async () => {
    const { cliente } = clienteConFetchFalso((p) => ({ cuerpo: p.metodo === "POST" ? null : [] }));
    await expect(
      crearRepositorioSupabase(cliente).agregarMaterial({
        id: "ajeno",
        materiaId: null,
        titulo: "T",
        tipo: "nota",
        texto: "x",
      }),
    ).rejects.toThrow("No se pudo guardar el material");
  });

  it("moverMaterial filtra por el alumno, manda null para sin materia y rechaza si no es suyo", async () => {
    const { cliente, pedidos } = clienteConFetchFalso(() => ({ cuerpo: [FILA_NOTA] }));
    const movido = await crearRepositorioSupabase(cliente).moverMaterial("m1", null);
    expect(movido.id).toBe("m1");
    expect(pedidos[0]?.metodo).toBe("PATCH");
    expect(pedidos[0]?.cuerpo).toEqual({ materia_id: null });
    expect(pedidos[0]?.url.searchParams.get("user_id")).toBe(`eq.${ID_ALUMNO}`);

    const vacio = clienteConFetchFalso(() => ({ cuerpo: [] }));
    await expect(
      crearRepositorioSupabase(vacio.cliente).moverMaterial("ajeno", "ma"),
    ).rejects.toThrow("no es tuyo");
  });

  it.each([
    ["EQ001", "demasiado texto"],
    ["EQ002", "límite de espacio de tu cuenta"],
    ["EQ003", "más de 50 MB"],
    ["EQ004", "tipo de archivo"],
  ] as const)("registrarDocumento traduce %s y no habla de la conexión", async (codigo, texto) => {
    const { cliente } = clienteConFetchFalso(() => ({
      estado: 400,
      cuerpo: { code: codigo, message: "texto interno", details: null, hint: null },
    }));
    const fallo = await crearRepositorioSupabase(cliente)
      .registrarDocumento({ sha256: "h", mime: null, bytes: 1, paginas: null, texto: null })
      .catch((error: unknown) => error);
    expect(fallo).toBeInstanceOf(LimiteDeDocumento);
    expect((fallo as LimiteDeDocumento).codigo).toBe(codigo);
    expect((fallo as LimiteDeDocumento).message).toContain(texto);
    expect((fallo as LimiteDeDocumento).message).not.toContain("texto interno");
    expect((fallo as LimiteDeDocumento).message.toLowerCase()).not.toContain("conexión");
  });

  it("registrarDocumento: otro error sigue siendo un error común", async () => {
    const { cliente } = clienteConFetchFalso(() => ({
      estado: 500,
      cuerpo: { code: "XX000", message: "se rompió", details: null, hint: null },
    }));
    const fallo = await crearRepositorioSupabase(cliente)
      .registrarDocumento({ sha256: "h", mime: null, bytes: 1, paginas: null, texto: null })
      .catch((error: unknown) => error);
    expect(fallo).not.toBeInstanceOf(LimiteDeDocumento);
    expect((fallo as Error).message).toContain("se rompió");
  });

  it("reemplazarDatosDelPlan manda los datos en camelCase y devuelve las claves", async () => {
    const { cliente, pedidos } = clienteConFetchFalso(() => ({ cuerpo: { X1: "uuid" } }));
    const datos = { materiasPropias: [], progreso: [], historial: [] };
    const claves = await crearRepositorioSupabase(cliente).reemplazarDatosDelPlan("p", datos);
    expect(pedidos[0]?.url.pathname).toBe("/rest/v1/rpc/reemplazar_datos_del_plan");
    expect(pedidos[0]?.cuerpo).toEqual({ plan_id: "p", datos });
    expect(claves).toEqual({ X1: "uuid" });
  });

  const FILA_MATERIA = {
    id: "nueva",
    plan_id: "p",
    codigo: null,
    nombre: "N",
    anio: 1,
    cuatrimestre: null,
    tipo: "Materia",
    area: null,
    requiere_anio_completo_para_cursar: null,
    owner_id: ID_ALUMNO,
    orden: 51,
  };

  it("crearMateriaPropia usa la RPC, todo en un pedido y sin borrado compensatorio", async () => {
    const { cliente, pedidos } = clienteConFetchFalso(() => ({ cuerpo: FILA_MATERIA }));
    const creada = await crearRepositorioSupabase(cliente).crearMateriaPropia(
      "p",
      {
        ...BORRADOR,
        correlativas: [{ requiereId: "r", para: "cursar", condicion: "regular" }],
      },
      "nueva",
    );
    expect(creada.id).toBe("nueva");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.url.pathname).toBe("/rest/v1/rpc/crear_materia_propia");
    expect(pedidos[0]?.cuerpo).toMatchObject({
      id: "nueva",
      plan_id: "p",
      materia: { nombre: "N", requiereAnioCompletoParaCursar: null },
      correlativas: [{ requiere: "r", para: "cursar", condicion: "regular" }],
    });
  });

  it("crearMateriaPropia rechaza si la fila que volvió es de otro plan", async () => {
    const { cliente } = clienteConFetchFalso(() => ({
      cuerpo: { ...FILA_MATERIA, plan_id: "otro" },
    }));
    await expect(
      crearRepositorioSupabase(cliente).crearMateriaPropia("p", BORRADOR, "nueva"),
    ).rejects.toThrow("otro plan");
  });
});

describe("los topes de materiales", () => {
  it.each([
    ["materiales_titulo_largo", "título demasiado largo"],
    ["materiales_url_largo", "link demasiado largo"],
    ["materiales_texto_largo", "nota demasiado larga"],
  ])("%s se explica al alumno", (restriccion, texto) => {
    const limite = errorDeLimite({
      code: "23514",
      message: `new row for relation "materiales" violates check constraint "${restriccion}"`,
    });
    expect(limite?.message).toContain(texto);
  });

  it("otro CHECK no es un límite", () => {
    expect(
      errorDeLimite({ code: "23514", message: 'violates check constraint "otra"' }),
    ).toBeNull();
  });
});
