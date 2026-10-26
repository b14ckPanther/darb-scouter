/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL. Unset = demo fixtures; "" = same origin (the API serves this build). */
  readonly VITE_API_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
