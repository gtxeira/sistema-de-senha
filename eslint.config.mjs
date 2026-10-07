import { defineConfig } from "eslint/config";
import base from "./eslint.config.base.mjs";

/**
 * Lint rápido do dia a dia: só regras estáticas, sem `projectService`.
 *
 * O lint que consulta o programa de tipos vive em
 * `eslint.config.type-aware.mjs` e roda via `bun run lint:type-aware` (CI/CD).
 */
export default defineConfig(base);
