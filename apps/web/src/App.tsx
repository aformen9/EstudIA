import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { Conexion } from "./conexion/conexion";
import { Fondo } from "./interfaz/Fondo";
import { Shell } from "./interfaz/Shell";
import { crearClienteQuery } from "./plan/clienteQuery";
import { Login } from "./sesion/Login";
import { ProveedorSesion, useSesion } from "./sesion/sesion";

function Pantalla() {
  const sesion = useSesion();
  // Con `key`, otra cuenta no hereda el estado de la vista de la anterior.
  if (sesion.estado === "activa") return <Shell key={sesion.sesion.user.id} />;
  if (sesion.estado === "anonima") return <Login />;
  return (
    <div className="login-wrap">
      <p className="sub" role="status">
        Cargando…
      </p>
    </div>
  );
}

export function App({ conexion }: { conexion: Conexion | null }) {
  const [clienteQuery] = useState(() => crearClienteQuery());

  return (
    <>
      <Fondo />
      {conexion ? (
        <QueryClientProvider client={clienteQuery}>
          <ProveedorSesion conexion={conexion}>
            <Pantalla />
          </ProveedorSesion>
        </QueryClientProvider>
      ) : (
        <div className="login-wrap">
          <main className="card glass">
            <h1>Falta conectar Supabase</h1>
            <p className="sub">
              Completá <code>apps/web/.env.local</code> a partir de <code>.env.example</code>.
            </p>
          </main>
        </div>
      )}
    </>
  );
}
