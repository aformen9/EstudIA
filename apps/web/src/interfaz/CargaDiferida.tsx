import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";

/** `lazy` para un export con nombre. */
export function diferido<P extends object>(
  cargar: () => Promise<ComponentType<P>>,
): ComponentType<P> {
  const Perezoso = lazy(async () => ({ default: await cargar() }));
  return Perezoso as unknown as ComponentType<P>;
}

class LimiteDeCarga extends Component<{ clase?: string; children: ReactNode }, { fallo: boolean }> {
  override state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  override render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <div className={this.props.clase ?? "card"} role="alert">
        <p className="msg err">
          No pude cargar esta parte de la app. Revisá tu conexión y volvé a intentar.
        </p>
        <div className="acciones">
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Lo que rodea a cada pieza que se carga aparte: mientras llega dice "Cargando…" y, si no llega (una
 * versión nueva publicada o se cortó la red), lo explica en vez de dejar la pantalla en blanco.
 */
export function CargaDiferida({ clase, children }: { clase?: string; children: ReactNode }) {
  return (
    <LimiteDeCarga clase={clase}>
      <Suspense
        fallback={
          <p className={clase ?? "sub"} role="status">
            Cargando…
          </p>
        }
      >
        {children}
      </Suspense>
    </LimiteDeCarga>
  );
}
