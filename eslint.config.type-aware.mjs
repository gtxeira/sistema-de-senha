import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import base, { unusedVarsRules } from "./eslint.config.base.mjs";

/**
 * Lint type-aware (CI/CD): `projectService` + `recommendedTypeChecked`.
 *
 * É a superset da config leve — as regras básicas continuam valendo —, então o
 * CI precisa rodar só este arquivo. Não é o lint do dia a dia porque consulta
 * o programa de tipos inteiro: `tsc` já faz isso uma vez no `typecheck`, e o
 * ESLint repete o trabalho a cada arquivo.
 *
 * Roda com `bun run lint:type-aware`.
 */
export default defineConfig([
  ...base,
  ...tseslint.configs.recommendedTypeChecked,
  // O `recommendedTypeChecked` reativa `no-unused-vars` com os options padrão
  // (sem ignore pattern) e veio depois da base, então o override da base é
  // re-insistido aqui para valer nas duas configurações.
  ...unusedVarsRules,
  {
    // Os duplos de teste implementam contratos assíncronos (`QueueRepository`,
    // `fetch`, `Response.json()`) com corpos síncronos: `async` é a forma
    // natural de dizer "isto devolve uma Promise". A correção que a regra
    // sugere — remover `async` e desembrulhar `Promise<T>` em `T` — quebraria
    // a assinatura da interface; e o que sobra (`return Promise.resolve(…)` em
    // cada `return`, ou um `return` extra em todo método `Promise<void>`) só
    // troca legibilidade por uma microtask a mais.
    //
    // A regra continua ligada em `src`, onde um `await` esquecido é bug de
    // verdade e não um falso positivo de fábrica de mocks.
    files: ["tests/**"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    languageOptions: {
      parserOptions: {
        // Mesmo serviço dos editores: acha o tsconfig mais próximo sozinho e
        // não precisa de `project` apontando para vários arquivos.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // O `tsconfig.json` só inclui arquivos TS (`.ts`/`.tsx`/`.mts`): os
    // `.js`/`.mjs` — as configurações, `scripts/`, `main.js` — não estão em
    // nenhum projeto e não têm tipos a consultar. Sem `disableTypeChecked` o
    // projectService falharia com "file not found by project service".
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
]);
