import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The web app talks only to its own local service (SPEC R22). In dev, Vite
// proxies /api to the Node service; in production the service serves dist/.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": `http://127.0.0.1:${process.env.PORT ?? 8787}` } },
  worker: { format: "es" },
  build: { outDir: "dist", sourcemap: true },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
