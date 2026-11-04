import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { crearConexion } from "./conexion/conexion";
import "./estilos/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Falta el elemento #root");

const conexion = crearConexion({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

createRoot(root).render(
  <StrictMode>
    <App conexion={conexion} />
  </StrictMode>,
);
