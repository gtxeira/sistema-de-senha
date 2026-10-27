/**
 * Rate limit de tentativas de login.
 *
 * O estado vive em memória, por processo: o deploy atual é um container único
 * (`output: standalone`). Múltiplas réplicas exigiriam um armazenamento
 * compartilhado, mas o limite por username continua sendo a barreira
 * principal contra brute force.
 *
 * Módulo Edge-safe de propósito: `credentials.ts` é carregado pelo
 * `proxy.ts` via `@/auth` → `config.ts`, e o proxy roda em Edge. Nada de
 * `node:*` aqui — só `Map` e `Date.now`.
 */
import {
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
  LOGIN_RATE_LIMIT_MAX_KEYS,
  LOGIN_RATE_LIMIT_WINDOW_MS,
} from '@/shared/constants';

/** Uma chave de rate limit e o teto de falhas dentro da janela. */
export interface RateLimitKey {
  readonly key: string;
  readonly max: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Test seam. */
export function __resetLoginRateLimit(): void {
  buckets.clear();
}

/**
 * Consulta se alguma das chaves estourou o limite.
 *
 * @returns `null` quando liberado; senão o maior `retryAfter` entre as chaves.
 */
export function checkLoginRateLimit(
  keys: readonly RateLimitKey[],
  now: number = Date.now(),
): { readonly retryAfterSeconds: number } | null {
  let retryAfterSeconds = 0;

  for (const { key, max } of keys) {
    const bucket = buckets.get(key);
    if (!bucket) continue;

    if (bucket.resetAt <= now) {
      buckets.delete(key);
      continue;
    }
    if (bucket.count < max) continue;

    retryAfterSeconds = Math.max(
      retryAfterSeconds,
      Math.ceil((bucket.resetAt - now) / 1000),
    );
  }

  return retryAfterSeconds > 0 ? { retryAfterSeconds } : null;
}

/**
 * IP do cliente segundo os headers de proxy.
 *
 * `x-forwarded-for` pode conter uma cadeia (`cliente, proxy1, proxy2`); o
 * primeiro valor é o cliente. Sem header (dev, acesso direto), devolve `null`
 * e o limite por IP não é aplicado — evita que todo mundo compartilhe o
 * mesmo bucket "desconhecido".
 */
export function clientIp(request: Request): null | string {
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  if (forwarded) return forwarded;

  const real = request.headers.get('x-real-ip')?.trim();
  return real || null;
}

/** Chaves aplicadas a uma tentativa: username sempre, IP quando disponível. */
export function loginRateLimitKeys(
  username: string,
  ip: null | string,
): RateLimitKey[] {
  const keys: RateLimitKey[] = [
    { key: `username:${username}`, max: LOGIN_RATE_LIMIT_MAX_ATTEMPTS },
  ];
  if (ip) {
    keys.push({
      key: `ip:${ip}`,
      max: LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
    });
  }
  return keys;
}

/**
 * Registra uma falha de credenciais (nunca um login bem-sucedido).
 *
 * A janela é fixa: a primeira falha abre a janela e as seguintes só
 * incrementam até `resetAt`.
 */
export function recordLoginFailure(
  keys: readonly RateLimitKey[],
  now: number = Date.now(),
): void {
  prune(now);

  for (const { key } of keys) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS,
      });
      continue;
    }
    bucket.count += 1;
  }
}

/** Zera as chaves de uma tentativa bem-sucedida. */
export function resetLoginRateLimit(keys: readonly RateLimitKey[]): void {
  for (const { key } of keys) buckets.delete(key);
}

/**
 * Descarta janelas vencidas quando o Map chega ao teto e, se ainda assim
 * estourar, remove as entradas mais antigas (ordem de inserção do `Map`).
 * Sem isso, usernames aleatórios cresceriam o Map indefinidamente.
 */
function prune(now: number): void {
  if (buckets.size < LOGIN_RATE_LIMIT_MAX_KEYS) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  while (buckets.size >= LOGIN_RATE_LIMIT_MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}
