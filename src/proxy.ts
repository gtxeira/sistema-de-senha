import type { NextAuthRequest } from 'next-auth';
import type { PermissionCarrier } from '@/shared/permissions';

import { NextResponse } from 'next/server';

import { auth, SESSION_COOKIE_NAME } from '@/auth';
import { REFRESH_COOKIE_NAME, SIGN_IN_PATH } from '@/shared/constants';
import {
  canAccessSector,
  hasPermission,
  matchRoute,
  SCREEN_HOME,
  sessionFreshnessProblem,
} from '@/shared/permissions';

/**
 * Sem sessão válida (ou stale/expirada): se existe um refresh cookie,
 * manda o browser pela rota de refresh (Node, com banco) — que rotaciona
 * o token, recalcula permissões e devolve os cookies — e volta para a
 * página pedida. Sem refresh, é login mesmo.
 *
 * Roda em Edge: nada de banco aqui, só claims decodificados do JWT.
 */
function resumeSessionOrLogin(
  req: NextAuthRequest,
  pathname: string,
  hasRefresh: boolean,
): NextResponse {
  if (hasRefresh) {
    const refreshUrl = new URL('/api/auth/refresh', req.url);
    refreshUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(refreshUrl);
  }
  // Nunca redirecionar para o próprio pathname (auto-loop, ex.:
  // /login → /login com cookie de sessão inválido).
  if (req.nextUrl.pathname === SIGN_IN_PATH) return NextResponse.next();
  return NextResponse.redirect(new URL(SIGN_IN_PATH, req.url));
}

/** Redireciona para a home (se a permissão de tela existir) ou /login. */
function homeOrLogin(user: PermissionCarrier, baseUrl: string): URL {
  return new URL(
    hasPermission(user, SCREEN_HOME) ? '/home' : SIGN_IN_PATH,
    baseUrl,
  );
}

/** A URL é a página de login (ou uma subrota dela)? */
function isSignInPath(pathname: string): boolean {
  return pathname === SIGN_IN_PATH || pathname.startsWith(SIGN_IN_PATH + '/');
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Ignora estáticos e APIs
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const user = req.auth?.user ?? null;
  const hasRefresh = !!req.cookies?.get?.(REFRESH_COOKIE_NAME)?.value;

  // A raiz é a única rota que o proxy não classifica: quem decide para
  // onde ela vai é o server component (src/app/page.tsx), que tem a
  // sessão em mãos. O proxy só abre espaço.
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Rota pública: passa livre, com dois ajustes — autenticado com sessão
  // boa vai para a home, e sessão stale tenta o refresh antes de renderizar.
  if (isSignInPath(pathname)) {
    // Autenticado indo para /login, com sessão boa: segue para a home.
    if (
      user &&
      !sessionFreshnessProblem(user) &&
      hasPermission(user, SCREEN_HOME)
    ) {
      return NextResponse.redirect(new URL('/home', req.url));
    }
    // Sessão stale até no /login: tenta o refresh antes de renderizar.
    // Sem refresh cookie não há como acordar — renderiza o login (o redirect
    // para /login aqui seria um loop infinito) e descarta o cookie inválido
    // até o próximo login sobrescrevê-lo.
    if (user && sessionFreshnessProblem(user)) {
      if (hasRefresh) return resumeSessionOrLogin(req, '/home', true);
      const res = NextResponse.next();
      res.cookies.delete(SESSION_COOKIE_NAME);
      return res;
    }
    return NextResponse.next();
  }

  // Qualquer outra rota exige sessão: sem ela, login (ou refresh, se há
  // como acordar a sessão).
  if (!user) {
    return resumeSessionOrLogin(req, pathname, hasRefresh);
  }

  const problem = sessionFreshnessProblem(user);
  if (problem) {
    return resumeSessionOrLogin(req, pathname, hasRefresh);
  }

  // O que a rota exige vem do registro canônico (src/shared/permissions.ts):
  // permissão de tela e, quando a rota é escopada, o setor alvo.
  const requirement = matchRoute(pathname);
  if (!requirement) {
    // Rota não registrada → fail-closed. Sem refresh aqui: a rota de
    // refresh devolveria o browser para a mesma URL e o proxy repetiria
    // o ciclo (loop de redirect).
    return NextResponse.redirect(new URL(SIGN_IN_PATH, req.url));
  }

  if (!hasPermission(user, requirement.permission)) {
    return NextResponse.redirect(homeOrLogin(user, req.url));
  }

  // /monitor/<setor>: leitura exige setor próprio ou setores.todos.ver
  if (
    requirement.sector &&
    !canAccessSector(user, requirement.sector, 'read')
  ) {
    return NextResponse.redirect(homeOrLogin(user, req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
