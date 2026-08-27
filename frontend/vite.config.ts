import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

function readUrl(...values: Array<string | undefined>): string {
  for (const value of values) {
    const raw = value?.trim().replace(/\/$/, "");
    if (raw) {
      return raw;
    }
  }
  throw new Error("Set VITE_API_URL or BACKEND_URL in .env (no trailing slash)");
}

function readFrontendUrl(...values: Array<string | undefined>): string {
  for (const value of values) {
    const raw = value?.trim().replace(/\/$/, "");
    if (raw) {
      return raw;
    }
  }
  throw new Error("Set FRONTEND_URL in .env (no trailing slash)");
}

export default defineConfig(({ mode }) => {
  const frontendDir = __dirname;
  const repoRoot = path.resolve(__dirname, "..");
  const fromFrontend = loadEnv(mode, frontendDir, "");
  const fromRoot = loadEnv(mode, repoRoot, "");
  const apiUrl = readUrl(
    fromFrontend.VITE_API_URL,
    fromRoot.VITE_API_URL,
    process.env.VITE_API_URL,
    fromFrontend.BACKEND_URL,
    fromRoot.BACKEND_URL,
    process.env.BACKEND_URL,
  );
  const frontendUrl = readFrontendUrl(
    fromFrontend.FRONTEND_URL,
    fromRoot.FRONTEND_URL,
    process.env.FRONTEND_URL,
  );

  return {
    plugins: [react()],
    envDir: path.resolve(__dirname, ".."),
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl),
      "import.meta.env.BACKEND_URL": JSON.stringify(apiUrl),
      "import.meta.env.FRONTEND_URL": JSON.stringify(frontendUrl),
    },
    server: {
      port: 5173,
      proxy: {
        "/api": apiUrl,
      },
    },
  };
});
