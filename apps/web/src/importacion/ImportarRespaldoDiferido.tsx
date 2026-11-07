import type { ComponentProps } from "react";
import { CargaDiferida, diferido } from "../interfaz/CargaDiferida";
import type { ImportarRespaldo as Original } from "./ImportarRespaldo";

const Perezoso = diferido<ComponentProps<typeof Original>>(
  async () => (await import("./ImportarRespaldo")).ImportarRespaldo,
);

/** Los importadores pesan y casi nadie los usa en una visita normal: se cargan al abrirlos. */
export function ImportarRespaldo(props: ComponentProps<typeof Original>) {
  return (
    <CargaDiferida>
      <Perezoso {...props} />
    </CargaDiferida>
  );
}
