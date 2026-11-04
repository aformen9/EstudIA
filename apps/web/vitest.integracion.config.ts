import { defineConfig } from "vitest/config";

/**
 * Contra el stack local de Supabase: `pnpm --filter web test:integracion`, con `supabase start`.
 * No entra en `pnpm test` porque deja datos que molestan a los tests de RLS: al terminar, `supabase db reset`.
 * El script usa `--mode development`: en modo `test`, Vitest tomaría `.env.local`, que apunta al remoto,
 * y la prueba se niega a correr ahí.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integracion.{ts,tsx}"],
    testTimeout: 30_000,
  },
});
