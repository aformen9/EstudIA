import { useIsMutating, useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { VISTAS, type Vista } from "../navegacion/rutas";
import { useVista } from "../navegacion/useVista";
import { useConexion, useRepositorio, useSesion } from "../sesion/sesion";
import { Icono, type NombreIcono } from "./Iconos";
import { useTema } from "./tema";
import { VistaEnConstruccion } from "./VistaEnConstruccion";

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

function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);
  useEffect(() => {
    const alCambiar = () => setEnLinea(navigator.onLine);
    window.addEventListener("online", alCambiar);
    window.addEventListener("offline", alCambiar);
    return () => {
      window.removeEventListener("online", alCambiar);
      window.removeEventListener("offline", alCambiar);
    };
  }, []);
  return enLinea;
}

function EstadoGuardado() {
  const enLinea = useEnLinea();
  const guardando = useIsMutating() > 0;
  const [clase, texto] = !enLinea
    ? ["local", "Sin conexión"]
    : guardando
      ? ["saving", "Guardando…"]
      : ["", "Guardado en la nube"];
  return (
    <div className={`save-state ${clase}`} role="status">
      <span className="dot"></span>
      <span>{texto}</span>
    </div>
  );
}

function MenuAjustes({ email }: { email: string }) {
  const { cliente } = useConexion();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

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

  async function cerrarSesion() {
    setAbierto(false);
    setError(null);
    // Solo este dispositivo (decisión de Agu): las otras sesiones del alumno siguen abiertas.
    const { error: fallo } = await cliente.auth.signOut({ scope: "local" });
    if (fallo) setError(`No pude cerrar la sesión: ${fallo.message}`);
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
          <button type="button" onClick={cerrarSesion}>
            <Icono nombre="logout" />
            Cerrar sesión
            <small>{email}</small>
          </button>
        </div>
      )}
      {error && (
        <div className="msg err" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/** Cascarón de la app: menú lateral (desplegable en el celular), barra superior y vista actual. */
export function Shell() {
  const vista = useVista();
  const repositorio = useRepositorio();
  const sesion = useSesion();
  const { tema, alternar } = useTema();
  const [abierto, setAbierto] = useState(false);
  const [achicado, setAchicado] = useState(leerMenuAchicado);

  const perfil = useQuery({ queryKey: ["perfil"], queryFn: () => repositorio.obtenerPerfil() });
  const nombre = perfil.data?.nombre?.trim() || "EstudIA";
  const email = sesion.estado === "activa" ? (sesion.sesion.user.email ?? "") : "";

  const nav = useRef<HTMLElement>(null);
  const indicador = useRef<HTMLSpanElement>(null);
  const main = useRef<HTMLElement>(null);
  const botonAbrir = useRef<HTMLButtonElement>(null);
  const marca = useRef<HTMLButtonElement>(null);
  const yaMontada = useRef(false);

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
  }, [vista, achicado]);

  useEffect(() => {
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
              window.location.hash = "inicio";
            }}
          >
            <span className="avatar" aria-hidden="true">
              {nombre.charAt(0).toUpperCase()}
            </span>
            <span className="brand-txt">
              <b>{nombre}</b>
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
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-bottom">
          <EstadoGuardado />
          <button
            className="side-btn"
            type="button"
            title={tema === "dark" ? "Modo claro" : "Modo oscuro"}
            onClick={alternar}
          >
            <Icono nombre={tema === "dark" ? "sun" : "moon"} />
            <span>{tema === "dark" ? "Modo claro" : "Modo oscuro"}</span>
          </button>
          <MenuAjustes email={email} />
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
          <span className="topbar-title">{VISTAS[vista]}</span>
        </header>
        <main className="main" ref={main} tabIndex={-1}>
          <VistaEnConstruccion key={vista} vista={vista} />
        </main>
      </div>
    </div>
  );
}
