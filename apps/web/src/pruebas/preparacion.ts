import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { instalarIndexedDbFalso, reiniciarIndexedDbFalso } from "./indexedDbFalso";

// Sin `globals` de Vitest, Testing Library no limpia sola entre tests.
afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});

if (typeof document !== "undefined") {
  instalarIndexedDbFalso();
  beforeEach(reiniciarIndexedDbFalso);

  // jsdom todavía no implementa los diálogos modales.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.querySelector<HTMLElement>("button, input, select, textarea, a[href]")?.focus();
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}
