/**
 * Entrypoint de autenticação do Next.
 *
 * A configuração do Auth.js vive em `src/server/auth/config.ts` (backend);
 * este arquivo existe só para o Next — `proxy.ts`, layouts e a rota
 * `/api/auth/[...nextauth]` importam `@/auth`. Mantê-lo como reexport fino
 * deixa a fronteira explícita: nada de lógica aqui.
 */
export {
  auth,
  handlers,
  SESSION_COOKIE_NAME,
  signIn,
  signOut,
} from '@/server/auth/config';
