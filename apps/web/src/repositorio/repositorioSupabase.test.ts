// @vitest-environment node
import type { BorradorMateriaPropia } from "@estudia/core";
import { describe, expect, it, vi } from "vitest";
import { clienteConFetchFalso, ID_ALUMNO, type PedidoRegistrado } from "../pruebas/clienteFalso";
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
      repositorio.crearMateriaPropia("p", BORRADOR),
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
      repositorio.agregarMaterial({ materiaId: null, titulo: "T", tipo: "nota", texto: "x" }),
      repositorio.borrarMaterial("m"),
      repositorio.reemplazarDatosDelPlan("p", { materiasPropias: [], progreso: [], historial: [] }),
    ];
    const resultados = await Promise.allSettled(llamadas);
    expect(resultados).toHaveLength(19);
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

  it("agregarMaterial relee la fila aparte para traer el documento", async () => {
    const { cliente, pedidos } = clienteConFetchFalso((p) => ({
      cuerpo: p.metodo === "POST" ? { id: "m1" } : FILA_NOTA,
    }));
    const material = await crearRepositorioSupabase(cliente).agregarMaterial({
      materiaId: null,
      titulo: "T",
      tipo: "nota",
      texto: "x",
      periodo: "2025-2C",
      createdAt: "2025-03-01T00:00:00Z",
    });
    expect(pedidos.map((p) => p.metodo)).toEqual(["POST", "GET"]);
    expect(pedidos[0]?.cuerpo).toMatchObject({
      periodo: "2025-2C",
      created_at: "2025-03-01T00:00:00Z",
    });
    expect(pedidos[1]?.url.searchParams.get("id")).toBe("eq.m1");
    expect(pedidos[1]?.url.searchParams.get("select")).toContain("documentos(");
    expect(material.id).toBe("m1");
  });

  it("reemplazarDatosDelPlan manda los datos en camelCase y devuelve las claves", async () => {
    const { cliente, pedidos } = clienteConFetchFalso(() => ({ cuerpo: { X1: "uuid" } }));
    const datos = { materiasPropias: [], progreso: [], historial: [] };
    const claves = await crearRepositorioSupabase(cliente).reemplazarDatosDelPlan("p", datos);
    expect(pedidos[0]?.url.pathname).toBe("/rest/v1/rpc/reemplazar_datos_del_plan");
    expect(pedidos[0]?.cuerpo).toEqual({ plan_id: "p", datos });
    expect(claves).toEqual({ X1: "uuid" });
  });

  it("si fallan las correlativas de una materia nueva, no queda la materia", async () => {
    const { cliente, pedidos } = clienteConFetchFalso((p) => {
      if (esTabla(p, "correlativas")) return { estado: 403, cuerpo: { message: "no permitida" } };
      if (p.metodo === "POST") {
        return {
          cuerpo: {
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
          },
        };
      }
      return { cuerpo: p.metodo === "GET" ? [{ orden: 50 }] : [] };
    });
    await expect(
      crearRepositorioSupabase(cliente).crearMateriaPropia("p", {
        ...BORRADOR,
        correlativas: [{ requiereId: "r", para: "cursar", condicion: "regular" }],
      }),
    ).rejects.toThrow("no permitida");
    const insercion = pedidos.find((p) => p.metodo === "POST" && esTabla(p, "materias"));
    expect(insercion?.cuerpo).toMatchObject({ orden: 51, owner_id: ID_ALUMNO, plan_id: "p" });
    const borrado = pedidos.at(-1);
    expect(borrado?.metodo).toBe("DELETE");
    expect(borrado?.url.searchParams.get("id")).toBe("eq.nueva");
  });
});
