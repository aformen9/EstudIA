import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Sin `globals` de Vitest, Testing Library no limpia sola entre tests.
afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
