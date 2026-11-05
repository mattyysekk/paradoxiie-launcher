import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// shipped builds are minified and carry no source maps
const shipped = { minify: 'esbuild' as const, sourcemap: false }

export default defineConfig({
  main: { build: shipped },
  preload: { build: shipped },
  renderer: {
    resolve: {
      alias: { '@renderer': resolve('src/renderer/src') }
    },
    build: shipped,
    plugins: [react()]
  }
})
