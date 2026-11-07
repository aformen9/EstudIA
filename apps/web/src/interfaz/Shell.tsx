import {
  conteoPorEstado,
  materialesDelPlan,
  promedio,
  type DatosAlumno,
  type Material,
} from "@estudia/core";
import { useQuery } from "@tanstack/react-query";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { IndicadorGuardado, useAvisoAlRecargar } from "../guardado/IndicadorGuardado";
import { resolverVista } from "../navegacion/guardaOnboarding";
import { VISTAS, type Vista } from "../navegacion/rutas";
import { reemplazarVista, useVista } from "../navegacion/useVista";
import { RegionAvisosPrincipal } from "../materiales/AvisosBorrado";
import { ProveedorBorrados } from "../materiales/ProveedorBorrados";
import { useMaterialesDelAlumno } from "../materiales/useMateriales";
import { ProveedorAbrirMateria } from "../plan/abrirMateria";
import { consultas, ErrorDeCarga, useDatosAlumno, useInscripcionActiva } from "../plan/planActivo";
import { etiquetaPlan, formatoNota } from "../plan/presentacion";
import { useCerrarSesion } from "../sesion/CerrarSesion";
import { useRepositorio, useSesion } from "../sesion/sesion";
import { Avatar, fotosDeUsuario } from "./Avatar";
import { CargaDiferida, diferido } from "./CargaDiferida";
import { Icono, type NombreIcono } from "./Iconos";
import { useTema } from "./tema";
import { FILTROS_MATERIALES_INICIALES, FILTROS_MATERIAS_INICIALES } from "../vistas/filtros";
import { Inicio } from "../vistas/Inicio";

// Inicio va en el bundle inicial porque es a donde llega casi siempre el alumno.
const Onboarding = diferido(async () => (await import("../onboarding/Onboarding")).Onboarding);
const Ajustes = diferido(async () => (await import("../vistas/Ajustes")).Ajustes);
const Promedio = diferido(async () => (await import("../vistas/Promedio")).Promedio);
const Materiales = diferido(async () => (await import("../vistas/Materiales")).Materiales);
const Materias = diferido(async () => (await import("../vistas/Materias")).Materias);
const Aprobadas = diferido(async () => (await import("../vistas/ListasCarrera")).Aprobadas);
const Cursando = diferido(async () => (await import("../vistas/ListasCarrera")).Cursando);
const Finales = diferido(async () => (await import("../vistas/ListasCarrera")).Finales);
const Pendientes = diferido(async () => (await import("../vistas/ListasCarrera")).Pendientes);

const CLAVE_MENU_ACHICADO = "estudia.mini";

interface Enlace {
  vista: Vista;
  icono: NombreIcono;
  clase?: string;
}

const SECCIONES: { titulo: string | null; enlaces: Enlace[] }[] = [
  {
    titulo: null,
    enlaces: [
      { vista: "inicio", icono: "home" },
      { vista: "materias", icono: "book" },
    ],
  },
  {
    titulo: "Tu carrera",
    enlaces: [
      { vista: "aprobadas", icono: "check", clase: "t-ok" },
      { vista: "cursando", icono: "clock", clase: "t-cur" },
      { vista: "finales", icono: "flag", clase: "t-fin" },
      { vista: "pendientes", icono: "list", clase: "t-pend" },
      { vista: "promedio", icono: "chart", clase: "t-avg" },
    ],
  },
  { titulo: "Estudio", enlaces: [{ vista: "materiales", icono: "folder" }] },
];

function leerMenuAchicado(): boolean {
  try {
    return Boolean(localStorage.getItem(CLAVE_MENU_ACHICADO));
  } catch {
    return false;
  }
}

function contadores(
  datos: DatosAlumno | null,
  materiales: Material[] | undefined,
): Partial<Record<Vista, string | number>> {
  if (!datos) return {};
  const conteo = conteoPorEstado(datos);
  return {
    materias: datos.materias.length,
    aprobadas: conteo.aprobada,
    cursando: conteo.cursando,
    finales: conteo.final,
    pendientes: conteo.pendiente,
    promedio: formatoNota(promedio(datos, false).promedio),
    materiales: materiales && materialesDelPlan(materiales, datos.materias).length,
  };
}

/**
 * Durante el onboarding no hay ajustes a los que ir: el botón cierra la sesión, y solo pregunta si hay
 * archivos en este dispositivo.
 */
