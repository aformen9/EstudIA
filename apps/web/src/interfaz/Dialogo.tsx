import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { RegionAvisos } from "../materiales/AvisosBorrado";
import { useBorrados } from "../materiales/borradosPendientes";

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]';

let proximoDialogo = 1;
const sinSuscripcion = () => () => {};

function enfocables(dialogo: HTMLElement): HTMLElement[] {
  return [...dialogo.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((el) => {
    // Lo que está adentro de un <details> cerrado no se ve.
    const cerrado = el.closest("details:not([open])");
    return !cerrado || (el.tagName === "SUMMARY" && el.parentElement === cerrado);
  });
}

/**
 * `<dialog>` modal: el foco queda atrapado, Escape cierra y al cerrar el foco vuelve a quien lo abrió
 * (o a `devolverFocoA`, si ese control ya no va a estar; si no queda ninguno, al contenido).
 */
export function Dialogo({
  idTitulo,
  clase = "sheet",
  alCerrar,
  devolverFocoA,
  children,
}: {
  idTitulo: string;
  clase?: "sheet" | "centro";
  alCerrar: () => void;
  devolverFocoA?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const referencia = useRef<HTMLDialogElement>(null);
  const borrados = useBorrados();
  const [idDialogo] = useState(() => proximoDialogo++);
  useLayoutEffect(() => borrados?.abrirDialogo(idDialogo), [borrados, idDialogo]);
  const esElUltimo = useSyncExternalStore(
    borrados?.suscribir ?? sinSuscripcion,
    () => borrados?.leer().dialogos.at(-1) === idDialogo,
  );

  useEffect(() => {
    const dialogo = referencia.current;
    if (!dialogo) return;
    const activo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const destino = devolverFocoA?.current ?? activo;
    if (!dialogo.open) dialogo.showModal();
    return () => {
      if (dialogo.open) dialogo.close();
      if (destino?.isConnected) destino.focus();
      // El control ya no está (por ejemplo, el material se movió): al modal de abajo, si queda uno.
      else
        (
          document.querySelector<HTMLElement>("dialog[open]") ??
          document.querySelector<HTMLElement>("main")
        )?.focus();
    };
  }, [devolverFocoA]);

  function alTeclear(evento: KeyboardEvent<HTMLDialogElement>) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      alCerrar();
      return;
    }
    if (evento.key !== "Tab") return;
    const lista = enfocables(evento.currentTarget);
    const primero = lista[0];
    const ultimo = lista.at(-1);
    if (!primero || !ultimo) return;
    const activo = document.activeElement;
    if (evento.shiftKey && activo === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && activo === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  // En el <body>: el menú lateral que lo abre se oculta en el celular y se llevaría al diálogo con él.
  return createPortal(
    <dialog
      className={clase}
      ref={referencia}
      tabIndex={-1}
      aria-labelledby={idTitulo}
      onKeyDown={alTeclear}
      onCancel={(evento) => {
        evento.preventDefault();
        alCerrar();
      }}
    >
      {children}
      {esElUltimo && <RegionAvisos />}
    </dialog>,
    document.body,
  );
}
