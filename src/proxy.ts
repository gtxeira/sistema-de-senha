import { auth, SESSION_COOKIE_NAME } from "@/auth";
import { NextResponse } from "next/server";
import { REFRESH_COOKIE_NAME } from "@/lib/constants";
import {
  SCREEN_HOME,
  canAccessSector,
  hasPermission,
  monitorSectorFor,
  screenPermissionFor,
  sessionFreshnessProblem,
} from "@/lib/permissions";
import type { PermissionCarrier } from "@/lib/permissions";
import type { NextAuthRequest } from "next-auth";

const PUBLIC = ["/login"];
const PROTECTED = ["/home", "/admin", "/monitor", "/painel", "/historico"];

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
    const refreshUrl = new URL("/api/auth/refresh", req.url);
    refreshUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(refreshUrl);
  }
  // Nunca redirecionar para o próprio pathname (auto-loop, ex.:
  // /login → /login com cookie de sessão inválido).
  if (req.nextUrl.pathname === "/login") return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

/** Redireciona para a home (se a permissão de tela existir) ou /login. */
function homeOrLogin(user: PermissionCarrier, baseUrl: string): URL {
  return new URL(hasPermission(user, SCREEN_HOME) ? "/home" : "/login", baseUrl);
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Ignora estáticos e APIs
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const user = req.auth?.user ?? null;
  const hasRefresh = !!req.cookies?.get?.(REFRESH_COOKIE_NAME)?.value;

  // Raiz → /home
  if (pathname === "/") {
    if (user && !sessionFreshnessProblem(user)) {
      return NextResponse.redirect(new URL("/home", req.url));
    }
    return resumeSessionOrLogin(req, "/home", hasRefresh);
  }

  // Rotas públicas passam livres
  if (PUBLIC.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    // Autenticado indo para /login, com sessão boa: segue para a home.
    if (
      user &&
      !sessionFreshnessProblem(user) &&
      pathname === "/login" &&
      hasPermission(user, SCREEN_HOME)
    ) {
      return NextResponse.redirect(new URL("/home", req.url));
    }
    // Sessão stale até no /login: tenta o refresh antes de renderizar.
    // Sem refresh cookie não há como acordar — renderiza o login (o redirect
    // para /login aqui seria um loop infinito) e descarta o cookie inválido
    // até o próximo login sobrescrevê-lo.
    if (user && sessionFreshnessProblem(user)) {
      if (hasRefresh) return resumeSessionOrLogin(req, "/home", true);
      const res = NextResponse.next();
      res.cookies.delete(SESSION_COOKIE_NAME);
      return res;
    }
    return NextResponse.next();
  }

  // Rotas protegidas → sessão + frescor + permissão de tela + escopo
  if (PROTECTED.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    if (!user) {
      return resumeSessionOrLogin(req, pathname, hasRefresh);
    }

    const problem = sessionFreshnessProblem(user);
    if (problem) {
      return resumeSessionOrLogin(req, pathname, hasRefresh);
    }

    const required = screenPermissionFor(pathname);
    if (required && !hasPermission(user, required)) {
      return NextResponse.redirect(homeOrLogin(user, req.url));
    }

    // /monitor/<setor>: leitura exige setor próprio ou setores.todos.ver
    const monitorSector = monitorSectorFor(pathname);
    if (monitorSector && !canAccessSector(user, monitorSector, "read")) {
      return NextResponse.redirect(homeOrLogin(user, req.url));
    }

    return NextResponse.next();
  }

  // Qualquer outra rota → /login (ou refresh, se há como acordar a sessão)
  return resumeSessionOrLogin(req, pathname, hasRefresh);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
