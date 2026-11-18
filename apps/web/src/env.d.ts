/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Enlace de solo lectura del panel de Umami, para #admin. Ver interfaz/panelVisitas.ts. */
  readonly VITE_UMAMI_SHARE_URL?: string;
}

/** Commit corto que publicó Vercel, o "local". Ver vite.config.ts. */
declare const __VERSION_APP__: string;
