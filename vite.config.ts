import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Cozy Farm",
        short_name: "CozyFarm",
        display: "standalone",
        background_color: "#1e1e1e",
        theme_color: "#1e1e1e",
        icons: []
      }
    })
  ]
})