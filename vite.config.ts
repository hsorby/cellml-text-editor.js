import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import dts from 'vite-plugin-dts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    dts({
      tsconfigPath: './tsconfig.app.json',
      include: ['src/lib/**', 'src/index.ts'],
      insertTypesEntry: true,
    }),
  ],
  optimizeDeps: {
    // Exclude the wasm-based library from pre-bundling
    exclude: ['vue3-libcellml.js'],
    esbuildOptions: {
      target: 'es2020',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    copyPublicDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'CellMLTextEditor',
      fileName: 'cellml-text-editor',
    },
  },
})
