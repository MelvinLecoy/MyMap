import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readCloudConfig } from "./src/lib/cloud-config";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  readCloudConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
  return {
    plugins: [react()],
    base: "./",
    server: { host: "0.0.0.0" },
    build: { chunkSizeWarningLimit: 850 },
  };
});
