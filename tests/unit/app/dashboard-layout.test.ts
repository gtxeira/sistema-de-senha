import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Arquitetura do layout do dashboard.
 *
 * O layout de `(dashboard)` é um **server component**: ele lê a sessão no
 * servidor (`auth()`) e a publica na árvore via `ServerSessionProvider`.
 * Isso é o que faz o HTML sair com o usuário real — com a sessão lida só
 * no client, a página carregava o fallback "Atendente" e o menu
 * "Administração" só aparecia depois da hidratação.
 *
 * O que o server component **não** pode fazer: ler a URL (`usePathname` é
 * de client por design do App Router) e ler a store de layout — que ainda
 * guarda o setor em foco e as ações do cabeçalho, publicadas pelas
 * páginas.
 *
 * E o título da tela não mora mais em store: cada página renderiza o seu
 * `<PageHeader>`, então ele já sai no HTML.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf-8');

const LAYOUT = 'src/app/(authenticated)/(dashboard)/layout.tsx';
const SIDEBAR_LAYOUT = 'src/components/sidebar/sidebar-layout.tsx';
const LAYOUT_STORE = 'src/stores/use-dashboard-layout-store.ts';
const LAYOUT_HOOK = 'src/hooks/use-set-dashboard-layout-info.ts';

/** Páginas do dashboard — todas renderizam o próprio cabeçalho. */
const DASHBOARD_PAGES = [
  'src/app/(authenticated)/(dashboard)/home/page.tsx',
  'src/app/(authenticated)/(dashboard)/painel/page.tsx',
  'src/app/(authenticated)/(dashboard)/historico/page.tsx',
  'src/app/(authenticated)/(dashboard)/admin/page.tsx',
];

describe('layout do dashboard — server component', () => {
  it('não é client component', () => {
    expect(read(LAYOUT)).not.toMatch(/^\s*["']use client["']/m);
  });

  it('lê a sessão no servidor, com auth()', () => {
    const code = read(LAYOUT);
    expect(code).toContain("from '@/auth'");
    expect(code).toContain('await auth()');
  });

  it('publica a sessão na árvore via ServerSessionProvider', () => {
    const code = read(LAYOUT);
    expect(code).toContain('ServerSessionProvider');
    expect(code).toContain('session?.user ?? null');
  });

  it('não lê a store de layout (só o client pode)', () => {
    expect(read(LAYOUT)).not.toContain('useDashboardLayoutStore');
  });
});

describe('layout do dashboard — o client herda o que precisa', () => {
  it('SidebarLayout lê a rota ativa com usePathname', () => {
    const code = read(SIDEBAR_LAYOUT);
    expect(code).toContain('usePathname');
    expect(code).toContain('activeRoute');
  });

  it('SidebarLayout usa a sessão efetiva (servidor + store)', () => {
    const code = read(SIDEBAR_LAYOUT);
    expect(code).toContain('useEffectiveSession');
  });

  it('SidebarLayout lê o setor e as ações do cabeçalho na store', () => {
    const code = read(SIDEBAR_LAYOUT);
    expect(code).toContain('useDashboardLayoutStore');
    expect(code).toContain('s.sectorInfo');
    expect(code).toContain('s.headerActions');
  });
});

describe('título da tela — renderizado pela página, não por store', () => {
  it('a store de layout não guarda mais o título', () => {
    const code = read(LAYOUT_STORE);
    // Campos de estado (`eyebrow:`, `title?:`, …) — e não a prosa do
    // comentário, que pode voltar a citar o nome do campo.
    expect(code).not.toMatch(/\beyebrow\s*[:?]/);
    expect(code).not.toMatch(/\btitle\s*[:?]/);
    expect(code).not.toMatch(/\bsubtitle\s*[:?]/);
    expect(code).not.toContain('setHeaderTitle');
  });

  it('o hook de publicação não aceita mais título', () => {
    const code = read(LAYOUT_HOOK);
    expect(code).not.toMatch(/\beyebrow\s*[:?]/);
    expect(code).not.toMatch(/\btitle\s*[:?]/);
    expect(code).not.toMatch(/\bsubtitle\s*[:?]/);
  });

  it.each(DASHBOARD_PAGES)('%s renderiza o próprio PageHeader', (page) => {
    const code = read(page);
    expect(code).toContain('<PageHeader');
  });
});
