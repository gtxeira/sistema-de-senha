import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  APP_NAME,
  APP_TITLE_SEPARATOR,
  APP_TITLE_TEMPLATE,
  PAGE_TITLES,
} from '@/shared/page-title';

/**
 * Anti-drift entre as **rotas do app** e os **títulos de aba**.
 *
 * O título da aba é montado pelo layout raiz (`title.template`): nome da
 * tela + separador + nome do sistema. Cada rota define o nome da sua
 * tela no registro `PAGE_TITLES` — e como a API de metadata só existe em
 * server components, ele é exportado pelo layout do segmento (as páginas
 * são client components).
 *
 * Este teste garante que nenhuma rota fique sem título (aba com o nome
 * genérico do sistema) e que nenhum título registrado aponte para uma
 * rota que não existe mais.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const APP_DIR = resolve(ROOT, 'src/app');

/** Nomes de arquivo que o App Router trata como página de rota. */
const PAGE_FILES = ['page.tsx', 'page.ts', 'page.jsx', 'page.js'];
/** Nomes de arquivo que o App Router trata como layout de segmento. */
const LAYOUT_FILES = ['layout.tsx', 'layout.ts', 'layout.jsx', 'layout.js'];

const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf-8');

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

/** Layout do mesmo diretório da página (o que carrega o metadata). */
function layoutOf(pageFile: string): undefined | string {
  const dir = dirname(pageFile);
  for (const entry of readdirSync(dir)) {
    if (LAYOUT_FILES.includes(entry)) return join(dir, entry);
  }
  return undefined;
}

/**
 * Padrão de rota da página — como no registro de permissões
 * (`ROUTE_RULES`), o segmento dinâmico continua escrito (`[sector]`), e
 * os route groups (`(authenticated)`) saem da URL.
 */
function routePattern(file: string): string {
  const segments = relative(APP_DIR, file)
    .split(sep)
    .filter((segment) => !PAGE_FILES.includes(segment))
    .filter((segment) => !segment.startsWith('(') && !segment.startsWith('@'));
  return `/${segments.join('/')}`;
}

const pageFiles = findPageFiles(APP_DIR);
const routePatterns = pageFiles.map((file) => routePattern(file));

describe('título de aba — montagem', () => {
  it('o template é o nome da tela + separador + nome do sistema', () => {
    expect(APP_TITLE_TEMPLATE).toBe(`%s${APP_TITLE_SEPARATOR}${APP_NAME}`);
    expect(APP_TITLE_SEPARATOR).toBe(' | ');
    expect(APP_NAME).toBe('Sistema de Atendimento por Senhas');
  });

  it('o layout raiz usa o template e o título padrão', () => {
    const code = read('src/app/layout.tsx');
    expect(code).toContain('template: APP_TITLE_TEMPLATE');
    expect(code).toContain('default: APP_NAME');
  });
});

describe('título de aba — anti-drift com as rotas do app', () => {
  it('toda rota do app tem título registrado', () => {
    const semTitulo = routePatterns.filter(
      (route) => route !== '/' && !(route in PAGE_TITLES),
    );
    expect(semTitulo).toEqual([]);
  });

  it('todo título registrado corresponde a uma rota do app', () => {
    const orfas = Object.keys(PAGE_TITLES).filter(
      (route) => !routePatterns.includes(route),
    );
    expect(orfas).toEqual([]);
  });

  it('todo título registrado tem texto', () => {
    for (const [route, title] of Object.entries(PAGE_TITLES)) {
      expect(title.trim(), `título vazio em ${route}`).not.toBe('');
    }
  });

  it('cada página (fora da raiz) tem um layout que traz o título do registro', () => {
    for (const page of pageFiles) {
      const route = routePattern(page);
      // A raiz só redireciona: quem define o título padrão é o layout raiz.
      if (route === '/') continue;

      const layout = layoutOf(page);
      expect(layout, `rota ${route} sem layout`).toBeDefined();
      expect(read(layout!), `layout de ${route} sem título`).toContain(
        'PAGE_TITLES',
      );
    }
  });
});

describe('título de aba — monitor por setor', () => {
  it('o monitor gera o título a partir do setor da URL', () => {
    const code = read('src/app/(authenticated)/monitor/[sector]/layout.tsx');
    expect(code).toContain('generateMetadata');
    expect(code).toContain("PAGE_TITLES['/monitor/[sector]']");
    expect(code).toContain('getSector');
  });
});
