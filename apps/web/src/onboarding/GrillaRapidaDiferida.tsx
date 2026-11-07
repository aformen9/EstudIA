import type { ComponentProps } from "react";
import { CargaDiferida, diferido } from "../interfaz/CargaDiferida";
import type { GrillaRapida as Original } from "./GrillaRapida";

const Perezosa = diferido<ComponentProps<typeof Original>>(
  async () => (await import("./GrillaRapida")).GrillaRapida,
);

export function GrillaRapida(props: ComponentProps<typeof Original>) {
  return (
    <CargaDiferida>
      <Perezosa {...props} />
    </CargaDiferida>
  );
}
