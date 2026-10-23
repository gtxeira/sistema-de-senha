import "server-only";

/**
 * Erro com status HTTP para a rota traduzir.
 *
 * É um `Error` de verdade (mantém stack e `instanceof Error`), com o `status`
 * que o handler usa na resposta. Prefira `routeError()` a construir à mão.
 *
 * Fica em `server/http` porque é uma preocupação da borda HTTP — os
 * repositórios o usam como transporte do erro, e as rotas o convertem em
 * status + JSON.
 */
export class RouteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RouteError";
    this.status = status;
  }
}

/** Create typed error with status for the route to translate */
export function routeError(status: number, message: string): RouteError {
  return new RouteError(status, message);
}