function MenuAjustes({ email, enOnboarding }: { email: string; enOnboarding: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const { pedir, dialogo, error } = useCerrarSesion({
    preguntarSoloConArchivos: enOnboarding,
    devolverFocoA: boton,
  });

  useEffect(() => {
    if (!abierto) return;
    function alHacerClic(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    }
    document.addEventListener("click", alHacerClic);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("click", alHacerClic);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  const mensajeDeError = error && (
    <div className="msg err" role="alert">
      {error}
    </div>
  );

  if (enOnboarding) {
    return (
      <div className="menu" ref={contenedor}>
        <button
          className="side-btn"
          type="button"
          ref={boton}
          title="Cerrar sesión"
          onClick={() => void pedir()}
        >
          <Icono nombre="logout" />
          <span>Cerrar sesión</span>
        </button>
        {mensajeDeError}
        {dialogo}
      </div>
    );
  }

  return (
    <div className="menu" ref={contenedor}>
      <button
        className="side-btn"
        type="button"
        ref={boton}
        title="Respaldo y ajustes"
        aria-haspopup="true"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <Icono nombre="gear" />
        <span>Respaldo y ajustes</span>
      </button>
      {abierto && (
        <div className="menu-pop">
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              window.location.hash = "ajustes";
            }}
          >
            <Icono nombre="user" />
            Ajustes
            <small>Nombre, carrera y respaldo</small>
          </button>
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              void pedir();
            }}
          >
            <Icono nombre="logout" />
            Cerrar sesión
            <small>{email}</small>
          </button>
        </div>
      )}
      {mensajeDeError}
      {dialogo}
    </div>
  );
}

/** Lo que el alumno eligió en las vistas: como en la referencia, sigue ahí si se va y vuelve. */
const FILTROS_INICIALES = {
  materias: FILTROS_MATERIAS_INICIALES,
  materiales: FILTROS_MATERIALES_INICIALES,
  conAplazos: false,
};

function ContenidoVista({
  vista,
  filtros,
  setFiltros,
  alActivarPlan,
}: {
  vista: Vista;
  filtros: typeof FILTROS_INICIALES;
  setFiltros: Dispatch<SetStateAction<typeof FILTROS_INICIALES>>;
  alActivarPlan: () => void;
}) {
  switch (vista) {
    case "onboarding":
      return <Onboarding alActivarPlan={alActivarPlan} />;
    case "inicio":
      return <Inicio />;
    case "materias":
      return (
        <Materias
          filtros={filtros.materias}
          alCambiar={(cambios) =>
            setFiltros((f) => ({ ...f, materias: { ...f.materias, ...cambios } }))
          }
        />
      );
    case "aprobadas":
      return <Aprobadas />;
    case "cursando":
      return <Cursando />;
    case "finales":
      return <Finales />;
    case "pendientes":
      return <Pendientes />;
    case "promedio":
      return (
        <Promedio
          conAplazos={filtros.conAplazos}
          alCambiar={(conAplazos) => setFiltros((f) => ({ ...f, conAplazos }))}
        />
      );
    case "materiales":
      return (
        <Materiales
          filtros={filtros.materiales}
          alCambiar={(cambios) =>
            setFiltros((f) => ({ ...f, materiales: { ...f.materiales, ...cambios } }))
          }
        />
      );
    case "ajustes":
      return <Ajustes />;
  }
}

/** Cascarón de la app: menú lateral (desplegable en el celular), barra superior y vista actual. */
export function Shell() {
  return (
    <ProveedorBorrados>
      <ContenidoShell />
    </ProveedorBorrados>
  );
}

