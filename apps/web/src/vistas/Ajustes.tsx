import type { DatosAlumno, Inscripcion } from "@estudia/core";
import { crearRespaldo } from "@estudia/core/importacion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState, type FormEvent } from "react";
import { ImportarRespaldo } from "../importacion/ImportarRespaldoDiferido";
import { descargarBlob } from "../interfaz/descargar";
import { Icono } from "../interfaz/Iconos";
import { useMaterialesDelAlumno } from "../materiales/useMateriales";
import { PasoElegir, type Opcion } from "../onboarding/Onboarding";
import { ConPlan, clavesPlan, consultas, ponerInscripcionActiva } from "../plan/planActivo";
import { cantidad, etiquetaPlan } from "../plan/presentacion";
import { useCerrarSesion } from "../sesion/CerrarSesion";
import { useRepositorio } from "../sesion/sesion";
import { EncabezadoVista, retardo } from "./comunes";

function SeccionNombre() {
  const repositorio = useRepositorio();
  const clienteQuery = useQueryClient();
  const idNombre = useId();
  const perfil = useQuery(consultas.perfil(repositorio));
  const [editado, setEditado] = useState<string | null>(null);
  const valor = editado ?? perfil.data?.nombre ?? "";
  const guardar = useMutation({
    mutationFn: (nombre: string | null) => repositorio.actualizarPerfil({ nombre }),
    onSuccess: (nuevo) => {
      clienteQuery.setQueryData(clavesPlan.perfil, nuevo);
      setEditado(null);
    },
  });

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    guardar.mutate(valor.trim() || null);
  }

  return (
    <section className="card ajustes-seccion rise" style={retardo(1)}>
      <h2>Tu nombre</h2>
      <form className="ajustes-seccion" onSubmit={alEnviar}>
        <div className="field">
          <label htmlFor={idNombre}>Nombre</label>
          <input
            id={idNombre}
            value={valor}
            autoComplete="name"
            onChange={(e) => setEditado(e.target.value)}
          />
        </div>
        {guardar.error && (
          <p className="msg err" role="alert">
            {guardar.error.message}
          </p>
        )}
        {guardar.isSuccess && editado === null && (
          <p className="msg ok" role="status">
            Guardado.
          </p>
        )}
        <div className="ajustes-acciones">
          <button className="btn primary" type="submit" disabled={guardar.isPending}>
            {guardar.isPending ? "Guardando…" : "Guardar nombre"}
          </button>
        </div>
      </form>
    </section>
  );
}

type PasoPlan = "universidad" | "carrera" | "plan";

const TITULOS_PASO: Record<PasoPlan, string> = {
  universidad: "¿En qué universidad estudiás?",
  carrera: "¿Qué carrera?",
  plan: "¿Qué plan de estudios?",
};

/** Mismos pasos que el onboarding. `activar_plan` deja el nuevo como activo y no borra nada. */
function CambiarPlan({ datos, alCancelar }: { datos: DatosAlumno; alCancelar: () => void }) {
  const repositorio = useRepositorio();
  const clienteQuery = useQueryClient();
  const [paso, setPaso] = useState<PasoPlan>("universidad");
  const [universidadId, setUniversidadId] = useState<string | null>(null);
  const [carreraId, setCarreraId] = useState<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  const universidades = useQuery({
    queryKey: ["catalogo", "universidades"],
    queryFn: () => repositorio.listarUniversidades(),
    select: (lista): Opcion[] =>
      lista.map((u) => ({
        id: u.id,
        titulo: u.nombre,
        detalle: [u.sigla, u.sede].filter(Boolean).join(" · "),
      })),
  });
  const carreras = useQuery({
    queryKey: ["catalogo", "carreras", universidadId],
    queryFn: () => repositorio.listarCarreras(universidadId as string),
    enabled: universidadId !== null,
    select: (lista): Opcion[] =>
      lista.map((c) => ({ id: c.id, titulo: c.nombre, detalle: c.sigla })),
  });
  const planes = useQuery({
    queryKey: ["catalogo", "planes", carreraId],
    queryFn: () => repositorio.listarPlanes(carreraId as string),
    enabled: carreraId !== null,
    select: (lista): Opcion[] =>
      lista.map((p) => ({
        id: p.id,
        titulo: `Plan ${p.version}`,
        detalle: p.id === datos.plan.id ? "Es tu plan actual" : null,
      })),
  });
  const activar = useMutation({
    mutationFn: (id: string) => repositorio.activarPlan(id),
    onSuccess: (inscripcion: Inscripcion) => {
      ponerInscripcionActiva(clienteQuery, inscripcion);
      window.location.hash = "inicio";
    },
  });

  function irA(siguiente: PasoPlan) {
    setPaso(siguiente);
    requestAnimationFrame(() => titulo.current?.focus());
  }

  return (
    <div className="ajustes-seccion">
      <h3 ref={titulo} tabIndex={-1}>
        {TITULOS_PASO[paso]}
      </h3>
      {paso === "universidad" && (
        <PasoElegir
          key={paso}
          consulta={universidades}
          nombre="Universidad"
          vacio="Todavía no hay universidades cargadas."
          valor={universidadId}
          alVolver={alCancelar}
          alSeguir={(id) => {
            if (id !== universidadId) setCarreraId(null);
            setUniversidadId(id);
            irA("carrera");
          }}
        />
      )}
      {paso === "carrera" && (
        <PasoElegir
          key={paso}
          consulta={carreras}
          nombre="Carrera"
          vacio="Esta universidad todavía no tiene carreras cargadas."
          valor={carreraId}
          alVolver={() => irA("universidad")}
          alSeguir={(id) => {
            setCarreraId(id);
            irA("plan");
          }}
        />
      )}
      {paso === "plan" && (
        <PasoElegir
          key={paso}
          consulta={planes}
          nombre="Plan"
          vacio="Esta carrera todavía no tiene planes cargados."
          valor={datos.plan.id}
          textoSeguir="Elegir este plan"
          ocupado={activar.isPending}
          error={activar.error?.message}
          alVolver={() => irA("carrera")}
          alSeguir={(id) => {
            if (id === datos.plan.id) alCancelar();
            else activar.mutate(id);
          }}
        />
      )}
    </div>
  );
}

