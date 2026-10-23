import { defineConfig, type DummyRule } from "oxlint";

const typeAwareRules: Record<string, "error"> = {
  "no-array-constructor": "error",
  "no-unused-expressions": "error",
  "typescript/await-thenable": "error",
  "typescript/ban-ts-comment": "error",
  "typescript/no-array-delete": "error",
  "typescript/no-base-to-string": "error",
  "typescript/no-duplicate-enum-values": "error",
  "typescript/no-duplicate-type-constituents": "error",
  "typescript/no-empty-object-type": "error",
  "typescript/no-explicit-any": "error",
  "typescript/no-extra-non-null-assertion": "error",
  "typescript/no-floating-promises": "error",
  "typescript/no-for-in-array": "error",
  "typescript/no-implied-eval": "error",
  "typescript/no-misused-new": "error",
  "typescript/no-misused-promises": "error",
  "typescript/no-namespace": "error",
  "typescript/no-non-null-asserted-optional-chain": "error",
  "typescript/no-redundant-type-constituents": "error",
  "typescript/no-require-imports": "error",
  "typescript/no-this-alias": "error",
  "typescript/no-unnecessary-type-assertion": "error",
  "typescript/no-unnecessary-type-constraint": "error",
  "typescript/no-unsafe-argument": "error",
  "typescript/no-unsafe-assignment": "error",
  "typescript/no-unsafe-call": "error",
  "typescript/no-unsafe-declaration-merging": "error",
  "typescript/no-unsafe-enum-comparison": "error",
  "typescript/no-unsafe-function-type": "error",
  "typescript/no-unsafe-member-access": "error",
  "typescript/no-unsafe-return": "error",
  "typescript/no-unsafe-unary-minus": "error",
  "typescript/no-wrapper-object-types": "error",
  "typescript/only-throw-error": "error",
  "typescript/prefer-as-const": "error",
  "typescript/prefer-namespace-keyword": "error",
  "typescript/prefer-promise-reject-errors": "error",
  "typescript/require-await": "error",
  "typescript/restrict-plus-operands": "error",
  "typescript/restrict-template-expressions": "error",
  "typescript/triple-slash-reference": "error",
  "typescript/unbound-method": "error",
};


/**
 * Oxlint do projeto: lint rápido e type-aware no mesmo arquivo.
 *
 * O lint do dia a dia (`bun run lint`) executa só as regras estáticas. O CI
 * roda `bun run lint:type-aware`, que acrescenta as 42 regras que consultam o
 * programa de tipos. O Oxlint ignora regras type-aware quando `--type-aware`
 * não é passado, então não há duas configurações para manter em sincronia.
 */

/**
 * JS/MJS/CJS não fazem parte do projeto TypeScript (`tsconfig.json` só inclui
 * `.ts`/`.tsx`/`.mts`). Sem desligar as regras type-aware nesses arquivos, os
 * scripts `.js` viram uma tempestade de `no-unsafe-*` — o equivalente ao
 * `disableTypeChecked` do ESLint antigo.
 *
 * As duas regras base (`no-array-constructor` e `no-unused-expressions`) não
 * dependem de tipos e continuam valendo em JS.
 */
const disableTypeAwareForJs = Object.fromEntries(
  Object.keys(typeAwareRules)
    .filter((rule) => rule.startsWith("typescript/"))
    .map((rule) => [rule, "off"]),
) as Record<string, "off">;

/**
 * Convenções de estilo do projeto herdadas do ESLint. Ficam fora do bloco de
 * regras do Next para deixar claro o que é paridade e o que é escolha nossa.
 */
const projectRules: Record<string, DummyRule> = {
  "no-use-before-define": [
    "error",
    { classes: true, functions: false, variables: true },
  ],
  "typescript/consistent-type-definitions": ["error", "interface"],
  "typescript/consistent-type-imports": [
    "error",
    { fixStyle: "separate-type-imports", prefer: "type-imports" },
  ],
  "typescript/consistent-type-exports": "error",
  "arrow-body-style": ["error", "as-needed"],
  "prefer-arrow-callback": "error",
};

