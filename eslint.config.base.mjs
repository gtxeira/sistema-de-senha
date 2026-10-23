import { globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import noRelativeImportPaths from 'eslint-plugin-no-relative-import-paths';
import tseslint from 'typescript-eslint';

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
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      // Não vem do `nextVitals`: sem ela, import e variáveis mortos só
      // apareceriam no type-aware do CI. O prefixo `_` é a convenção para
      // "propositalmente ignorado" — um evento que o componente descarta, um
      // stub de implementação — sem o padrão toda assinatura pública com
      // parâmetro intocado seria reportada.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
];

/**
 * Regras de fronteira entre as camadas.
 *
 * `no-restricted-imports` é estático e roda nos dois lints (rápido e
 * type-aware). A ideia é que a pasta diga o lado do código:
 *
 *  - `client`/`components`/`hooks`/`stores` → não importam `server`;
 *  - `server` → não importa UI;
 *  - `shared` → não importa nenhum dos dois (é contrato puro);
 *  - `app/api` → pode importar `server`/`shared`, mas não UI.
 *
 * O `server-only` cobre o caso que o lint não vê: um Client Component
 * importando um módulo de servidor por engano.
 */
const boundary = (patterns) => ({
  rules: {
    'no-restricted-imports': ['error', { patterns }],
  },
});

const uiBoundary = boundary([
  {
    group: ['@/server/*'],
    message:
      'Código de UI não pode importar backend. Use a API HTTP ou tipos de @/shared.',
  },
]);

const serverBoundary = boundary([
  {
    group: [
      '@/app/*',
      '@/components/*',
      '@/hooks/*',
      '@/stores/*',
      '@/client/*',
    ],
    message:
      'Código de servidor não pode importar UI. Mantenha a regra no service/rota.',
  },
]);

const sharedBoundary = boundary([
  {
    group: [
      '@/server/*',
      '@/client/*',
      '@/app/*',
      '@/components/*',
      '@/hooks/*',
      '@/stores/*',
    ],
    message:
      'Código compartilhado deve ser puro: sem backend, UI ou runtime específico.',
  },
]);

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
      'no-relative-import-paths': noRelativeImportPaths,
    },
    rules: {
      'no-relative-import-paths/no-relative-import-paths': [
        'warn',
        {
          allowSameFolder: true, // Mantém ./arquivo no mesmo diretório
          rootDir: 'src', // Mapeia a pasta raiz do alias
          prefix: '@', // Define o prefixo do alias
        },
      ],
    },
  },
  {
    files: [
      'src/components/**/*.{ts,tsx}',
      'src/hooks/**/*.{ts,tsx}',
      'src/stores/**/*.{ts,tsx}',
      'src/client/**/*.{ts,tsx}',
    ],
    ...uiBoundary,
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    ...sharedBoundary,
  },
  {
    files: ['src/server/**/*.{ts,tsx}'],
    ...serverBoundary,
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    ...boundary([
      {
        group: ['@/server/*'],
        message:
          'Páginas não importam backend diretamente. Use a API HTTP ou `@/auth` para sessão.',
      },
    ]),
  },
  {
    // As rotas são a borda HTTP: podem importar `server`, mas não UI.
    files: ['src/app/api/**/*.{ts,tsx}'],
    ...boundary([
      {
        group: ['@/components/*', '@/hooks/*', '@/stores/*', '@/client/*'],
        message: 'Rotas de API não importam UI.',
      },
    ]),
  },
  ...unusedVarsRules,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Cliente Prisma gerado (prisma generate) — código de terceiros.
    'src/server/generated/**',
    // Saída de build/ferramenta, não código da aplicação.
    'dist-electron/**',
    'coverage/**',
  ]),
];

export default config;
