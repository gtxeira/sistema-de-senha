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

    // Override environment for integration tests (need Node.js for Supabase client)
    environmentMatchGlobs: [
      ["tests/integration/**", "node"],
    ],

    coverage: {
      provider: "v8",
      include: [
        "src/lib/repositories/**/*.js",
        "src/lib/queue-server.js",
        "src/lib/supabase.js",
        "src/lib/supabase-admin.js",
        "src/lib/prisma.js",
        "src/app/api/**/*.js",
        "src/middleware.js",
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
