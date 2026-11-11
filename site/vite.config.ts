import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    // Every page is prerendered to plain HTML in build/, so any static host works.
    sveltekit({
      adapter: adapter(),
      prerender: {
        // The .md twins are written after the build by scripts/markdown.ts.
        handleHttpError: ({ path, message }) => {
          if (path.endsWith('.md')) return
          throw new Error(message)
        },
      },
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },
    }),
  ],
})
