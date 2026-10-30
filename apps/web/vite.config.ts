import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Only VITE_PUBLIC_* variables reach the bundle. Never put provider keys in web env.
  envPrefix: "VITE_PUBLIC_",
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 800 },
});
