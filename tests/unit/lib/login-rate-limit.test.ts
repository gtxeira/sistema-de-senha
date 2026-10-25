import { beforeEach, describe, expect, it } from 'vitest';

import {
  __resetLoginRateLimit,
  checkLoginRateLimit,
  clientIp,
  loginRateLimitKeys,
  recordLoginFailure,
  resetLoginRateLimit,
} from '@/server/auth/login-rate-limit';
import {
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
  LOGIN_RATE_LIMIT_WINDOW_MS,
} from '@/shared/constants';

const T0 = 1_700_000_000_000;
const USER = 'maria.silva';
const IP = '10.0.0.10';

function keys(username = USER, ip: null | string = IP) {
  return loginRateLimitKeys(username, ip);
}

describe('login-rate-limit', () => {
  beforeEach(() => {
    __resetLoginRateLimit();
  });

  it('libera enquanto o usuário está abaixo do limite', () => {
    for (let i = 1; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i++) {
      recordLoginFailure(keys(), T0);
      expect(checkLoginRateLimit(keys(), T0)).toBeNull();
    }
  });

  it('bloqueia no limite e devolve retryAfter até o fim da janela', () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i++) {
      recordLoginFailure(keys(), T0);
    }
    recordLoginFailure(keys(), T0);

    const result = checkLoginRateLimit(keys(), T0);

    expect(result).not.toBeNull();
    expect(result?.retryAfterSeconds).toBe(
      Math.ceil(LOGIN_RATE_LIMIT_WINDOW_MS / 1000),
    );
  });

  it('libera de novo quando a janela vence', () => {
    for (let i = 0; i <= LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i++) {
      recordLoginFailure(keys(), T0);
    }
    expect(checkLoginRateLimit(keys(), T0)).not.toBeNull();

    const afterWindow = T0 + LOGIN_RATE_LIMIT_WINDOW_MS + 1;
    expect(checkLoginRateLimit(keys(), afterWindow)).toBeNull();
  });

  it('login bem-sucedido zera as chaves', () => {
    for (let i = 0; i <= LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i++) {
      recordLoginFailure(keys(), T0);
    }
    expect(checkLoginRateLimit(keys(), T0)).not.toBeNull();

    resetLoginRateLimit(keys());

    expect(checkLoginRateLimit(keys(), T0)).toBeNull();
    // E a janela recomeça do zero.
    recordLoginFailure(keys(), T0);
    expect(checkLoginRateLimit(keys(), T0)).toBeNull();
  });

  it('isola usuários: falhas de um não bloqueiam o outro no mesmo IP', () => {
    for (let i = 0; i <= LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i++) {
      recordLoginFailure(keys(USER, IP), T0);
    }

    expect(checkLoginRateLimit(keys(USER, IP), T0)).not.toBeNull();
    expect(checkLoginRateLimit(keys('joao.souza', IP), T0)).toBeNull();
  });

  it('limita o IP mesmo com usernames diferentes', () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP; i++) {
      recordLoginFailure(keys(`usuario${i}`, IP), T0);
    }
    recordLoginFailure(keys('mais.um', IP), T0);

    const result = checkLoginRateLimit(keys('outro.usuario', IP), T0);
    expect(result).not.toBeNull();
    expect(result?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('sem IP só a chave de username é aplicada', () => {
    const semIp = keys(USER, null);

    expect(semIp).toHaveLength(1);
    expect(semIp[0]?.key).toBe(`username:${USER}`);
  });

  it('clientIp prefere x-forwarded-for e cai para x-real-ip', () => {
    const forwarded = new Request('http://localhost/api/auth/callback', {
      headers: {
        'x-forwarded-for': '203.0.113.7, 10.0.0.1',
        'x-real-ip': '10.0.0.1',
      },
    });
    expect(clientIp(forwarded)).toBe('203.0.113.7');

    const real = new Request('http://localhost/api/auth/callback', {
      headers: { 'x-real-ip': '198.51.100.9' },
    });
    expect(clientIp(real)).toBe('198.51.100.9');

    const none = new Request('http://localhost/api/auth/callback');
    expect(clientIp(none)).toBeNull();
  });
});
