/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WMS_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
