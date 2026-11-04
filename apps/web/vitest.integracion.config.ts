import { defineConfig } from "vitest/config";

/**
 * Contra el stack local de Supabase: `pnpm --filter web test:integracion`, con `supabase start`.
 * No entra en `pnpm test` porque deja datos que molestan a los tests de RLS: al terminar, `supabase db reset`.
 */
export default defineConfig({
  // En modo `test`, Vitest tomaría `.env.local`, que apunta al remoto: la prueba se niega a correr ahí.
  mode: "development",
  test: {
    environment: "node",
    include: ["src/**/*.integracion.ts"],
    testTimeout: 30_000,
  },
});