function SeccionCarrera({ datos }: { datos: DatosAlumno }) {
  const [cambiando, setCambiando] = useState(false);
  return (
    <section className="card ajustes-seccion rise" style={retardo(2)}>
      <h2>Carrera y plan</h2>
      <p className="sub">{etiquetaPlan(datos)}</p>
      {cambiando ? (
        <>
          <p className="sub">
            Lo que cargaste en este plan no se borra: vuelve a aparecer si lo elegís de nuevo.
          </p>
          <CambiarPlan datos={datos} alCancelar={() => setCambiando(false)} />
        </>
      ) : (
        <div className="ajustes-acciones">
          <button className="btn" type="button" onClick={() => setCambiando(true)}>
            Cambiar de carrera o plan
          </button>
        </div>
      )}
    </section>
  );
}

function SeccionRespaldo({ datos }: { datos: DatosAlumno }) {
  const materiales = useMaterialesDelAlumno();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  function descargar() {
    if (!materiales.data) return;
    const ahora = new Date().toISOString();
    const { respaldo, materialesOmitidos } = crearRespaldo(datos, materiales.data, ahora);
    descargarBlob(
      new Blob([JSON.stringify(respaldo, null, 2)], { type: "application/json" }),
      `estudia-respaldo-${ahora.slice(0, 10)}.json`,
    );
    const omitidos = materialesOmitidos.length;
    setMensaje(
      "Respaldo descargado." +
        (omitidos
          ? ` No incluye ${cantidad(omitidos, "material", "materiales")} de otro plan: para respaldarlos, cambiá a ese plan.`
          : ""),
    );
  }

  return (
    <section className="card ajustes-seccion rise" style={retardo(3)}>
      <h2>Respaldo</h2>
      {importando ? (
        <ImportarRespaldo datos={datos} alCancelar={() => setImportando(false)} />
      ) : (
        <>
          <p className="sub">
            Un archivo .json con tus materias, notas, historial, links y notas de estudio. De tus
            archivos guarda solo la referencia, no el contenido.
          </p>
          {materiales.error && !materiales.data && (
            <p className="msg err" role="alert">
              No pude leer tu material: {materiales.error.message}
            </p>
          )}
          {mensaje && (
            <p className="msg ok" role="status">
              {mensaje}
            </p>
          )}
          <div className="ajustes-acciones">
            <button
              className="btn primary"
              type="button"
              disabled={!materiales.data}
              onClick={descargar}
            >
              <Icono nombre="download" />
              Descargar respaldo
            </button>
            <button className="btn" type="button" onClick={() => setImportando(true)}>
              <Icono nombre="upload" />
              Importar respaldo
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function SeccionSesion() {
  const { pedir, dialogo, error } = useCerrarSesion({});
  return (
    <section className="card ajustes-seccion rise" style={retardo(4)}>
      <h2>Sesión</h2>
      <p className="sub">Cierra la sesión solo en este dispositivo.</p>
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
      <div className="ajustes-acciones">
        <button className="btn" type="button" onClick={() => void pedir()}>
          <Icono nombre="logout" />
          Cerrar sesión
        </button>
      </div>
      {dialogo}
    </section>
  );
}

export function Ajustes() {
  return (
    <>
      <EncabezadoVista seccion="Tu cuenta" titulo="Ajustes" />
      <SeccionNombre />
      <ConPlan>
        {(datos) => (
          <>
            <SeccionCarrera datos={datos} />
            <SeccionRespaldo datos={datos} />
          </>
        )}
      </ConPlan>
      <SeccionSesion />
    </>
  );
}
