import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC = ["/login"];
const PROTECTED = ["/home", "/admin", "/monitor", "/painel", "/historico"];

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

  // Raiz → /login
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Rotas públicas passam livres
  if (PUBLIC.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    // Se já autenticado e tentando acessar /login, redireciona para /home
    if (req.auth?.user && pathname === "/login") {
      return NextResponse.redirect(new URL("/home", req.url));
    }
    return NextResponse.next();
  }

  // Rotas protegidas → verifica sessão
  if (PROTECTED.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    if (!req.auth?.user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  // Qualquer outra rota → /login
  return NextResponse.redirect(new URL("/login", req.url));
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
