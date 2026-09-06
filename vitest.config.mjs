import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/**/*.test.{js,jsx}"],
    setupFiles: ["./tests/setup.js"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**/*.js",
        "src/app/api/**/*.js",
        "src/middleware.js",
        "src/lib/prisma.js",
        "src/lib/supabase-admin.js",
      ],
      exclude: [
        "tests/**",
        "src/**/*.test.{js,jsx}",
        "src/**/*.module.css",
      ],
      reporter: ["text", "html", "json-summary"],
    },
  },
});