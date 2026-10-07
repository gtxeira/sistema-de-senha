import { globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import noRelativeImportPaths from "eslint-plugin-no-relative-import-paths";
import tseslint from "typescript-eslint";

/**
 * `no-unused-vars` com a convenção de `_`.
 *
 * Exportado à parte porque o `recommendedTypeChecked` do type-aware reativa a
 * mesma regra com os options padrão (sem o ignore pattern) e é espalhado
 * *depois* da base — quem monta a config do CI precisa re-insistir nele.
 */
export const unusedVarsRules = [
  {
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // Não vem do `nextVitals`: sem ela, import e variáveis mortos só
      // apareceriam no type-aware do CI. O prefixo `_` é a convenção para
      // "propositalmente ignorado" — um evento que o componente descarta, um
      // stub de implementação — sem o padrão toda assinatura pública com
      // parâmetro intocado seria reportada.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

/**
 * Base compartilhada pelas duas configurações:
 *
 *  - `eslint.config.mjs`               → lint do dia a dia (rápido, sem tipos);
 *  - `eslint.config.type-aware.mjs`    → lint type-aware do CI/CD (lento).
 *
 * Mantê-la num módulo próprio evita que as duas divergam: o CI só *acrescenta*
 * as regras que precisam do programa de tipos, nunca muda as regras básicas.
 */
const config = [
  ...nextVitals,
  {
    plugins: {
      "no-relative-import-paths": noRelativeImportPaths,
    },
    rules: {
      "no-relative-import-paths/no-relative-import-paths": [
        "warn",
        {
          allowSameFolder: true, // Mantém ./arquivo no mesmo diretório
          rootDir: "src", // Mapeia a pasta raiz do alias
          prefix: "@", // Define o prefixo do alias
        },
      ],
    },
  },
  ...unusedVarsRules,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cliente Prisma gerado (prisma generate) — código de terceiros.
    "src/generated/**",
    // Saída de build/ferramenta, não código da aplicação.
    "dist-electron/**",
    "coverage/**",
  ]),
];

export default config;
