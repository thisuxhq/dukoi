import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      // `droidhost dashboard` runs the built server on 127.0.0.1 only.
      adapter: adapter(),
      experimental: { remoteFunctions: true },
      compilerOptions: {
        experimental: { async: true },
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },
    }),
  ],
  // The CLI's signed client is TypeScript source in the workspace; bundle it into the server.
  ssr: { noExternal: ['droidhost', '@droidhost/shared'] },
})
