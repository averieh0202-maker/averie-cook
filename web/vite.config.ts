import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pagesBase =
    process.env.VITE_BASE ||
    env.VITE_BASE ||
    (mode === "pages" ? "/" : mode === "production" ? "/averie-cook/" : "/");

  return {
    base: pagesBase,
    plugins: [
      react(),
      {
        name: "spa-github-pages-404",
        closeBundle() {
          const index = resolve("dist/index.html");
          if (existsSync(index)) {
            copyFileSync(index, resolve("dist/404.html"));
            writeFileSync(resolve("dist/.nojekyll"), "");
          }
        },
      },
    ],
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
        "/health": { target: "http://127.0.0.1:8787", changeOrigin: true },
      },
    },
    preview: {
      port: 4173,
      host: true,
      proxy: {
        "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
        "/health": { target: "http://127.0.0.1:8787", changeOrigin: true },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
          },
        },
      },
    },
  };
});
