import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The browser talks only to the Vite dev server; anything under /api is
// forwarded to the Express API, so no CORS setup is needed in development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
