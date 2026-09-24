import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: { port: 5173 },
  // Vite only exposes VITE_-prefixed env vars to client code by default;
  // widen this so APP_ENV is readable via import.meta.env.APP_ENV too.
  envPrefix: ["VITE_", "APP_ENV"],
})