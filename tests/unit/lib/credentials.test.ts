import type {
  AuthorizedUser,
  CredentialsUser,
} from '@/server/auth/credentials';

import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeCredentials,
  LoginRateLimitError,
} from '@/server/auth/credentials';
import { __resetLoginRateLimit } from '@/server/auth/login-rate-limit';
import {
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
} from '@/shared/constants';

const T0 = 1_700_000_000_000;
const PASSWORD = 'senha-correta';
// Custo baixo de propósito: o teste não precisa dos 10 rounds de produção.
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const IP = '10.0.0.20';

function authorize(
  password: string,
  {
    findUser = vi.fn(async () => dbUser()),
    ip = IP,
    username = 'maria.silva',
  }: {
    ip?: null | string;
    username?: string;
    findUser?: (username: string) => Promise<CredentialsUser | null>;
  } = {},
): Promise<AuthorizedUser | null> {
  return authorizeCredentials({ password, username }, request(ip), {
    findUser,
    now: () => T0,
  });
}

function dbUser(overrides: Partial<CredentialsUser> = {}): CredentialsUser {
  return {
    id: 'u1',
    active: true,
    email: 'maria@local',
    full_name: 'Maria Silva',
    guiche_id: 'guiche-1',
    password_hash: PASSWORD_HASH,
    permissions: [],
    role: { permissions: [{ permission: 'tela.home' }] },
    sector_id: 'farmacia',
    ...overrides,
  };
}

async function failTimes(
  count: number,
  options: {
    ip?: null | string;
    password?: string;
    username?: string;
  } = {},
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await authorize(options.password ?? 'senha-errada', {
      findUser: async () => dbUser(),
      ip: options.ip ?? IP,
      username: options.username ?? 'maria.silva',
    });
  }
}

function request(ip: null | string = IP): Request {
  return new Request('http://localhost/api/auth/callback/credentials', {
    headers: ip ? { 'x-forwarded-for': ip } : undefined,
  });
}

describe('authorizeCredentials', () => {
  beforeEach(() => {
    __resetLoginRateLimit();
  });

  it('devolve os claims do usuário quando a senha confere', async () => {
    const user = await authorize(PASSWORD);

    expect(user).toEqual({
      id: 'u1',
      name: 'Maria Silva',
      authAt: T0,
      email: 'maria@local',
      guiche: 'guiche-1',
      permissions: ['tela.home'],
      permsAt: T0,
      sector: 'farmacia',
    });
  });

  it('cai no guichê padrão quando o usuário não tem guichê', async () => {
    const user = await authorize(PASSWORD, {
      findUser: async () => dbUser({ guiche_id: '' }),
    });

    expect(user?.guiche).toBe('none');
  });

  it('senha errada devolve null e conta a falha', async () => {
    const findUser = vi.fn(async () => dbUser());

    await expect(authorize('senha-errada', { findUser })).resolves.toBeNull();

    // A próxima tentativa ainda é permitida (1 falha < limite).
    await expect(authorize(PASSWORD, { findUser })).resolves.toMatchObject({
      id: 'u1',
    });
  });

  it('usuário inexistente conta falha sem rodar bcrypt', async () => {
    const findUser = vi.fn(async () => null);

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await expect(authorize(PASSWORD, { findUser })).resolves.toBeNull();
    }

    await expect(authorize(PASSWORD, { findUser })).rejects.toBeInstanceOf(
      LoginRateLimitError,
    );
    expect(findUser).toHaveBeenCalledTimes(LOGIN_RATE_LIMIT_MAX_ATTEMPTS);
  });

  it('conta username com formato inválido sem consultar o banco', async () => {
    const findUser = vi.fn(async () => dbUser());

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await expect(
        authorize(PASSWORD, { findUser, username: 'nome inválido' }),
      ).resolves.toBeNull();
    }

    await expect(
      authorize(PASSWORD, { findUser, username: 'nome inválido' }),
    ).rejects.toBeInstanceOf(LoginRateLimitError);
    expect(findUser).not.toHaveBeenCalled();
  });

  it('bloqueia com code rate_limited:<segundos>', async () => {
    await failTimes(LOGIN_RATE_LIMIT_MAX_ATTEMPTS);

    const error = await authorize(PASSWORD).catch((error_: unknown) => error_);

    expect(error).toBeInstanceOf(LoginRateLimitError);
    expect((error as LoginRateLimitError).code).toMatch(/^rate_limited:\d+$/);
  });

  it('login bem-sucedido zera as falhas anteriores', async () => {
    await failTimes(LOGIN_RATE_LIMIT_MAX_ATTEMPTS - 1);

    await expect(authorize(PASSWORD)).resolves.toMatchObject({ id: 'u1' });

    // Se o reset não tivesse acontecido, a próxima falha fecharia o limite.
    await expect(authorize('senha-errada')).resolves.toBeNull();
    await expect(authorize('senha-errada')).resolves.toBeNull();
  });

  it('conta a falha por IP mesmo trocando de username', async () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP; i++) {
      await failTimes(1, { username: `usuario${i}` });
    }

    await expect(
      authorize('senha-errada', { username: 'outro.usuario' }),
    ).rejects.toBeInstanceOf(LoginRateLimitError);
  });

  it('sem header de IP não aplica o limite por IP', async () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP; i++) {
      await failTimes(1, { ip: null, username: `usuario${i}` });
    }

    await expect(
      authorize(PASSWORD, { ip: null, username: 'maria.silva' }),
    ).resolves.toMatchObject({ id: 'u1' });
  });
});
