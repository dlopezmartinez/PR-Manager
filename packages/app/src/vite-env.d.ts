/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_API_KEY: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Electron Forge Vite plugin injects these globals at build time
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
