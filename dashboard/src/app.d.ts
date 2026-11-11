// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    interface Error {
      message: string
      /** What to do next, in plain words */
      hint?: string
    }
  }
}

export {}