/**
 * Perfectionist: ordenação de imports, tipos, membros e objetos.
 *
 * `sort-imports` usa grupos aninhados com `newlinesBetween: 0`; por isso o
 * Oxfmt fica com `sortImports: false`. O Oxfmt cuida de formatação e da ordem
 * das classes Tailwind; o Perfectionist cuida da ordem semântica.
 */
const perfectionistRules: Record<string, DummyRule> = {
  "perfectionist/sort-imports": [
    "error",
    {
      groups: [
        "type-import",
        { newlinesBetween: 0 },
        ["type-builtin", "type-external"],
        { newlinesBetween: 0 },
        "type-internal",
        { newlinesBetween: 0 },
        ["type-parent", "type-sibling", "type-index"],
        ["builtin", "external"],
        "internal",
        { newlinesBetween: 0 },
        ["parent", "sibling", "index"],
      ],
      newlinesBetween: 1,
      order: "asc",
      type: "natural",
    },
  ],
  "perfectionist/sort-named-imports": [
    "error",
    { order: "asc", type: "natural" },
  ],
  "perfectionist/sort-exports": ["error", { order: "asc", type: "natural" }],
  "perfectionist/sort-named-exports": [
    "error",
    { order: "asc", type: "natural" },
  ],
  "perfectionist/sort-interfaces": [
    "error",
    {
      customGroups: [
        {
          elementNamePattern: "^(?:id|_id|uuid|slug|name|title)$",
          groupName: "top",
          selector: "property",
        },
        {
          elementNamePattern: "^(?:createdAt|updatedAt|deletedAt)$",
          groupName: "bottom",
          selector: "property",
        },
      ],
      groups: [
        "top",
        "required-member",
        "optional-member",
        "method",
        "multiline-member",
        "bottom",
      ],
      order: "asc",
      type: "natural",
    },
  ],
  "perfectionist/sort-object-types": [
    "error",
    {
      customGroups: [
        {
          elementNamePattern: "^(?:id|_id|uuid|slug|name|title)$",
          groupName: "top",
          selector: "property",
        },
        {
          elementNamePattern: "^(?:createdAt|updatedAt|deletedAt)$",
          groupName: "bottom",
          selector: "property",
        },
      ],
      groups: [
        "top",
        "required-member",
        "optional-member",
        "method",
        "multiline-member",
        "bottom",
      ],
      order: "asc",
      type: "natural",
    },
  ],
  "perfectionist/sort-modules": [
    "error",
    {
      groups: [
        "export-type",
        "export-interface",
        "export-enum",
        "export-class",
        "export-default-function",
        "export-function",
        "declare-type",
        "type",
        "declare-interface",
        "interface",
        "declare-enum",
        "enum",
        "declare-function",
        "function",
        "declare-class",
        "class",
        "unknown",
      ],
      order: "asc",
      type: "natural",
    },
  ],
  "perfectionist/sort-union-types": [
    "error",
    {
      groups: [
        "literal",
        "named",
        "conditional",
        "operator",
        "tuple",
        "object",
        "function",
        "nullish",
      ],
      order: "asc",
      type: "natural",
    },
  ],
  "perfectionist/sort-intersection-types": [
    "error",
    { groups: ["named", "object", "unknown"], order: "asc", type: "natural" },
  ],
  "perfectionist/sort-variable-declarations": [
    "error",
    { order: "asc", type: "natural" },
  ],
  "perfectionist/sort-enums": ["error", { order: "asc", type: "natural" }],
  "perfectionist/sort-classes": [
    "error",
    {
      groups: [
        "index-signature",
        "static-property",
        "property",
        "constructor",
        "static-method",
        "method",
      ],
      order: "asc",
      type: "natural",
    },
  ],
  "perfectionist/sort-heritage-clauses": [
    "error",
    { order: "asc", type: "natural" },
  ],
  "perfectionist/sort-import-attributes": [
    "error",
    { order: "asc", type: "natural" },
  ],
  "perfectionist/sort-export-attributes": [
    "error",
    { order: "asc", type: "natural" },
  ],
  "perfectionist/sort-array-includes": [
    "error",
    { order: "asc", type: "natural" },
  ],
  "perfectionist/sort-objects": [
    "error",
    {
      customGroups: [
        {
          elementNamePattern: "^(?:id|_id|uuid|slug|name|title)$",
          groupName: "top",
        },
        {
          elementNamePattern: "^(?:createdAt|updatedAt|deletedAt)$",
          groupName: "bottom",
        },
      ],
      groups: ["top", "unknown", "bottom"],
      order: "asc",
      partitionByComment: true,
      partitionByNewLine: true,
      type: "natural",
    },
  ],
};

