import type { Material } from "@estudia/core";
import { Icono } from "../interfaz/Iconos";
import { extensionDeArchivo } from "../plan/presentacion";

export function IconoMaterial({ material }: { material: Material }) {
  return (
    <span className={`ftype ${material.tipo}`}>
      {material.tipo === "archivo" ? (
        extensionDeArchivo(material.titulo)
      ) : (
        <Icono nombre={material.tipo === "link" ? "link" : "note"} />
      )}
    </span>
  );
}
