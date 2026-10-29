import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri expects a fixed port and no screen clearing.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: "VITE_PUBLIC_",
  server: { port: 1420, strictPort: true },
  build: { target: ["es2022", "safari15"], chunkSizeWarningLimit: 800 },
});
