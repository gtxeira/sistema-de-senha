import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { matchRoute, ROUTE_RULES } from "@/lib/permissions";
import { SIGN_IN_PATH } from "@/lib/constants";

/**
 * Anti-drift entre o **filesystem** e o **registro de rotas**.
 *
 * O registro canônico (`ROUTE_RULES`, em `src/lib/permissions.ts`) é o que o
 * proxy usa para saber o que cada rota exige. Este teste garante que ele
 * acompanha a aplicação: uma página nova que ninguém registrou não pode
 * existir — o proxy trata "rota não registrada" como **negado**, então o
 * esquecimento viraria um bug de acesso (a tela abriria para qualquer
 * usuário autenticado, sem a checagem de permissão).
 *
 * É este teste que substitui as listas `PUBLIC`/`PROTECTED` que o proxy
 * mantinha: em vez de uma constante que ninguém lembra de atualizar, a
 * lista é conferida contra o código a cada rodada de testes.
 */

// `src/app` a partir da raiz do repositório (o arquivo do teste mora em
// `tests/unit/app/`). O caminho é resolvido com `node:path` — o `URL` do
// happy-dom não resolve o base `file://` como o do Node.
const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../src/app");

/** Nomes de arquivo que o App Router trata como página de rota. */
const PAGE_FILES = ["page.tsx", "page.ts", "page.jsx", "page.js"];

/** Todos os arquivos de página sob `src/app`. */
function findPageFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findPageFiles(full));
    else if (PAGE_FILES.includes(entry.name)) found.push(full);
  }
  return found;
}

/**
 * URL pública da rota a partir do arquivo da página.
 *
 * Some com o nome do arquivo e com os route groups (`(authenticated)`) —
 * que organizam as pastas mas não entram na URL. Segmentos dinâmicos
 * (`[sector]`) viram um valor de exemplo, porque o registro casa por
 * prefixo.
 */
function routeUrl(file: string): string {
  const segments = relative(APP_DIR, file)
    .split(sep)
    // `page.tsx` vira o próprio segmento da rota.
    .filter((segment) => !PAGE_FILES.includes(segment))
    // Route groups `(authenticated)` e rotas interceptadas `(.)x` não são
    // parte da URL; slots de rota paralela (`@modal`) também não.
    .filter((segment) => !segment.startsWith("(") && !segment.startsWith("@"))
    .map((segment) => (segment.startsWith("[") ? "exemplo" : segment));
  return `/${segments.join("/")}`;
}

/** URLs de todas as páginas do app. */
const pageUrls = findPageFiles(APP_DIR).map(routeUrl);

describe("registro de rotas (anti-drift com src/app)", () => {
  it("o app tem páginas para conferir", () => {
    expect(pageUrls.length).toBeGreaterThan(0);
  });

  it("a página de login existe no path declarado em SIGN_IN_PATH", () => {
    expect(pageUrls).toContain(SIGN_IN_PATH);
  });

  it("toda página do app está classificada no registro de rotas", () => {
    const naoClassificadas = pageUrls.filter(
      (url) =>
        url !== "/" && url !== SIGN_IN_PATH && matchRoute(url) === null,
    );
    expect(naoClassificadas).toEqual([]);
  });

  it("toda regra do registro corresponde a uma página do app", () => {
    const orfas = ROUTE_RULES.filter(
      (rule) =>
        !pageUrls.some(
          (url) => url === rule.prefix || url.startsWith(`${rule.prefix}/`),
        ),
    );
    expect(orfas.map((rule) => rule.prefix)).toEqual([]);
  });
});