/**
 * Unicorn: as mesmas regras que já valiam no ESLint.
 */
const unicornRules: Record<string, DummyRule> = {
  "unicorn/no-array-callback-reference": "error",
  "unicorn/no-instanceof-array": "error",
  "unicorn/no-this-assignment": "error",
  "unicorn/error-message": "error",
  "unicorn/require-number-to-fixed-digits-argument": "error",
  "unicorn/catch-error-name": "error",
  "unicorn/throw-new-error": "error",
  "unicorn/prefer-node-protocol": "error",
  "unicorn/prefer-string-trim-start-end": "error",
  "unicorn/prefer-string-replace-all": "error",
  "unicorn/prefer-number-properties": "error",
  "unicorn/prefer-array-flat-map": "error",
  "unicorn/prefer-array-flat": "error",
  "unicorn/prefer-at": "error",
  "unicorn/prefer-includes": "error",
  "unicorn/prefer-negative-index": "error",
  "unicorn/prefer-object-from-entries": "error",
  "unicorn/prefer-spread": "error",
  "unicorn/no-nested-ternary": "error",
  "unicorn/no-lonely-if": "error",
  "unicorn/no-useless-undefined": "error",
  "unicorn/no-console-spaces": "error",
};

/**
 * Paridade com `eslint-config-next/core-web-vitals`.
 *
 * `react/no-unsafe` é 0 (off) no Next; `no-deprecated` não existe no Oxlint.
 * `react-hooks/*` do Next vira `react/*` no Oxlint.
 */
const nextParityRules: Record<string, DummyRule> = {
  "react/display-name": "error",
  "react/jsx-key": "error",
  "react/jsx-no-comment-textnodes": "error",
  "react/jsx-no-duplicate-props": "error",
  "react/jsx-no-target-blank": "off",
  "react/jsx-no-undef": "error",
  "react/no-children-prop": "error",
  "react/no-danger-with-children": "error",
  "react/no-direct-mutation-state": "error",
  "react/no-find-dom-node": "error",
  "react/no-is-mounted": "error",
  "react/no-render-return-value": "error",
  "react/no-string-refs": "error",
  "react/no-unescaped-entities": "error",
  "react/no-unknown-property": "off",
  "react/no-unsafe": "off",
  "react/react-in-jsx-scope": "off",
  "react/require-render-return": "error",
  "react/rules-of-hooks": "error",
  "react/exhaustive-deps": "warn",
  "react/static-components": "error",
  "react/use-memo": "error",
  "react/preserve-manual-memoization": "error",
  "react/incompatible-library": "warn",
  "react/immutability": "error",
  "react/globals": "error",
  "react/refs": "error",
  "react/set-state-in-effect": "error",
  "react/error-boundaries": "error",
  "react/purity": "error",
  "react/set-state-in-render": "error",
  "react/unsupported-syntax": "warn",

  "nextjs/google-font-display": "warn",
  "nextjs/google-font-preconnect": "warn",
  "nextjs/next-script-for-ga": "warn",
  "nextjs/no-async-client-component": "warn",
  "nextjs/no-before-interactive-script-outside-document": "warn",
  "nextjs/no-css-tags": "warn",
  "nextjs/no-head-element": "warn",
  "nextjs/no-html-link-for-pages": "error",
  "nextjs/no-img-element": "warn",
  "nextjs/no-page-custom-font": "warn",
  "nextjs/no-styled-jsx-in-document": "warn",
  "nextjs/no-sync-scripts": "error",
  "nextjs/no-title-in-document-head": "warn",
  "nextjs/no-typos": "warn",
  "nextjs/no-unwanted-polyfillio": "warn",
  "nextjs/inline-script-id": "error",
  "nextjs/no-assign-module-variable": "error",
  "nextjs/no-document-import-in-page": "error",
  "nextjs/no-duplicate-head": "error",
  "nextjs/no-head-import-in-document": "error",
  "nextjs/no-script-component-in-head": "error",
};

