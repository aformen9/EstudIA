import type { Inscripcion } from "@estudia/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ImportarRespaldo } from "../importacion/ImportarRespaldoDiferido";
import { CapaBrillo } from "../interfaz/Fondo";
import { VISTAS } from "../navegacion/rutas";
import { ConPlan, ErrorDeCarga, ponerInscripcionActiva } from "../plan/planActivo";
import { useRepositorio } from "../sesion/sesion";
import { GrillaRapida } from "./GrillaRapidaDiferida";

export interface Opcion {
  id: string;
  titulo: string;
  detalle?: string | null;
}

interface ConsultaOpciones {
  data: Opcion[] | undefined;
  error: Error | null;
  refetch: () => unknown;
}

export function PasoElegir({
  consulta,
  nombre,
  vacio,
  valor,
  textoSeguir = "Seguir",
  error,
  ocupado = false,
  alSeguir,
  alVolver,
}: {
  consulta: ConsultaOpciones;
  nombre: string;
  vacio: string;
  valor: string | null;
  textoSeguir?: string;
  error?: string | null;
  ocupado?: boolean;
  alSeguir: (id: string) => void;
  alVolver?: () => void;
}) {
  const [marcada, setMarcada] = useState(valor);
  const opciones = consulta.data;

  if (!opciones) {
    if (consulta.error) {
      return (
        <ErrorDeCarga mensaje={consulta.error.message} reintentar={() => consulta.refetch()} />
      );
    }
    return (
      <p className="sub" role="status">
        Cargando…
      </p>
    );
  }

  // Con una sola opción ya viene marcada, pero igual se muestra y hay que confirmarla.
  const unica = opciones.length === 1 ? opciones[0] : undefined;
  const elegida = opciones.some((o) => o.id === marcada) ? marcada : (unica?.id ?? null);

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (elegida && !ocupado) alSeguir(elegida);
  }

  return (
    <form className="opciones" onSubmit={alEnviar}>
      {opciones.length === 0 ? (
        <p className="sub">{vacio}</p>
      ) : (
        <fieldset>
          <legend className="sr-solo">{nombre}</legend>
          {opciones.map((opcion) => (
            <label className="opcion" key={opcion.id}>
              <input
                type="radio"
                name={nombre}
                checked={elegida === opcion.id}
                onChange={() => setMarcada(opcion.id)}
              />
              <span className="opcion-txt">
                <b>{opcion.titulo}</b>
                {opcion.detalle && <small>{opcion.detalle}</small>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {unica && <p className="sub">Por ahora es la única opción: confirmala para seguir.</p>}
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
      <div className="acciones">
        {alVolver && (
          <button className="btn ghost" type="button" onClick={alVolver}>
            Volver
          </button>
        )}
        <button className="btn primary" type="submit" disabled={!elegida || ocupado}>
          {ocupado ? "Guardando…" : textoSeguir}
        </button>
      </div>
    </form>
  );
}

type Paso = "universidad" | "carrera" | "plan" | "camino" | "grilla" | "importar";

const TITULOS: Record<Paso, [numero: number, titulo: string]> = {
  universidad: [1, "¿En qué universidad estudiás?"],
  carrera: [2, "¿Qué carrera?"],
  plan: [3, "¿Qué plan de estudios?"],
  camino: [4, "¿Cómo querés cargar tus materias?"],
  grilla: [4, "Marcá cómo vas en cada materia"],
  importar: [4, "Importá tu respaldo"],
};

function ContenidoPaso({ paso, children }: { paso: Paso; children: ReactNode }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const yaMontado = useRef(false);

  useEffect(() => {
    // Al abrir la vista el foco lo maneja el cascarón; al cambiar de paso, va al título nuevo.
    if (yaMontado.current) titulo.current?.focus({ preventScroll: false });
    yaMontado.current = true;
  }, [paso]);

  const [numero, texto] = TITULOS[paso];
  return (
    <section className="card onboarding rise">
      <CapaBrillo />
      <div className="eyebrow">Paso {numero} de 4</div>
      <h2 ref={titulo} tabIndex={-1}>
        {texto}
      </h2>
      {children}
    </section>
  );
}

/** Universidad → carrera → plan → grilla rápida o importar respaldo. */
export function Onboarding({ alActivarPlan }: { alActivarPlan: () => void }) {
  const repositorio = useRepositorio();
  const clienteQuery = useQueryClient();
  const [paso, setPaso] = useState<Paso>("universidad");
  const [universidadId, setUniversidadId] = useState<string | null>(null);
  const [carreraId, setCarreraId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

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
    enabled: universidadId !== null && paso === "carrera",
    select: (lista): Opcion[] =>
      lista.map((c) => ({ id: c.id, titulo: c.nombre, detalle: c.sigla })),
  });
  const planes = useQuery({
    queryKey: ["catalogo", "planes", carreraId],
    queryFn: () => repositorio.listarPlanes(carreraId as string),
    enabled: carreraId !== null && paso === "plan",
    select: (lista): Opcion[] => lista.map((p) => ({ id: p.id, titulo: `Plan ${p.version}` })),
  });

  const activar = useMutation({
    mutationFn: (id: string) => repositorio.activarPlan(id),
    onSuccess: (inscripcion: Inscripcion) => {
      // Primero avisa: si no, al quedar con inscripción activa el cascarón lo manda a Inicio.
      alActivarPlan();
      ponerInscripcionActiva(clienteQuery, inscripcion);
      setPaso("camino");
    },
  });

  return (
    <>
      <header className="view-h">
        <h1>{VISTAS.onboarding}</h1>
      </header>
      <ContenidoPaso paso={paso}>
        {paso === "universidad" && (
          <PasoElegir
            key={paso}
            consulta={universidades}
            nombre="Universidad"
            vacio="Todavía no hay universidades cargadas."
            valor={universidadId}
            alSeguir={(id) => {
              if (id !== universidadId) {
                setCarreraId(null);
                setPlanId(null);
              }
              setUniversidadId(id);
              setPaso("carrera");
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
            alVolver={() => setPaso("universidad")}
            alSeguir={(id) => {
              if (id !== carreraId) setPlanId(null);
              setCarreraId(id);
              setPaso("plan");
            }}
          />
        )}
        {paso === "plan" && (
          <PasoElegir
            key={paso}
            consulta={planes}
            nombre="Plan"
            vacio="Esta carrera todavía no tiene planes cargados."
            valor={planId}
            textoSeguir="Elegir este plan"
            ocupado={activar.isPending}
            error={activar.error?.message}
            alVolver={() => setPaso("carrera")}
            alSeguir={(id) => {
              setPlanId(id);
              activar.mutate(id);
            }}
          />
        )}
        {paso === "camino" && (
          <div className="caminos">
            <button className="camino" type="button" onClick={() => setPaso("grilla")}>
              <b>Grilla rápida</b>
              <small>Marcás el estado de cada materia, sin notas.</small>
            </button>
            <button className="camino" type="button" onClick={() => setPaso("importar")}>
              <b>Importar respaldo</b>
              <small>Un archivo .json de EstudIA o de Mi Plan de Estudio.</small>
            </button>
          </div>
        )}
        {paso === "grilla" && (
          <ConPlan>
            {(datos) => (
              <GrillaRapida
                datos={datos}
                alVolver={() => setPaso("camino")}
                alTerminar={() => {
                  window.location.hash = "inicio";
                }}
              />
            )}
          </ConPlan>
        )}
        {paso === "importar" && (
          <ConPlan>
            {(datos) => <ImportarRespaldo datos={datos} alCancelar={() => setPaso("camino")} />}
          </ConPlan>
        )}
      </ContenidoPaso>
    </>
  );
}
