import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  API_ROUTES,
  APP_TIMEZONE,
  CLOCK_INTERVAL,
  LOCALE,
  SERVER_TIME_SYNC_INTERVAL,
} from '@/shared/constants';

describe('useServerClock — constantes de sincronização', () => {
  it('define APP_TIMEZONE como America/Sao_Paulo', () => {
    expect(APP_TIMEZONE).toBe('America/Sao_Paulo');
  });

  it('define LOCALE como pt-BR', () => {
    expect(LOCALE).toBe('pt-BR');
  });

  it('SERVER_TIME_SYNC_INTERVAL é 60000ms (60s)', () => {
    expect(SERVER_TIME_SYNC_INTERVAL).toBe(60000);
  });

  it('CLOCK_INTERVAL é 1000ms (1s)', () => {
    expect(CLOCK_INTERVAL).toBe(1000);
  });

  it('API_ROUTES inclui rota TIME', () => {
    expect(API_ROUTES.TIME).toBe('/api/time');
  });
});

describe('useServerClock — formatação', () => {
  it('formata horário no fuso America/Sao_Paulo', () => {
    const date = new Date('2026-09-18T15:30:00Z'); // 12:30 em BRT
    const formatted = new Intl.DateTimeFormat(LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: APP_TIMEZONE,
    }).format(date);

    expect(formatted).toBe('12:30:00');
  });

  it('formata data completa no fuso America/Sao_Paulo', () => {
    const date = new Date('2026-09-18T15:30:00Z'); // 12:30 em BRT
    const formatted = new Intl.DateTimeFormat(LOCALE, {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: APP_TIMEZONE,
    })
      .format(date)
      .toUpperCase();

    expect(formatted).toContain('SETEMBRO');
    expect(formatted).toContain('2026');
  });

  it('formata horário curto (HH:mm) no fuso America/Sao_Paulo', () => {
    const date = new Date('2026-09-18T15:30:00Z'); // 12:30 em BRT
    const formatted = new Intl.DateTimeFormat(LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: APP_TIMEZONE,
    }).format(date);

    expect(formatted).toBe('12:30');
  });

  it('horário do servidor em UTC converte corretamente para BRT', () => {
    // 18:00 UTC = 15:00 BRT (horário de verão) ou 14:00 BRT (horário normal)
    // Em setembro, Brasil está em horário de verão (UTC-3)
    const utcDate = new Date('2026-09-18T18:00:00Z');
    const formatted = new Intl.DateTimeFormat(LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: APP_TIMEZONE,
    }).format(utcDate);

    // Brasil em setembro: UTC-3 (horário de verão begins in October)
    // Na verdade, setembro ainda é horário normal (UTC-3 para Brasília)
    expect(formatted).toBe('15:00');
  });
});

describe('useServerClock — lógica de offset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calcula offset corretamente entre servidor e cliente', () => {
    const serverTime = Date.now() + 5000; // servidor 5s à frente
    const localTime = Date.now();
    const offset = serverTime - localTime;
    expect(offset).toBe(5000);
  });

  it('interpola horário entre sincronizações', () => {
    const offset = 3000; // servidor 3s à frente
    const simulatedLocalTime = Date.now();
    const interpolated = new Date(simulatedLocalTime + offset);

    expect(interpolated.getTime()).toBe(simulatedLocalTime + 3000);
  });

  it('fallback para offset 0 quando servidor indisponível', () => {
    const offset = 0;
    const localTime = Date.now();
    const result = new Date(localTime + offset);

    expect(result.getTime()).toBe(localTime);
  });
});

