import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Pure-JS deps are bundled into the main/preload chunks rather than kept
// external. Under pnpm, externalised packages break in packaged builds
// because electron-builder can't walk pnpm's nested .pnpm/ store to collect
// transitive deps (e.g. axios → form-data). Bundling sidesteps that entirely.
// Only native modules (steamworks.js ships a .node binary) must stay external.
const BUNDLED_DEPS = [
  'axios',
  'electron-store',
  'protobufjs',
  'zustand',
  '@drift/shared',
  '@drift/lo-protos',
  '@electron-toolkit/utils',
  '@electron-toolkit/preload',
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: BUNDLED_DEPS })]
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: BUNDLED_DEPS })]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer')
      }
    },
    plugins: [react()]
  }
})
