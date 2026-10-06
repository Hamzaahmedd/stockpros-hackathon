import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const { version } = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
) as { version: string }

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Sent with feedback so a report names the build it came from.
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: { port: 5173 },
  // Vite only exposes VITE_-prefixed env vars to client code by default;
  // widen this so APP_ENV is readable via import.meta.env.APP_ENV too.
  envPrefix: ['VITE_', 'APP_ENV'],
  // Unit/component tests live beside the code; Playwright specs stay in e2e/.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
