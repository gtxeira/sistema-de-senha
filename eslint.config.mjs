import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import noRelativeImportPaths from "eslint-plugin-no-relative-import-paths";

const eslintConfig = defineConfig([
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
          rootDir: "src",        // Mapeia a pasta raiz do alias
          prefix: "@",           // Define o prefixo do alias
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cliente Prisma gerado (prisma generate) — código de terceiros.
    "src/generated/**",
  ]),
]);

export default eslintConfig;