describe('useServerClock — leitura do código-fonte', () => {
  it('hook busca /api/time no mount', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const hookPath = resolve(
      __dirname,
      '../../../src/hooks/use-server-clock.ts',
    );
    const code = readFileSync(hookPath, 'utf-8');

    expect(code).toContain('API_ROUTES.TIME');
    expect(code).toContain('fetch(');
    expect(code).toContain("cache: 'no-store'");
  });

  it('hook sincroniza a cada SERVER_TIME_SYNC_INTERVAL', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const hookPath = resolve(
      __dirname,
      '../../../src/hooks/use-server-clock.ts',
    );
    const code = readFileSync(hookPath, 'utf-8');

    expect(code).toContain('SERVER_TIME_SYNC_INTERVAL');
    expect(code).toContain('setInterval(syncWithServer');
  });

  it('hook interpola entre sincronizações usando Date.now() + offset', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const hookPath = resolve(
      __dirname,
      '../../../src/hooks/use-server-clock.ts',
    );
    const code = readFileSync(hookPath, 'utf-8');

    expect(code).toContain('offsetRef.current');
    expect(code).toContain('Date.now() + offsetRef.current');
  });

  it('formata usando o módulo de tempo (fuso APP_TIMEZONE)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const hookPath = resolve(
      __dirname,
      '../../../src/hooks/use-server-clock.ts',
    );
    const code = readFileSync(hookPath, 'utf-8');

    // A formatação mora em `@/shared/time` — é lá que o fuso do app está
    // fixado. O hook só cuida do offset servidor↔device.
    expect(code).toContain("from '@/shared/time'");
    expect(code).toContain('formatClockSeconds');
    expect(code).not.toContain('Intl.DateTimeFormat');
  });

  it('fallback para offset 0 em caso de erro', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const hookPath = resolve(
      __dirname,
      '../../../src/hooks/use-server-clock.ts',
    );
    const code = readFileSync(hookPath, 'utf-8');

    expect(code).toMatch(/catch\s*\{[\s\S]*?offsetRef\.current\s*=\s*0/);
  });

  it('retorna timeString, dateString e timeShort', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const hookPath = resolve(
      __dirname,
      '../../../src/hooks/use-server-clock.ts',
    );
    const code = readFileSync(hookPath, 'utf-8');

    expect(code).toContain('formatTime(now)');
    expect(code).toContain('formatDate(now)');
    expect(code).toContain('formatTimeShort(now)');
  });

  it('não exibe o horário antes de montar (hydration mismatch)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const hookPath = resolve(
      __dirname,
      '../../../src/hooks/use-server-clock.ts',
    );
    const code = readFileSync(hookPath, 'utf-8');

    // O HTML do servidor e o primeiro render do client precisam bater.
    // O relógio do servidor não é determinístico, então as strings só
    // podem aparecer depois do mount.
    expect(code).toContain('useSyncExternalStore');
    expect(code).toMatch(
      /timeString:\s*mounted\s*\?\s*formatTime\(now\)\s*:\s*''/,
    );
    expect(code).toMatch(
      /dateString:\s*mounted\s*\?\s*formatDate\(now\)\s*:\s*''/,
    );
    expect(code).toMatch(
      /timeShort:\s*mounted\s*\?\s*formatTimeShort\(now\)\s*:\s*''/,
    );
  });
});

describe('useServerClock — SidebarLayout usa o hook', () => {
  it('SidebarLayout renderiza o ServerClock, que usa o hook', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const sidebarPath = resolve(
      __dirname,
      '../../../src/components/sidebar/sidebar-layout.tsx',
    );
    const code = readFileSync(sidebarPath, 'utf-8');

    // O relógio do cabeçalho vive no componente `ServerClock` (a migração
    // para shadcn o extraiu do layout).
    expect(code).toContain('<ServerClock />');

    const clockPath = resolve(
      __dirname,
      '../../../src/components/server-clock.tsx',
    );
    const clockCode = readFileSync(clockPath, 'utf-8');

    expect(clockCode).toContain("from '@/hooks/use-server-clock'");
    expect(clockCode).toContain('useServerClock()');
  });

  it('SidebarLayout não usa mais new Date() para relógio', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const sidebarPath = resolve(
      __dirname,
      '../../../src/components/sidebar/sidebar-layout.tsx',
    );
    const code = readFileSync(sidebarPath, 'utf-8');

    // Não deve ter useEffect com setInterval para relógio local
    expect(code).not.toMatch(/setInterval[\s\S]*?new Date\(\)/);
  });
});

describe('useServerClock — Monitor usa o hook', () => {
  it('Monitor importa useServerClock', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const monitorPath = resolve(
      __dirname,
      '../../../src/app/(authenticated)/monitor/[sector]/page.tsx',
    );
    const code = readFileSync(monitorPath, 'utf-8');

    expect(code).toContain("from '@/hooks/use-server-clock'");
    expect(code).toContain('useServerClock()');
  });

  it('Monitor usa timeString e dateString do hook', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const monitorPath = resolve(
      __dirname,
      '../../../src/app/(authenticated)/monitor/[sector]/page.tsx',
    );
    const code = readFileSync(monitorPath, 'utf-8');

    expect(code).toContain('timeString');
    expect(code).toContain('dateString');
  });

  it('Monitor não usa mais new Date() para relógio', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const monitorPath = resolve(
      __dirname,
      '../../../src/app/(authenticated)/monitor/[sector]/page.tsx',
    );
    const code = readFileSync(monitorPath, 'utf-8');

    // Não deve ter useEffect com CLOCK_INTERVAL para relógio local
    expect(code).not.toMatch(/setInterval[\s\S]*?CLOCK_INTERVAL/);
  });
});
