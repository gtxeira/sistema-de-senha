import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Compara duas capturas feitas pelo capture.ts (antes vs depois).
 *
 * Uso:
 *   bun run compare.ts <antes> <depois> [--limite=0.999]
 *   ex.:  bun run compare.ts home-antes home-depois
 *
 * Critérios de FALHA (exit 1):
 *   - razão de pixels iguais < limite (padrão 99,9%);
 *   - dimensões do screenshot diferentes (altura da página mudou);
 *   - contagem de elementos diferente;
 *   - alguma caixa (x/y/w/h) divergindo > 0,5px;
 *   - algum estilo computado (cor/padding/fonte/borda...) ou texto divergindo.
 * O caminho do elemento (`sel`) é ignorado de propósito: as classes mudam
 * durante a migração — o que interessa é caixa + estilos computados.
 *
 * Saídas: relatório no terminal + shots/<antes>-vs-<depois>.diff.png.
 *
 * Exceção combinada: telas com mudança de UX intencional (ex.: formulários
 * que viram Dialog no Admin) — não rode a comparação nelas.
 */
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'shots');
const args = process.argv.slice(2);
const limiteArg = args.find((a) => a.startsWith('--limite='));
const limite = limiteArg ? Number(limiteArg.split('=')[1]) : 0.999;
const [antes, depois] = args.filter((a) => !a.startsWith('--'));

if (!antes || !depois) {
  console.error('Uso: bun run compare.ts <antes> <depois> [--limite=0.999]');
  process.exit(1);
}

type Item = Record<string, string | number>;

const ler = (nome: string, ext: string): Buffer =>
  readFileSync(join(SHOTS, `${nome}.${ext}`));

/* ── 1. Diferença pixel a pixel ── */
const imgA = PNG.sync.read(ler(antes, 'png'));
const imgB = PNG.sync.read(ler(depois, 'png'));

let razao = 1;
let difPixeis = 0;
let dimensoesIguais = true;
const caminhoDiff = join(SHOTS, `${antes}-vs-${depois}.diff.png`);

if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
  dimensoesIguais = false;
} else {
  const diff = new PNG({ width: imgA.width, height: imgA.height });
  difPixeis = pixelmatch(
    imgA.data,
    imgB.data,
    diff.data,
    imgA.width,
    imgA.height,
    {
      threshold: 0.1,
    },
  );
  razao = 1 - difPixeis / (imgA.width * imgA.height);
  writeFileSync(caminhoDiff, PNG.sync.write(diff));
}

/* ── 2. Diferença nas métricas (caixas + estilos computados) ── */
const metA: Item[] = JSON.parse(ler(antes, 'json').toString('utf8'));
const metB: Item[] = JSON.parse(ler(depois, 'json').toString('utf8'));

const GEO = new Set(['x', 'y', 'w', 'h']);
const IGNORAR = new Set(['i', 'sel']); // sel muda na migração (classes novas)
const divergencias: string[] = [];
let geo = 0;
let estilo = 0;
let texto = 0;

if (metA.length !== metB.length) {
  divergencias.push(`elementos: ${metA.length} → ${metB.length}`);
}

const n = Math.min(metA.length, metB.length);
for (let i = 0; i < n; i++) {
  const a = metA[i];
  const b = metB[i];
  for (const k of Object.keys(a)) {
    if (IGNORAR.has(k)) continue;
    const va = a[k];
    const vb = b[k];
    if (va === vb) continue;
    if (GEO.has(k) && typeof va === 'number' && typeof vb === 'number') {
      if (Math.abs(va - vb) <= 0.5) continue; // subpixel é ruído
      geo++;
    } else if (k === 'txt') {
      texto++;
    } else {
      estilo++;
    }
    if (divergencias.length < 40) {
      divergencias.push(`#${i} ${a.sel} · ${k}: ${va} → ${vb}`);
    }
  }
}

/* ── 3. Veredito ── */
const ok =
  dimensoesIguais &&
  razao >= limite &&
  metA.length === metB.length &&
  geo === 0 &&
  estilo === 0 &&
  texto === 0;

console.log(`── ui-compare: ${antes} vs ${depois} ──`);
if (!dimensoesIguais) {
  console.log(
    `pixels : DIMENSÕES DIFERENTES ${imgA.width}×${imgA.height} → ${imgB.width}×${imgB.height}`,
  );
} else {
  console.log(
    `pixels : ${(razao * 100).toFixed(3)}% iguais (${difPixeis} de ${imgA.width * imgA.height}) → shots/${antes}-vs-${depois}.diff.png`,
  );
}
console.log(
  `métricas: ${metA.length} vs ${metB.length} elementos | geo ${geo} | estilo ${estilo} | texto ${texto}`,
);
if (divergencias.length > 0) {
  console.log('primeiras divergências:');
  for (const d of divergencias.slice(0, 15)) console.log(`  ${d}`);
}
console.log(ok ? '✓ OK — UIs equivalentes' : '✗ FALHA — UIs divergem');
process.exit(ok ? 0 : 1);
