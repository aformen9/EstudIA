/**
 * Prueba el Repositorio de verdad contra el stack local. Ver vitest.integracion.config.ts:
 * no corre con `pnpm test` y al terminar hay que hacer `supabase db reset`.
 */
import {
  conteoPorEstado,
  nuevoMaterialDesde,
  type DatosAlumno,
  type NuevoDocumento,
  type Plan,
  type PlanCompleto,
  type Repositorio,
} from "@estudia/core";
import { agregarOCorregirMaterial } from "@estudia/core";
import { importarLegacy } from "@estudia/core/importacion";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  conIndicador,
  crearAlmacenGuardado,
  TiempoDeGuardadoAgotado,
} from "../guardado/almacenGuardado";
import { EMAIL_DE_PRUEBA, entrarConUsuarioDePrueba, urlEsLocal } from "../sesion/loginDePrueba";
import { LimiteDeDocumento } from "./limites";
import { crearRepositorioSupabase } from "./repositorioSupabase";

const RAIZ_WEB = resolve(import.meta.dirname, "../..");
const entorno = loadEnv("development", RAIZ_WEB, "VITE_");
const URL_SUPABASE = entorno.VITE_SUPABASE_URL ?? "";
const CLAVE = entorno.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

function clienteNuevo(): SupabaseClient {
  return createClient(URL_SUPABASE, CLAVE, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Un alumno distinto por corrida, para probar que no se ven datos entre cuentas. */
async function otroAlumno(): Promise<Repositorio> {
  const cliente = clienteNuevo();
  const { error } = await cliente.auth.signUp({
    email: `otro.${crypto.randomUUID()}@estudia.test`,
    password: "otro-usuario-inventado",
  });
  if (error) throw error;
  return crearRepositorioSupabase(cliente);
}

describe("Repositorio contra Supabase local", () => {
  let cliente: SupabaseClient;
  let repositorio: Repositorio;
  let plan: Plan;
  let completo: PlanCompleto;

  function materiaPorCodigo(codigo: string) {
    const materia = completo.materias.find((m) => m.codigo === codigo);
    if (!materia) throw new Error(`Falta ${codigo}`);
    return materia;
  }

  beforeAll(async () => {
    if (!urlEsLocal(URL_SUPABASE)) throw new Error("Esta prueba solo corre contra Supabase local.");
    cliente = clienteNuevo();
    repositorio = crearRepositorioSupabase(cliente);
  });

  it("el login de prueba crea o reutiliza el usuario inventado", async () => {
    await entrarConUsuarioDePrueba(cliente, URL_SUPABASE);
    const { data } = await cliente.auth.getSession();
    expect(data.session?.user.email).toBe(EMAIL_DE_PRUEBA);
    // La segunda vez entra, no da de alta.
    await entrarConUsuarioDePrueba(cliente, URL_SUPABASE);
  });

  it("el login de prueba se niega fuera de local", async () => {
    await expect(entrarConUsuarioDePrueba(cliente, "https://abc.supabase.co")).rejects.toThrow(
      "solo funciona contra Supabase local",
    );
  });

  it("obtenerPerfil y actualizarPerfil", async () => {
    const perfil = await repositorio.obtenerPerfil();
    expect(perfil.esAdmin).toBe(false);
    const cambiado = await repositorio.actualizarPerfil({ nombre: "Otro Nombre" });
    expect(cambiado.nombre).toBe("Otro Nombre");
    await repositorio.actualizarPerfil({ nombre: "Alumno de Prueba" });
  });

  it("lista universidad → carrera → plan", async () => {
    const universidades = await repositorio.listarUniversidades();
    const uca = universidades.find((u) => u.sigla === "UCA");
    expect(uca?.estado).toBe("publicado");

    const carreras = await repositorio.listarCarreras(uca?.id ?? "");
    const lcd = carreras.find((c) => c.sigla === "LCD");
    expect(lcd?.universidadId).toBe(uca?.id);

    const planes = await repositorio.listarPlanes(lcd?.id ?? "");
    const p7023 = planes.find((p) => p.version === "7023");
    if (!p7023) throw new Error("Falta el plan 7023");
    plan = p7023;
    expect(plan).toMatchObject({ notaMin: 1, notaMax: 10, notaAprobacion: 4 });
    expect(plan.cierreCuatrimestres).toHaveLength(2);
  });

  it("obtenerPlanCompleto: 50 materias, 88 correlativas, siglas UCA y LCD", async () => {
    completo = await repositorio.obtenerPlanCompleto(plan.id);
    expect(completo.materias).toHaveLength(50);
    expect(completo.correlativas).toHaveLength(88);
    expect(completo.universidadSigla).toBe("UCA");
    expect(completo.carreraSigla).toBe("LCD");
    expect(completo.correlativas[0]).not.toHaveProperty("materias");
  });

  it("guardarProgreso sin inscripción rechaza: lo frena la RLS", async () => {
    const otro = await otroAlumno();
    await expect(
      otro.guardarProgreso({
        materiaId: materiaPorCodigo("GMA1234").id,
        estado: "cursando",
        p1: null,
        p2: null,
        rec: null,
        notaCursada: null,
        notaFinalExamen: null,
        nota: null,
        aplazos: [],
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("activarPlan y listarInscripciones", async () => {
    const inscripcion = await repositorio.activarPlan(plan.id);
    expect(inscripcion).toMatchObject({ planId: plan.id, activa: true });
    expect(await repositorio.listarInscripciones()).toEqual([inscripcion]);
    // Activar dos veces no duplica.
    expect(await repositorio.activarPlan(plan.id)).toEqual(inscripcion);
  });

  it("guardarProgreso + obtenerProgreso, también al pisar y con decimales", async () => {
    const progreso = {
      materiaId: materiaPorCodigo("GMA1234").id,
      estado: "final" as const,
      p1: 7.5,
      p2: 4,
      rec: null,
      notaCursada: 6,
      notaFinalExamen: null,
      nota: null,
      aplazos: [2, 3],
    };
    await repositorio.guardarProgreso(progreso);
    expect(await repositorio.obtenerProgreso(plan.id)).toEqual([progreso]);

    const aprobada = { ...progreso, estado: "aprobada" as const, nota: 8, notaFinalExamen: 8 };
    await repositorio.guardarProgreso(aprobada);
    expect(await repositorio.obtenerProgreso(plan.id)).toEqual([aprobada]);
  });

  it("registrarDocumento + agregarMaterial + listarMateriales", async () => {
    const sha256 = "a".repeat(63) + "1";
    const documento = await repositorio.registrarDocumento({
      sha256,
      mime: "application/pdf",
      bytes: 1234,
      paginas: 3,
      texto: null,
    });
    expect(documento).toMatchObject({ sha256, mime: "application/pdf", bytes: 1234, paginas: 3 });

    const materiaId = materiaPorCodigo("GMA1234").id;
    const archivo = await repositorio.agregarMaterial({
      id: crypto.randomUUID(),
      tipo: "archivo",
      materiaId,
      titulo: "Apunte",
      documentoId: documento.id,
    });
    expect(archivo).toMatchObject({ tipo: "archivo", documento, driveFileId: null, materiaId });

    const link = await repositorio.agregarMaterial({
      id: crypto.randomUUID(),
      tipo: "link",
      materiaId: null,
      titulo: "Link",
      url: "https://ejemplo.test",
      periodo: "2025-2C",
      createdAt: "2025-03-01T12:00:00+00:00",
    });
    expect(link).toMatchObject({ tipo: "link", periodo: "2025-2C", materiaId: null });
    expect(new Date(link.createdAt).toISOString()).toBe("2025-03-01T12:00:00.000Z");

    const nota = await repositorio.agregarMaterial({
      id: crypto.randomUUID(),
      tipo: "nota",
      materiaId,
      titulo: "Nota",
      texto: "Texto de la nota",
    });
    expect(nota).toMatchObject({
      tipo: "nota",
      texto: "Texto de la nota",
      visibilidad: "privado",
      anonimo: false,
      oculto: false,
      periodo: null,
    });

    const materiales = await repositorio.listarMateriales();
    expect(materiales.map((m) => m.id).sort()).toEqual([archivo.id, link.id, nota.id].sort());
    expect(materiales.find((m) => m.id === archivo.id)).toEqual(archivo);
    // El más viejo primero.
    expect(materiales[0]?.id).toBe(link.id);

    const otro = await otroAlumno();
    expect(await otro.listarMateriales()).toEqual([]);
    await expect(otro.borrarMaterial(nota.id)).rejects.toThrow("no es tuyo");

    await repositorio.borrarMaterial(nota.id);
    expect((await repositorio.listarMateriales()).map((m) => m.id)).not.toContain(nota.id);
  });

  it("materias propias: crear, actualizar correlativas y borrar", async () => {
    const a = materiaPorCodigo("GMA1234").id;
    const b = materiaPorCodigo("GCO0406").id;
    const borrador = {
      codigo: "OPT1",
      nombre: "Optativa",
      anio: 3,
      cuatrimestre: 1,
      tipo: "Materia",
      area: null,
      requiereAnioCompletoParaCursar: null,
      correlativas: [{ requiereId: a, para: "cursar" as const, condicion: "regular" as const }],
    };
    const propia = await repositorio.crearMateriaPropia(plan.id, borrador, crypto.randomUUID());
    expect(propia.orden).toBeGreaterThan(50);
    expect(propia.ownerId).toBeTruthy();

    const correlativasDe = async () =>
      (await repositorio.obtenerPlanCompleto(plan.id)).correlativas
        .filter((c) => c.materiaId === propia.id)
        .map((c) => [c.requiereId, c.para, c.condicion]);
    expect(await correlativasDe()).toEqual([[a, "cursar", "regular"]]);

    const actualizada = await repositorio.actualizarMateriaPropia(propia.id, {
      ...borrador,
      nombre: "Optativa 2",
      correlativas: [{ requiereId: b, para: "rendir", condicion: "aprobada" }],
    });
    expect(actualizada.nombre).toBe("Optativa 2");
    expect(await correlativasDe()).toEqual([[b, "rendir", "aprobada"]]);

    await repositorio.actualizarMateriaPropia(propia.id, { ...borrador, correlativas: [] });
    expect(await correlativasDe()).toEqual([]);

    const otro = await otroAlumno();
    await expect(otro.borrarMateriaPropia(propia.id)).rejects.toThrow("no es tuya");
    await expect(otro.actualizarMateriaPropia(propia.id, borrador)).rejects.toBeInstanceOf(Error);
    expect((await otro.obtenerPlanCompleto(plan.id)).materias).toHaveLength(50);
    // Tampoco una del catálogo, aunque el método reciba su id.
    await expect(repositorio.borrarMateriaPropia(a)).rejects.toThrow("no es tuya");

    await repositorio.borrarMateriaPropia(propia.id);
    expect((await repositorio.obtenerPlanCompleto(plan.id)).materias).toHaveLength(50);
  });

  it("un reintento después de un timeout no duplica materia ni material", async () => {
    // Con tiempo máximo 0 el cliente da por perdida la escritura, pero el pedido llega igual.
    const conTimeout = conIndicador(repositorio, crearAlmacenGuardado(), 0);
    const idMateria = crypto.randomUUID();
    const borrador = {
      codigo: null,
      nombre: "Materia del reintento",
      anio: 3,
      cuatrimestre: 1,
      tipo: "Materia",
      area: null,
      requiereAnioCompletoParaCursar: null,
      correlativas: [
        {
          requiereId: materiaPorCodigo("GMA1234").id,
          para: "cursar" as const,
          condicion: "regular" as const,
        },
      ],
    };
    await expect(
      conTimeout.crearMateriaPropia(plan.id, borrador, idMateria),
    ).rejects.toBeInstanceOf(TiempoDeGuardadoAgotado);
    const materia = await repositorio.crearMateriaPropia(plan.id, borrador, idMateria);
    expect(materia.id).toBe(idMateria);
    // El reintento devuelve la fila tal como está, sin pisarla.
    const otraVez = await repositorio.crearMateriaPropia(
      plan.id,
      { ...borrador, nombre: "No pisa" },
      idMateria,
    );
    expect(otraVez.nombre).toBe("Materia del reintento");
    const leido = await repositorio.obtenerPlanCompleto(plan.id);
    expect(leido.materias.filter((m) => m.id === idMateria)).toHaveLength(1);
    expect(leido.correlativas.filter((c) => c.materiaId === idMateria)).toHaveLength(1);

    const nuevo = {
      id: crypto.randomUUID(),
      tipo: "nota" as const,
      materiaId: idMateria,
      titulo: "Nota del reintento",
      texto: "x",
    };
    await expect(conTimeout.agregarMaterial(nuevo)).rejects.toBeInstanceOf(TiempoDeGuardadoAgotado);
    const material = await repositorio.agregarMaterial(nuevo);
    expect(material.id).toBe(nuevo.id);
    await repositorio.agregarMaterial(nuevo);
    const todos = await repositorio.listarMateriales();
    expect(todos.filter((m) => m.titulo === "Nota del reintento")).toHaveLength(1);

    // El mismo id en manos de otro alumno rechaza: no devuelve ni pisa lo ajeno.
    const otro = await otroAlumno();
    await expect(otro.agregarMaterial({ ...nuevo, titulo: "Ajeno" })).rejects.toThrow(
      "No se pudo guardar el material",
    );
    await expect(otro.crearMateriaPropia(plan.id, borrador, idMateria)).rejects.toThrow(
      "No se pudo crear la materia",
    );
    expect((await repositorio.listarMateriales()).find((m) => m.id === nuevo.id)?.titulo).toBe(
      "Nota del reintento",
    );

    await repositorio.borrarMateriaPropia(idMateria);
    await repositorio.borrarMaterial(nuevo.id);
  });

  it("moverMaterial: cambia la materia, permite sin materia y un compartido pasa a privado", async () => {
    const a = materiaPorCodigo("GMA1234").id;
    const b = materiaPorCodigo("GCO0406").id;
    const material = await repositorio.agregarMaterial({
      id: crypto.randomUUID(),
      tipo: "nota",
      materiaId: a,
      titulo: "Para mover",
      texto: "x",
    });
    const { error } = await cliente
      .from("materiales")
      .update({ visibilidad: "compartido" })
      .eq("id", material.id);
    expect(error).toBeNull();

    const movido = await repositorio.moverMaterial(material.id, b);
    expect(movido).toMatchObject({ materiaId: b, visibilidad: "privado" });
    expect(await repositorio.moverMaterial(material.id, null)).toMatchObject({ materiaId: null });

    const otro = await otroAlumno();
    await expect(otro.moverMaterial(material.id, a)).rejects.toThrow("no es tuyo");
    await repositorio.borrarMaterial(material.id);
  });

  it("agregar otra referencia al mismo documento no duplica el documento", async () => {
    const a = materiaPorCodigo("GMA1234").id;
    const b = materiaPorCodigo("GCO0406").id;
    const documento = await repositorio.registrarDocumento({
      sha256: "c".repeat(64),
      mime: "application/pdf",
      bytes: 10,
      paginas: null,
      texto: null,
    });
    const original = await repositorio.agregarMaterial({
      id: crypto.randomUUID(),
      tipo: "archivo",
      materiaId: a,
      titulo: "Apunte compartido",
      documentoId: documento.id,
    });
    const copia = await repositorio.agregarMaterial(
      nuevoMaterialDesde(original, b, crypto.randomUUID()),
    );
    expect(copia).toMatchObject({ materiaId: b, tipo: "archivo", documento: { id: documento.id } });
    expect(copia.id).not.toBe(original.id);
    await repositorio.borrarMaterial(original.id);
    await repositorio.borrarMaterial(copia.id);
  });

  it("registrar_documento: los cuatro límites llegan como EQ y se explican", async () => {
    const alumno = await otroAlumno();
    const sha = (n: number) => n.toString(16).padStart(64, "0");
    const intentar = (documento: Partial<NuevoDocumento>) =>
      alumno
        .registrarDocumento({
          sha256: sha(1),
          mime: null,
          bytes: null,
          paginas: null,
          texto: null,
          ...documento,
        })
        .catch((error: unknown) => error);

    const esperar = (fallo: unknown, codigo: string) => {
      expect(fallo).toBeInstanceOf(LimiteDeDocumento);
      expect((fallo as LimiteDeDocumento).codigo).toBe(codigo);
    };
    esperar(await intentar({ texto: "a ".repeat(1_100_000) }), "EQ001");
    esperar(await intentar({ bytes: 50 * 1024 * 1024 + 1 }), "EQ003");
    esperar(await intentar({ mime: "x".repeat(256) }), "EQ004");

    // Cuota de unos 50 MB: 25 documentos de 2 MB de texto la dejan casi llena, y el siguiente no entra.
    const texto = "a ".repeat(1_048_000);
    for (let n = 2; n < 27; n += 1) {
      const resultado = await intentar({ sha256: sha(n + 1_000), texto });
      expect(resultado).not.toBeInstanceOf(Error);
    }
    esperar(await intentar({ sha256: sha(9_999), texto }), "EQ002");
  }, 120_000);

  it("reemplazarDatosDelPlan con el caso legacy, y obtenerHistorial", async () => {
    const legacy: unknown = JSON.parse(
      readFileSync(resolve(RAIZ_WEB, "../../fixtures/caso-prueba-legacy.json"), "utf8"),
    );
    const importado = importarLegacy(legacy, completo);
    if (!importado.ok) throw new Error(importado.error);

    const claves = await repositorio.reemplazarDatosDelPlan(plan.id, importado.datos);
    expect(Object.keys(claves)).toHaveLength(importado.datos.materiasPropias.length);

    const datos: DatosAlumno = {
      ...(await repositorio.obtenerPlanCompleto(plan.id)),
      progreso: await repositorio.obtenerProgreso(plan.id),
      historial: await repositorio.obtenerHistorial(plan.id),
    };
    expect(conteoPorEstado(datos)).toEqual({
      aprobada: 26,
      cursando: 5,
      final: 2,
      pendiente: 17,
    });
    expect(datos.historial).toHaveLength(importado.datos.historial.length);
    expect(datos.historial.map((h) => h.fecha)).toEqual(datos.historial.map((h) => h.fecha).sort());
    expect(
      datos.progreso.find((p) => p.materiaId === materiaPorCodigo("GMA1234").id)?.aplazos,
    ).toEqual([2]);
  });

  it("los topes de materiales se rechazan en la base y se explican", async () => {
    const intentar = (nuevo: Parameters<typeof repositorio.agregarMaterial>[0]) =>
      repositorio.agregarMaterial(nuevo).catch((error: unknown) => error);
    const largoTitulo = await intentar({
      id: crypto.randomUUID(),
      tipo: "link",
      materiaId: null,
      titulo: "t".repeat(201),
      url: "https://ejemplo.test",
    });
    expect((largoTitulo as LimiteDeDocumento).codigo).toBe("materiales_titulo_largo");
    const largoLink = await intentar({
      id: crypto.randomUUID(),
      tipo: "link",
      materiaId: null,
      titulo: "Largo",
      url: `https://ejemplo.test/${"u".repeat(2048)}`,
    });
    expect((largoLink as LimiteDeDocumento).codigo).toBe("materiales_url_largo");
    const largaNota = await intentar({
      id: crypto.randomUUID(),
      tipo: "nota",
      materiaId: null,
      titulo: "Larga",
      texto: "ñ".repeat(25601),
    });
    expect((largaNota as LimiteDeDocumento).codigo).toBe("materiales_texto_largo");
  });

  it("corregir un link después de un timeout: mismo id, sin duplicar", async () => {
    const id = crypto.randomUUID();
    const nuevo = {
      id,
      tipo: "link" as const,
      materiaId: null,
      titulo: "Primero",
      url: "https://ejemplo.test/primero",
    };
    await repositorio.agregarMaterial(nuevo);
    const corregido = await agregarOCorregirMaterial(repositorio, {
      ...nuevo,
      titulo: "Corregido",
      url: "https://ejemplo.test/corregido",
    });
    expect(corregido).toMatchObject({
      id,
      titulo: "Corregido",
      url: "https://ejemplo.test/corregido",
    });
    const iguales = (await repositorio.listarMateriales()).filter((m) => m.id === id);
    expect(iguales).toHaveLength(1);
  });
});
