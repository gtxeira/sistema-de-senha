import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Guarda de fuso horário.
 *
 * O bug que motivou o módulo `@/shared/time` não era uma conta errada:
 * era um formatador de data que usava o fuso do PROCESSO. Em Docker o
 * processo roda em UTC, no dev na máquina do dev — o mesmo código
 * exibia horários diferentes nos dois lugares, e ninguém percebia.
 *
 * A regra que fecha isso: só `@/shared/time` cria formatador de data, e
 * nada no `src/` usa as APIs que dependem do fuso ambiente
 * (`toLocaleString` sem `timeZone`, `getTimezoneOffset`).
 *
 * A guarda é um teste porque o resto da suíte não conseguiria pegar
 * isso: um formatador sem fuso produz um valor plausível, só errado.
 */

const SRC = resolve(__dirname, '../../../src');
const TIME_MODULE = join(SRC, 'shared', 'time.ts');

/** APIs que usam o fuso do ambiente quando nenhum `timeZone` é passado. */
const AMBIENT_TZ_APIS: ReadonlyArray<{ pattern: RegExp; what: string }> = [
  { pattern: /Intl\.DateTimeFormat\s*\(/, what: 'Intl.DateTimeFormat' },
  { pattern: /\.toLocaleDateString\s*\(/, what: 'toLocaleDateString' },
  { pattern: /\.toLocaleTimeString\s*\(/, what: 'toLocaleTimeString' },
  { pattern: /\.toLocaleString\s*\(/, what: 'toLocaleString' },
  { pattern: /\.getTimezoneOffset\s*\(/, what: 'getTimezoneOffset' },
];

function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // Cliente Prisma gerado — código de terceiros, fora da nossa regra.
    if (entry === 'generated' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSources(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const sources = collectSources(SRC);

describe('guarda de fuso horário', () => {
  it('encontra arquivos para verificar (a guarda não pode varrer zero)', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it('só @/shared/time cria formatador de data', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      if (file === TIME_MODULE) continue;
      const code = readFileSync(file, 'utf-8');
      for (const { pattern } of AMBIENT_TZ_APIS) {
        if (pattern.test(code)) {
          offenders.push(relative(SRC, file));
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('@/shared/time é o dono do fuso do app', () => {
    const code = readFileSync(TIME_MODULE, 'utf-8');
    expect(code).toContain('APP_TIMEZONE');
    // Todo formatador passa o `timeZone` explicitamente.
    expect(code).toMatch(/timeZone/);
  });

  it('nenhum módulo formata data sem passar pelo módulo de tempo', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      if (file === TIME_MODULE) continue;
      const code = readFileSync(file, 'utf-8');
      if (/Intl\.DateTimeFormat|\.toLocale/.test(code)) {
        offenders.push(relative(SRC, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
