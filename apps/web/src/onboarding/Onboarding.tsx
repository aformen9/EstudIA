import { planVigente, type Inscripcion, type Plan } from "@estudia/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ImportarRespaldo } from "../importacion/ImportarRespaldoDiferido";
import { Dialogo } from "../interfaz/Dialogo";
import { Icono } from "../interfaz/Iconos";
import { useTema } from "../interfaz/tema";
import { useReportar } from "../reportes/Reportar";
import { VISTAS } from "../navegacion/rutas";
import { ConPlan, ErrorDeCarga, ponerInscripcionActiva } from "../plan/planActivo";
import { useCerrarSesion } from "../sesion/CerrarSesion";
import { useRepositorio } from "../sesion/sesion";
import { GrillaRapida } from "./GrillaRapidaDiferida";

export interface Opcion {
  id: string;
  titulo: string;
  detalle?: string | null;
  /** Una marca al lado del título, como "Vigente". */
  marca?: string | null;
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
  ayuda,
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
  /** Un texto debajo de las opciones. */
  ayuda?: string | null;
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
                <b>
                  {opcion.titulo}
                  {opcion.marca && <span className="badge-m">{opcion.marca}</span>}
                </b>
                {opcion.detalle && <small>{opcion.detalle}</small>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {unica && !ayuda && (
        <p className="sub">Por ahora es la única opción: confirmala para seguir.</p>
      )}
      {ayuda && <p className="ayuda-m">{ayuda}</p>}
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

type Paso = "universidad" | "carrera" | "plan" | "carga";
type Carga = "camino" | "grilla" | "importar";

const TITULOS: Record<Paso | Carga, string> = {
  universidad: "¿En qué universidad estudiás?",
  carrera: "¿Qué carrera?",
  plan: "¿Qué plan de estudios?",
  carga: "¿Cómo querés cargar tus materias?",
  camino: "¿Cómo querés cargar tus materias?",
  grilla: "Marcá cómo vas en cada materia",
  importar: "Importá tu respaldo de EstudIA",
};

const NOMBRE_PASO: Record<Paso, string> = {
  universidad: "Universidad",
  carrera: "Carrera",
  plan: "Plan",
  carga: "Tus materias",
};

function LineaDePasos({
  pasos,
  actual,
  resumen,
  alIr,
}: {
  pasos: Paso[];
  actual: Paso;
  resumen: Partial<Record<Paso, string>>;
  alIr: (paso: Paso) => void;
}) {
  const indiceActual = pasos.indexOf(actual);
  return (
    <ol className="pasos" style={{ gridTemplateColumns: `repeat(${pasos.length}, 1fr)` }}>
      {pasos.map((paso, i) => {
        const estado = i < indiceActual ? "hecho" : i === indiceActual ? "actual" : "futuro";
        return (
          <li key={paso} className={estado}>
            <button
              type="button"
              className="paso"
              disabled={estado !== "hecho"}
              aria-current={estado === "actual" ? "step" : undefined}
              aria-label={estado === "hecho" ? `Volver a ${NOMBRE_PASO[paso]}` : undefined}
              onClick={() => alIr(paso)}
            >
              <i aria-hidden="true">{estado === "hecho" ? <Icono nombre="check" /> : i + 1}</i>
              <b>{NOMBRE_PASO[paso]}</b>
              <small>{estado === "hecho" ? (resumen[paso] ?? " ") : " "}</small>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function BarraOnboarding({ alVolver }: { alVolver: (() => void) | null }) {
  const { tema, alternar } = useTema();
  const boton = useRef<HTMLButtonElement>(null);
  const { pedir, dialogo, error } = useCerrarSesion({
    preguntarSoloConArchivos: true,
    devolverFocoA: boton,
  });
  const botonReportar = useRef<HTMLButtonElement>(null);
  const reportar = useReportar({ vista: "onboarding", devolverFocoA: botonReportar });
  return (
    <div className="ob-top">
      {alVolver ? (
        <button className="btn-sin" type="button" onClick={alVolver}>
          <Icono nombre="chev-left" />
          Paso anterior
        </button>
      ) : (
        <span />
      )}
      <span className="ob-der">
        <button
          className="icon-btn"
          type="button"
          aria-label={tema === "dark" ? "Pasar a modo claro" : "Pasar a modo oscuro"}
          onClick={alternar}
        >
          <Icono nombre={tema === "dark" ? "sun" : "moon"} />
        </button>
        <button
          className="icon-btn"
          type="button"
          ref={botonReportar}
          aria-label="Reportar un problema o sugerencia"
          title="Reportar un problema"
          onClick={reportar.abrir}
        >
          <Icono nombre="mensaje" />
        </button>
        <button className="btn-sin" type="button" ref={boton} onClick={() => void pedir()}>
          <Icono nombre="logout" />
          Cerrar sesión
        </button>
      </span>
      {reportar.dialogo}
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
      {dialogo}
    </div>
  );
}

/**
 * Universidad → carrera → plan → cómo cargar las materias, en un modal centrado. Si la carrera tiene un
 * solo plan, ese paso se saltea. Se puede volver a cualquier paso anterior, con el plan ya activado:
 * otro plan se activa recién al confirmarlo, y lo cargado queda guardado en el anterior.
 */
export function Onboarding({ alActivarPlan }: { alActivarPlan: () => void }) {
  const repositorio = useRepositorio();
  const clienteQuery = useQueryClient();
  const idTitulo = useId();
  const titulo = useRef<HTMLHeadingElement>(null);
  const [paso, setPaso] = useState<Paso>("universidad");
  const [carga, setCarga] = useState<Carga>("camino");
  const [universidadId, setUniversidadId] = useState<string | null>(null);
  const [carreraId, setCarreraId] = useState<string | null>(null);
  const [planActivoId, setPlanActivoId] = useState<string | null>(null);
  const [errorCarrera, setErrorCarrera] = useState<string | null>(null);
  const [pedidoVolver, setPedidoVolver] = useState(0);
  // A dónde ir cuando la grilla termine de guardar y deje volver.
  const destinoAlSalirDeLaGrilla = useRef<Paso | null>(null);
  const yaMontado = useRef(false);

  useEffect(() => {
    // Al cambiar de paso, el foco va al título nuevo.
    if (yaMontado.current) titulo.current?.focus({ preventScroll: false });
    yaMontado.current = true;
  }, [paso, carga]);

  const universidades = useQuery({
    queryKey: ["catalogo", "universidades"],
    queryFn: () => repositorio.listarUniversidades(),
  });
  const carreras = useQuery({
    queryKey: ["catalogo", "carreras", universidadId],
    queryFn: () => repositorio.listarCarreras(universidadId as string),
    enabled: universidadId !== null,
  });
  const consultaPlanes = (id: string) => ({
    queryKey: ["catalogo", "planes", id],
    queryFn: () => repositorio.listarPlanes(id),
  });
  const planes = useQuery({
    ...consultaPlanes(carreraId ?? ""),
    enabled: carreraId !== null,
  });

  const activar = useMutation({
    mutationFn: (id: string) => repositorio.activarPlan(id),
    onSuccess: (inscripcion: Inscripcion) => {
      // Primero avisa: si no, al quedar con inscripción activa el cascarón lo manda a Inicio.
      alActivarPlan();
      ponerInscripcionActiva(clienteQuery, inscripcion);
      setPlanActivoId(inscripcion.planId);
      setCarga("camino");
      setPaso("carga");
    },
  });

  function activarPlan(id: string) {
    if (id === planActivoId) {
      setCarga("camino");
      setPaso("carga");
      return;
    }
    activar.mutate(id);
  }

  async function elegirCarrera(id: string) {
    setCarreraId(id);
    setErrorCarrera(null);
    try {
      const lista = await clienteQuery.fetchQuery(consultaPlanes(id));
      const unico = lista.length === 1 ? lista[0] : undefined;
      if (unico) activarPlan(unico.id);
      else setPaso("plan");
    } catch (error) {
      setErrorCarrera(error instanceof Error ? error.message : String(error));
    }
  }

  const unSoloPlan = planes.data?.length === 1;
  const pasos: Paso[] = unSoloPlan
    ? ["universidad", "carrera", "carga"]
    : ["universidad", "carrera", "plan", "carga"];
  const universidad = universidades.data?.find((u) => u.id === universidadId);
  const carrera = carreras.data?.find((c) => c.id === carreraId);
  const planActivo = planes.data?.find((p) => p.id === planActivoId);
  const resumen: Partial<Record<Paso, string>> = {
    universidad: universidad?.sigla ?? universidad?.nombre,
    carrera: [carrera?.sigla, unSoloPlan && planActivo ? `Plan ${planActivo.version}` : null]
      .filter(Boolean)
      .join(" · "),
    plan: planActivo ? `Plan ${planActivo.version}` : undefined,
  };

  function irA(destino: Paso) {
    if (paso === "carga" && carga === "grilla") {
      // La grilla espera sus guardados y avisa si algo falló antes de dejar salir.
      destinoAlSalirDeLaGrilla.current = destino;
      setPedidoVolver((n) => n + 1);
      return;
    }
    activar.reset();
    setPaso(destino);
    setCarga("camino");
  }

  function pasoAnterior() {
    if (paso === "carga" && carga === "importar") {
      setCarga("camino");
      return;
    }
    const anterior = pasos[pasos.indexOf(paso) - 1];
    if (anterior) irA(anterior);
  }

  const vigente = planVigente(planes.data ?? []);
  const opcionesPlan = (lista: Plan[]): Opcion[] =>
    lista.map((p) => ({
      id: p.id,
      titulo: `Plan ${p.version}`,
      marca: lista.length > 1 && p.id === vigente?.id ? "Vigente" : null,
      detalle: lista.length > 1 && p.id === vigente?.id ? "El más reciente" : null,
    }));

  let contenido: ReactNode;
  if (paso === "universidad") {
    contenido = (
      <PasoElegir
        key={paso}
        consulta={{
          ...universidades,
          data: universidades.data?.map((u) => ({
            id: u.id,
            titulo: u.nombre,
            detalle: [u.sigla, u.sede].filter(Boolean).join(" · "),
          })),
        }}
        nombre="Universidad"
        vacio="Todavía no hay universidades cargadas."
        valor={universidadId}
        alSeguir={(id) => {
          if (id !== universidadId) setCarreraId(null);
          setUniversidadId(id);
          setPaso("carrera");
        }}
      />
    );
  } else if (paso === "carrera") {
    contenido = (
      <PasoElegir
        key={paso}
        consulta={{
          ...carreras,
          data: carreras.data?.map((c) => ({ id: c.id, titulo: c.nombre, detalle: c.sigla })),
        }}
        nombre="Carrera"
        vacio="Esta universidad todavía no tiene carreras cargadas."
        valor={carreraId}
        ayuda={
          unSoloPlan && planes.data?.[0]
            ? `Tiene un solo plan, el ${planes.data[0].version}: se elige solo.`
            : null
        }
        ocupado={activar.isPending}
        error={errorCarrera ?? activar.error?.message}
        alSeguir={(id) => void elegirCarrera(id)}
      />
    );
  } else if (paso === "plan") {
    contenido = (
      <PasoElegir
        key={`${paso}-${carreraId}`}
        consulta={{ ...planes, data: planes.data && opcionesPlan(planes.data) }}
        nombre="Plan"
        vacio="Esta carrera todavía no tiene planes cargados."
        valor={planActivoId ?? vigente?.id ?? null}
        textoSeguir="Elegir este plan"
        ayuda={
          (planes.data?.length ?? 0) > 1
            ? "¿No sabés cuál es? Figura en tu Historia Académica del Guaraní."
            : null
        }
        ocupado={activar.isPending}
        error={activar.error?.message}
        alSeguir={activarPlan}
      />
    );
  } else if (carga === "grilla") {
    contenido = (
      <ConPlan>
        {(datos) => (
          <GrillaRapida
            datos={datos}
            pedidoVolver={pedidoVolver}
            alVolver={() => {
              const destino = destinoAlSalirDeLaGrilla.current;
              destinoAlSalirDeLaGrilla.current = null;
              setCarga("camino");
              if (destino) setPaso(destino);
            }}
            alTerminar={() => {
              window.location.hash = "inicio";
            }}
          />
        )}
      </ConPlan>
    );
  } else if (carga === "importar") {
    contenido = (
      <ConPlan>
        {(datos) => <ImportarRespaldo datos={datos} alCancelar={() => setCarga("camino")} />}
      </ConPlan>
    );
  } else {
    contenido = (
      <div className="caminos">
        <div className="camino prox">
          <b>
            Importar desde SIU Guaraní<span className="badge-m prox">Próximamente</span>
          </b>
          <small>Subís tu Historia Académica y se cargan tus materias y notas.</small>
          <button className="btn-sin" type="button" disabled>
            ¿Cómo consigo el archivo?
          </button>
        </div>
        <button className="camino" type="button" onClick={() => setCarga("grilla")}>
          <b>Cargar a mano</b>
          <small>Marcás el estado de cada materia, sin notas.</small>
        </button>
        <button className="camino" type="button" onClick={() => setCarga("importar")}>
          <b>Importar respaldo de EstudIA</b>
          <small>El archivo .json que descargaste desde Ajustes.</small>
        </button>
      </div>
    );
  }

  const numero = pasos.indexOf(paso) + 1;
  const hayAnterior = numero > 1 || (paso === "carga" && carga !== "camino");
  return (
    <>
      {/* El título de la vista queda atrás del modal: es el de la página. */}
      <header className="view-h">
        <h1>{VISTAS.onboarding}</h1>
      </header>
      <Dialogo
        idTitulo={idTitulo}
        clase={carga === "grilla" && paso === "carga" ? "onb ancho" : "onb"}
        alCerrar={() => {}}
      >
        <div className="onb-cuerpo">
          <BarraOnboarding alVolver={hayAnterior ? pasoAnterior : null} />
          <div className="ob-body">
            <div className="eyebrow">
              Paso {numero} de {pasos.length}
            </div>
            <h2 id={idTitulo} ref={titulo} tabIndex={-1}>
              {TITULOS[paso === "carga" ? carga : paso]}
            </h2>
            {contenido}
          </div>
          <LineaDePasos pasos={pasos} actual={paso} resumen={resumen} alIr={irA} />
        </div>
      </Dialogo>
    </>
  );
}
