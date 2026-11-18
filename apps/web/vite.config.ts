import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** Versión que va en los reportes: el commit que publicó Vercel, o "local" en desarrollo. */
const versionApp = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);

export default defineConfig({
  plugins: [react()],
  define: { __VERSION_APP__: JSON.stringify(versionApp) },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/pruebas/preparacion.ts"],
  },
});
