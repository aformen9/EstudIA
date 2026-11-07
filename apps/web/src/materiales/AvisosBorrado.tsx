import type { Material } from "@estudia/core";
import { useEffect, useSyncExternalStore } from "react";
import { useBorrados, type BorradosPendientes } from "./borradosPendientes";

/** El botón "Borrar" ya no está: al deshacer, el foco vuelve al del material que reapareció. */
function enfocarMaterial(materialId: string) {
  requestAnimationFrame(() => {
    const fila = document.querySelector<HTMLElement>(`[data-material="${CSS.escape(materialId)}"]`);
    const destino =
      fila?.querySelector<HTMLElement>(".del") ??
      document.querySelector<HTMLElement>("dialog[open]") ??
      document.querySelector<HTMLElement>("main");
    destino?.focus();
  });
}

function AvisoDeshacer({
  borrados,
  material,
}: {
  borrados: BorradosPendientes;
  material: Material;
}) {
  // Puede desmontarse con el foco o el puntero adentro: sin esto, el plazo quedaría frenado.
  useEffect(
    () => () => {
      borrados.reanudar(material.id, "foco");
      borrados.reanudar(material.id, "puntero");
    },
    [borrados, material.id],
  );

  return (
    <div
      className="aviso-deshacer"
      onMouseEnter={() => borrados.pausar(material.id, "puntero")}
      onMouseLeave={() => borrados.reanudar(material.id, "puntero")}
      onFocus={() => borrados.pausar(material.id, "foco")}
      onBlur={() => borrados.reanudar(material.id, "foco")}
    >
      <span className="aviso-texto" title={material.titulo}>
        Borraste “{material.titulo}”.
      </span>
      <button
        type="button"
        aria-label={`Deshacer: volver a traer ${material.titulo}`}
        onClick={() => {
          borrados.deshacer(material.id);
          enfocarMaterial(material.id);
        }}
      >
        Deshacer
      </button>
    </div>
  );
}

/**
 * La región existe antes que los avisos, si no los lectores de pantalla no los anuncian. Se muestra
 * adentro del último modal abierto: afuera quedaría inerte y "Deshacer" no se podría tocar.
 */
export function RegionAvisos() {
  const borrados = useBorrados();
  if (!borrados) return null;
  return <RegionConAvisos borrados={borrados} />;
}

function RegionConAvisos({ borrados }: { borrados: BorradosPendientes }) {
  const { pendientes, fallos } = useSyncExternalStore(borrados.suscribir, borrados.leer);
  return (
    <div className="avisos-borrado">
      <div role="status" className="avisos-grupo">
        {pendientes.map((material) => (
          <AvisoDeshacer key={material.id} borrados={borrados} material={material} />
        ))}
      </div>
      {fallos.map((fallo) => (
        <div className="aviso-deshacer" role="alert" key={fallo.id}>
          <span className="aviso-texto largo">{fallo.texto}</span>
          <button type="button" onClick={() => borrados.descartarFallo(fallo.id)}>
            Entendido
          </button>
        </div>
      ))}
    </div>
  );
}

/** La región de la pantalla principal: con un modal abierto la pone el `Dialogo`. */
export function RegionAvisosPrincipal() {
  const borrados = useBorrados();
  const hayDialogo = useSyncExternalStore(
    borrados?.suscribir ?? (() => () => {}),
    () => (borrados?.leer().dialogos.length ?? 0) > 0,
  );
  return hayDialogo ? null : <RegionAvisos />;
}
