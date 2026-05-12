import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Express server (src/server/api) owns the dev port and mounts Vite as
// middleware, so this config no longer needs a /api proxy. `vite build` still
// uses this for the production client bundle written to `dist/`.
export default defineConfig({
  plugins: [react()],
});
