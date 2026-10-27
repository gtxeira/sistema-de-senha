import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Captura screenshot + métricas de uma rota para comparação antes/depois.
 *
 * Uso:
 *   bun run capture.ts <rota> <nome> [base=url] [clicar=sel] [viewport=LxA]
 *   ex.:  bun run capture.ts /home home-antes
 *         bun run capture.ts /home sub-aberto clicar="text=Monitores"
 *         bun run capture.ts /home mob-antes viewport=480x900
 *
 * Saída (em shots/):
 *   <nome>.png  — screenshot fullPage (DPR 1, light, reduced-motion)
 *   <nome>.json — métricas por elemento visível (caixa + estilos computados)
 *   state.json  — cookies da sessão (login automático nas próximas capturas)
 *
 * Detalhes:
 *   - faz login (UI_USER/UI_PASS ou admin/admin123) se a rota redirecionar
 *     para /login — as rotas autenticadas passam pelo guard do middleware;
 *   - relógio congelado para telas com hora ao vivo serem determinísticas;
 *     SE UMA TELA RENDERIZAR CONTEÚDO DEPENDENTE DE TIMER (setInterval após
 *     mount), remova a linha do page.clock — o conteúdo nunca apareceria.
 *
 * Fluxo da Fase 2: capturar ANTES de mexer na tela, migrar, capturar DEPOIS,
 * e rodar o compare.ts. Telas com mudança de UX intencional (ex.: forms que
 * viram Dialog no Admin) ficam fora da comparação.
 */
import { chromium } from 'playwright';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'shots');

const argv = process.argv.slice(2);
const flags = new Map<string, string>();
const posicionais: string[] = [];
for (const arg of argv) {
  const eq = arg.indexOf('=');
  const chave = eq > 0 ? arg.slice(0, eq) : '';
  // valores podem conter '=' (ex.: clicar=text=Monitores)
  if (['base', 'clicar', 'viewport'].includes(chave)) {
    flags.set(chave, arg.slice(eq + 1));
  } else {
    posicionais.push(arg);
  }
}

const [rota, nome] = posicionais;
const base = flags.get('base') ?? 'http://localhost:3000';
const clicar = flags.get('clicar');
const [vw, vh] = (flags.get('viewport') ?? '1440x900').split('x').map(Number);

if (!rota || !nome) {
  console.error(
    'Uso: bun run capture.ts <rota> <nome> [base=url] [clicar=sel] [viewport=LxA]',
  );
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const contexto = await browser.newContext({
  viewport: { width: vw, height: vh },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  reducedMotion: 'reduce',
  ...(existsSync(join(SHOTS, 'state.json'))
    ? { storageState: join(SHOTS, 'state.json') }
    : {}),
});
const pagina = await contexto.newPage();

// Relógio congelado: capturas determinísticas em telas com hora ao vivo.
await pagina.clock.install({ time: new Date('2026-01-05T12:00:00') });

// O relógio do header sincroniza via /api/time — congelamos a resposta
// (12:00 em America/Sao_Paulo) para o texto não mudar entre capturas.
await pagina.route('**/api/time', (r) =>
  r.fulfill({ json: { serverTime: '2026-01-05T15:00:00.000Z' } }),
);

await pagina.goto(base + rota, { waitUntil: 'networkidle' });

// Login se o middleware redirecionou (guard de sessão do servidor).
if (new URL(pagina.url()).pathname === '/login' && rota !== '/login') {
  await pagina.fill('#login', process.env.UI_USER ?? 'admin');
  await pagina.fill('#password', process.env.UI_PASS ?? 'admin123');
  await pagina.click('button[type="submit"]');
  await pagina.waitForURL((u) => new URL(u).pathname !== '/login', {
    timeout: 15_000,
  });
  await pagina.goto(base + rota, { waitUntil: 'networkidle' });
}

await pagina.evaluate(async () => {
  await document.fonts.ready;
});
await pagina.waitForTimeout(500); // deixa render/HMR assentarem

// Estado interativo opcional (ex.: submenu de monitores aberto) — o mesmo
// seletor deve ser usado nas capturas antes e depois.
if (clicar) {
  await pagina.click(clicar);
  await pagina.waitForTimeout(300);
}

// Esconde o indicador de dev do Next (chrome de desenvolvimento, não é UI
// da tela) — ele não pode poluir o screenshot nem variar entre capturas.
await pagina.addStyleTag({
  content: 'nextjs-portal { display: none !important; }',
});

const metricas = await pagina.evaluate(() => {
  const ignorar = new Set([
    'SCRIPT',
    'STYLE',
    'LINK',
    'META',
    'TITLE',
    'NOSCRIPT',
    'TEMPLATE',
  ]);

  /** Caminho resumido (tag#id[data-slot].duas-classes) — só informativo. */
  const caminho = (el: Element): string => {
    const partes: string[] = [];
    let no: Element | null = el;
    for (let n = 0; no && n < 3; n++) {
      let p = no.tagName.toLowerCase();
      if (no.id) p += `#${no.id}`;
      const slot = no.getAttribute('data-slot');
      if (slot) p += `[${slot}]`;
      const cls = (no.getAttribute('class') ?? '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .join('.');
      if (cls) p += `.${cls}`;
      partes.unshift(p);
      no = no.parentElement;
    }
    return partes.join(' > ');
  };

  const itens: Array<Record<string, number | string>> = [];
  let i = 0;
  for (const el of document.body.querySelectorAll('*')) {
    if (ignorar.has(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    itens.push({
      i: i++,
      sel: caminho(el),
      txt: (el.textContent ?? '').replaceAll(/\s+/g, ' ').trim().slice(0, 80),
      x: +r.x.toFixed(1),
      y: +r.y.toFixed(1),
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      pos: cs.position,
      disp: cs.display,
      pt: cs.paddingTop,
      pr: cs.paddingRight,
      pb: cs.paddingBottom,
      pl: cs.paddingLeft,
      mt: cs.marginTop,
      mr: cs.marginRight,
      mb: cs.marginBottom,
      ml: cs.marginLeft,
      fs: cs.fontSize,
      lh: cs.lineHeight,
      fw: cs.fontWeight,
      c: cs.color,
      bg: cs.backgroundColor,
      bw: cs.borderTopWidth,
      bc: cs.borderTopColor,
      br: cs.borderTopLeftRadius,
    });
  }
  return itens;
});

await pagina.screenshot({ path: join(SHOTS, `${nome}.png`), fullPage: true });
writeFileSync(join(SHOTS, `${nome}.json`), JSON.stringify(metricas, null, 1));
await contexto.storageState({ path: join(SHOTS, 'state.json') });
await browser.close();

console.log(
  `✓ ${nome}: ${metricas.length} elementos → shots/${nome}.png e shots/${nome}.json`,
);