/**
 * A11y: o Next liga exatamente seis regras. As demais ficam desligadas para
 * não introduzir achados novos (shadcn/false positives) no meio da migração.
 */
const a11yParityRules: Record<string, DummyRule> = {
  "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
  "jsx-a11y/aria-props": "warn",
  "jsx-a11y/aria-proptypes": "warn",
  "jsx-a11y/aria-unsupported-elements": "warn",
  "jsx-a11y/role-has-required-aria-props": "warn",
  "jsx-a11y/role-supports-aria-props": "warn",

  "jsx-a11y/anchor-ambiguous-text": "off",
  "jsx-a11y/anchor-has-content": "off",
  "jsx-a11y/anchor-is-valid": "off",
  "jsx-a11y/aria-activedescendant-has-tabindex": "off",
  "jsx-a11y/aria-role": "off",
  "jsx-a11y/autocomplete-valid": "off",
  "jsx-a11y/click-events-have-key-events": "off",
  "jsx-a11y/control-has-associated-label": "off",
  "jsx-a11y/heading-has-content": "off",
  "jsx-a11y/html-has-lang": "off",
  "jsx-a11y/iframe-has-title": "off",
  "jsx-a11y/img-redundant-alt": "off",
  "jsx-a11y/interactive-supports-focus": "off",
  "jsx-a11y/label-has-associated-control": "off",
  "jsx-a11y/lang": "off",
  "jsx-a11y/media-has-caption": "off",
  "jsx-a11y/mouse-events-have-key-events": "off",
  "jsx-a11y/no-access-key": "off",
  "jsx-a11y/no-aria-hidden-on-focusable": "off",
  "jsx-a11y/no-autofocus": "off",
  "jsx-a11y/no-distracting-elements": "off",
  "jsx-a11y/no-interactive-element-to-noninteractive-role": "off",
  "jsx-a11y/no-noninteractive-element-interactions": "off",
  "jsx-a11y/no-noninteractive-element-to-interactive-role": "off",
  "jsx-a11y/no-noninteractive-tabindex": "off",
  "jsx-a11y/no-redundant-roles": "off",
  "jsx-a11y/no-static-element-interactions": "off",
  "jsx-a11y/prefer-tag-over-role": "off",
  "jsx-a11y/scope": "off",
  "jsx-a11y/tabindex-no-positive": "off",
};

/**
 * Tailwind: o Oxfmt ordena as classes; o plugin só valida correção.
 * As regras de ordem/quebra de linha ficariam brigando com o formatter.
 */
const tailwindRules: Record<string, DummyRule> = {
  "better-tailwindcss/enforce-consistent-class-order": "off",
  "better-tailwindcss/enforce-consistent-line-wrapping": "off",
  "better-tailwindcss/no-duplicate-classes": "error",
  "better-tailwindcss/no-unknown-classes": "error",
  "better-tailwindcss/no-conflicting-classes": "error",
  "better-tailwindcss/no-deprecated-classes": "error",
  "better-tailwindcss/no-concatenated-classes": "error",
  "better-tailwindcss/enforce-canonical-classes": "error",
  "better-tailwindcss/no-unnecessary-whitespace": "error",
};

/**
 * Fronteiras entre camadas. Mesmas regras e mensagens do ESLint antigo.
 */
function boundary(
  patterns: Array<{ group: string[]; message: string }>,
): { rules: Record<string, DummyRule> } {
  return {
    rules: {
      "no-restricted-imports": ["error", { patterns }],
    },
  };
}

const uiBoundary = boundary([
  {
    group: ["@/server/*"],
    message:
      "Código de UI não pode importar backend. Use a API HTTP ou tipos de @/shared.",
  },
]);

const serverBoundary = boundary([
  {
    group: [
      "@/app/*",
      "@/components/*",
      "@/hooks/*",
      "@/stores/*",
      "@/client/*",
    ],
    message:
      "Código de servidor não pode importar UI. Mantenha a regra no service/rota.",
  },
]);

