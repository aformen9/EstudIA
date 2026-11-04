import { lazy, Suspense, useState, type ComponentType, type LazyExoticComponent } from "react";
import type { PropsLoginDePrueba } from "./loginDePrueba";
import { useConexion } from "./sesion";

// El `if` es lo que deja este import afuera del build de producción: Vite reemplaza la condición por
// `false` y el código se elimina. loginDePrueba.build.test.ts lo comprueba con un build real.
let LoginDePrueba: LazyExoticComponent<ComponentType<PropsLoginDePrueba>> | null = null;
if (import.meta.env.DEV) {
  LoginDePrueba = lazy(() => import("./loginDePrueba"));
}

export function Login() {
  const { cliente, url } = useConexion();
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrarConGoogle() {
    setEntrando(true);
    setError(null);
    const { error: fallo } = await cliente.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    // Sin error, el navegador ya se está yendo a Google.
    if (fallo) {
      setError(`No pude abrir el ingreso con Google: ${fallo.message}`);
      setEntrando(false);
    }
  }

  return (
    <div className="login-wrap">
      <main className="login">
        <div className="login-head">
          <span className="logo lg" aria-hidden="true"></span>
          <h1>EstudIA</h1>
          <p>Tu carrera, tus notas y tus apuntes en un solo lugar.</p>
        </div>
        <div className="card glass">
          <button
            className="btn primary"
            type="button"
            onClick={entrarConGoogle}
            disabled={entrando}
          >
            Entrar con Google
          </button>
          {error && (
            <div className="msg err" role="alert">
              {error}
            </div>
          )}
          {LoginDePrueba && (
            <Suspense fallback={null}>
              <LoginDePrueba cliente={cliente} url={url} />
            </Suspense>
          )}
        </div>
      </main>
    </div>
  );
}
