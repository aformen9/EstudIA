import { VISTAS, type Vista } from "../navegacion/rutas";
import { Icono } from "./Iconos";

/** Lugar de cada vista hasta que se porte su contenido. */
export function VistaEnConstruccion({ vista }: { vista: Vista }) {
  return (
    <>
      <header className="view-h">
        <h1>{VISTAS[vista]}</h1>
      </header>
      <section className="card empty rise">
        <span className="big">
          <Icono nombre="book" />
        </span>
        <p className="sub">Esta sección todavía está en construcción.</p>
      </section>
    </>
  );
}
