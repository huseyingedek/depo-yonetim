import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Eski Android tablet tarayıcıları için: modern sözdizimini (?. ?? vb.) aşağı çevir.
  // Yoksa eski tarayıcıda paket parse edilemeyip beyaz ekran olur.
  build: {
    target: "es2015",
  },
  esbuild: {
    target: "es2015",
  },
  server: {
    host: true,
    port: 5173,
  },
});
