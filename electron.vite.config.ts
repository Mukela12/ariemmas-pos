import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    // better-sqlite3 lives in optionalDependencies (so the Railway server build,
    // which never uses it, doesn't fail compiling it). externalizeDepsPlugin only
    // auto-externalizes `dependencies`, so include it explicitly — otherwise the
    // bundler inlines its native binding and the desktop app crashes on boot.
    plugins: [externalizeDepsPlugin({ include: ['better-sqlite3'] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin({ include: ['better-sqlite3'] })]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
