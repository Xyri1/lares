import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // vendor/live2d (gitignored, populated by `pnpm fetch-assets`) is served
    // at / so index.html loads the Cubism Core with a plain script tag —
    // same path in dev and in the built output.
    publicDir: resolve('vendor/live2d'),
    // Vite's default 5173 falls inside a Windows WinNAT excluded port range
    // on some machines (netsh interface ipv4 show excludedportrange), and
    // binding ::1 is what actually fails — pin IPv4 loopback + a safe port.
    server: { host: '127.0.0.1', port: 5300 }
  }
})