const sharedBoundary = boundary([
  {
    group: [
      "@/server/*",
      "@/client/*",
      "@/app/*",
      "@/components/*",
      "@/hooks/*",
      "@/stores/*",
    ],
    message:
      "Código compartilhado deve ser puro: sem backend, UI ou runtime específico.",
  },
]);

const appBoundary = boundary([
  {
    group: ["@/server/*"],
    message:
      "Páginas não importam backend diretamente. Use a API HTTP ou `@/auth` para sessão.",
  },
]);

const apiBoundary = boundary([
  {
    group: ["@/components/*", "@/hooks/*", "@/stores/*", "@/client/*"],
    message: "Rotas de API não importam UI.",
  },
]);

export default defineConfig({
  plugins: [
    "eslint",
    "typescript",
    "unicorn",
    "oxc",
    "import",
    "react",
    "jsx-a11y",
    "nextjs",
  ],
  jsPlugins: [
    "eslint-plugin-perfectionist",
    "eslint-plugin-better-tailwindcss",
  ],
  settings: {
    "better-tailwindcss": {
      entryPoint: "./src/app/globals.css",
    },
  },
  ignorePatterns: [
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/server/generated/**",
    "dist-electron/**",
    "coverage/**",
    "**/node_modules/**",
    // Skills e assets de ferramentas externas, não código da aplicação.
    ".agents/**",
    ".claude/**",
    // Configuração do próprio linter; evita auto-lint recursivo.
    "oxlint.config.ts",
    "eslint.config.*",
  ],
  rules: {
    ...typeAwareRules,
    ...projectRules,
    ...perfectionistRules,
    ...unicornRules,
    ...nextParityRules,
    ...a11yParityRules,
    ...tailwindRules,
    "typescript/no-unused-vars": [
      "error",
      {
        args: "after-used",
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "import/no-anonymous-default-export": "warn",
  },
  overrides: [
    {
      // JS/MJS/CJS fora do projeto TS: sem regras type-aware.
      files: ["**/*.{js,mjs,cjs}"],
      rules: disableTypeAwareForJs,
    },
    {
      // Os duplos de teste implementam contratos assíncronos com corpos
      // síncronos; a correção da regra quebraria a assinatura da interface.
      files: ["tests/**"],
      rules: {
        "typescript/require-await": "off",
      },
    },
    {
      // A regra nativa não tem autofix e os testes usam imports relativos
      // entre pastas de propósito; em `src` o alias `@/` é a convenção.
      files: ["src/**/*.{ts,tsx}"],
      rules: {
        "import/no-relative-parent-imports": "error",
      },
    },
    {
      files: [
        "src/components/**/*.{ts,tsx}",
        "src/hooks/**/*.{ts,tsx}",
        "src/stores/**/*.{ts,tsx}",
        "src/client/**/*.{ts,tsx}",
      ],
      ...uiBoundary,
    },
    {
      files: ["src/shared/**/*.{ts,tsx}"],
      ...sharedBoundary,
    },
    {
      files: ["src/server/**/*.{ts,tsx}"],
      ...serverBoundary,
    },
    {
      files: ["src/app/**/*.{ts,tsx}"],
      ...appBoundary,
    },
    {
      // As rotas são a borda HTTP: podem importar `server`, mas não UI.
      // Precisa vir depois do override de `src/app/**` para substituir a regra.
      files: ["src/app/api/**/*.{ts,tsx}"],
      ...apiBoundary,
    },
    {
      // Componentes do shadcn são código de upstream; ordenar objetos e
      // módulos só cria diff contra o `shadcn add`. Imports/tipos continuam.
      files: ["src/components/ui/**/*.{ts,tsx}"],
      rules: {
        "perfectionist/sort-objects": "off",
        "perfectionist/sort-modules": "off",
      },
    },
    {
      // Mapa de estilos do comparador visual: a ordem das chaves é intencional.
      files: ["scripts/ui-compare/**/*.{ts,tsx}"],
      rules: {
        "perfectionist/sort-objects": "off",
      },
    },
  ],
});