function ContenidoShell() {
  const pedida = useVista();
  const inscripcion = useInscripcionActiva();
  // El alumno acaba de activar su plan y está en el último paso del onboarding.
  const [enCurso, setEnCurso] = useState(false);
  if (enCurso && pedida !== "onboarding") setEnCurso(false);
  const vista = resolverVista(pedida, inscripcion.estado, enCurso);
  const sinPlan = inscripcion.estado !== "activa";
  // Hasta terminar el onboarding, incluido el paso de cargar las materias, el menú queda oculto.
  const bloqueado = sinPlan || vista === "onboarding";
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);

  const plan = useDatosAlumno();
  const datos = plan.estado === "listo" ? plan.datos : null;
  const repositorio = useRepositorio();
  const sesion = useSesion();
  const { tema, alternar } = useTema();
  const [abierto, setAbierto] = useState(false);
  const [achicado, setAchicado] = useState(leerMenuAchicado);

  const perfil = useQuery(consultas.perfil(repositorio));
  const materiales = useMaterialesDelAlumno({ enabled: !sinPlan });
  const cuentas = contadores(datos, materiales.data);
  const nombre = perfil.data?.nombre?.trim() || "EstudIA";
  const usuario = sesion.estado === "activa" ? sesion.sesion.user : null;
  const email = usuario?.email ?? "";
  useAvisoAlRecargar();

  const nav = useRef<HTMLElement>(null);
  const indicador = useRef<HTMLSpanElement>(null);
  const main = useRef<HTMLElement>(null);
  const botonAbrir = useRef<HTMLButtonElement>(null);
  const marca = useRef<HTMLButtonElement>(null);
  const yaMontada = useRef(false);

  useEffect(() => {
    if (vista && vista !== pedida) reemplazarVista(vista);
  }, [vista, pedida]);

  useLayoutEffect(() => {
    function moverIndicador() {
      const enlace = nav.current?.querySelector<HTMLElement>(`a[data-v="${vista}"]`);
      const ind = indicador.current;
      if (!ind) return;
      // Ajustes y onboarding no están en el menú: sin enlace activo no hay indicador.
      ind.hidden = !enlace;
      if (enlace) {
        ind.style.transform = `translateY(${enlace.offsetTop}px)`;
        ind.style.height = `${enlace.offsetHeight}px`;
      }
    }
    moverIndicador();
    let vigente = true;
    void document.fonts?.ready.then(() => {
      if (vigente) moverIndicador();
    });
    window.addEventListener("resize", moverIndicador);
    return () => {
      vigente = false;
      window.removeEventListener("resize", moverIndicador);
    };
  }, [vista, achicado, bloqueado]);

  useEffect(() => {
    if (!vista) return;
    document.title = `${VISTAS[vista]} · EstudIA`;
    // Al cambiar de vista el foco pasa al contenido, salvo al abrir la app.
    if (yaMontada.current) main.current?.focus({ preventScroll: true });
    yaMontada.current = true;
  }, [vista]);

  useEffect(() => {
    if (!abierto) return;
    marca.current?.focus();
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAbierto(false);
        botonAbrir.current?.focus();
      }
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  function alternarAchicado() {
    const siguiente = !achicado;
    setAchicado(siguiente);
    try {
      localStorage.setItem(CLAVE_MENU_ACHICADO, siguiente ? "1" : "");
    } catch {
      // Sin localStorage dura hasta recargar.
    }
  }

  const clases = ["shell", abierto && "open", achicado && "collapsed"].filter(Boolean).join(" ");

  return (
    <ProveedorAbrirMateria>
      <div className={clases}>
        <aside className="side" id="menu-lateral">
          <div className="side-top">
            <button
              className="brand"
              type="button"
              ref={marca}
              title="Inicio"
              onClick={() => {
                setAbierto(false);
                if (!bloqueado) window.location.hash = "inicio";
              }}
            >
              <Avatar nombre={nombre} fotos={fotosDeUsuario(usuario?.user_metadata)} />
              <span className="brand-txt">
                <b>{nombre}</b>
                {datos && <small title={etiquetaPlan(datos)}>{etiquetaPlan(datos)}</small>}
              </span>
            </button>
            <button
              className="icon-btn collapse"
              type="button"
              aria-label={achicado ? "Agrandar el menú" : "Achicar el menú"}
              onClick={alternarAchicado}
            >
              <Icono nombre="chev-left" />
            </button>
          </div>

          {!bloqueado && (
            <nav className="nav" ref={nav} aria-label="Secciones">
              <span className="nav-ind" ref={indicador} aria-hidden="true"></span>
              {SECCIONES.map(({ titulo, enlaces }) => (
                <div key={titulo ?? "principal"} style={{ display: "contents" }}>
                  {titulo && (
                    <div className="nav-label">
                      <span>{titulo}</span>
                    </div>
                  )}
                  {enlaces.map((e) => (
                    <a
                      key={e.vista}
                      href={`#${e.vista}`}
                      data-v={e.vista}
                      title={VISTAS[e.vista]}
                      className={[e.clase, vista === e.vista && "on"].filter(Boolean).join(" ")}
                      aria-current={vista === e.vista ? "page" : undefined}
                      onClick={() => setAbierto(false)}
                    >
                      <Icono nombre={e.icono} />
                      <span>{VISTAS[e.vista]}</span>
                      {cuentas[e.vista] !== undefined && <em>{cuentas[e.vista]}</em>}
                    </a>
                  ))}
                </div>
              ))}
            </nav>
          )}

          <div className="side-bottom">
            <IndicadorGuardado />
            <button
              className="side-btn"
              type="button"
              title={tema === "dark" ? "Modo claro" : "Modo oscuro"}
              onClick={alternar}
            >
              <Icono nombre={tema === "dark" ? "sun" : "moon"} />
              <span>{tema === "dark" ? "Modo claro" : "Modo oscuro"}</span>
            </button>
            <MenuAjustes email={email} enOnboarding={bloqueado} />
          </div>
        </aside>

        <div
          className="scrim"
          onClick={() => {
            setAbierto(false);
            botonAbrir.current?.focus();
          }}
        ></div>

        <div className="main-wrap">
          <header className="topbar">
            <button
              className="icon-btn"
              type="button"
              ref={botonAbrir}
              aria-label="Abrir el menú"
              aria-controls="menu-lateral"
              aria-expanded={abierto}
              onClick={() => setAbierto(true)}
            >
              <Icono nombre="menu" />
            </button>
            <span className="topbar-title">{vista ? VISTAS[vista] : "EstudIA"}</span>
            {/* El menú lateral está oculto en el celular: sin esto, no se vería si guardó o no. */}
            <IndicadorGuardado />
          </header>
          <main className="main" ref={main} tabIndex={-1}>
            {vista ? (
              <CargaDiferida key={vista}>
                <ContenidoVista
                  vista={vista}
                  filtros={filtros}
                  setFiltros={setFiltros}
                  alActivarPlan={() => setEnCurso(true)}
                />
              </CargaDiferida>
            ) : inscripcion.estado === "error" ? (
              <ErrorDeCarga
                mensaje={inscripcion.error.message}
                reintentar={inscripcion.reintentar}
              />
            ) : (
              <p className="sub" role="status">
                Cargando tu plan…
              </p>
            )}
          </main>
        </div>
      </div>
      <RegionAvisosPrincipal />
    </ProveedorAbrirMateria>
  );
}
