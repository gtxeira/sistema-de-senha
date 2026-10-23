/**
 * `Request` pronta para chamar um handler de rota.
 *
 * Os testes montavam objetos `{ json: () => … }` / `{ url: … }` à mão; com a
 * rota tipada como `(req: Request) => …`, só um `Request` de verdade compila —
 * e é o que o news route já usava.
 *
 * `body` definido ⇒ POST JSON; ausente ⇒ só a URL (os handlers de
 * GET/DELETE leem `searchParams`, não o método).
 */
export function routeRequest(url: string, body?: unknown): Request {
  const init: RequestInit =
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        };
  return new Request(url, init);
}
