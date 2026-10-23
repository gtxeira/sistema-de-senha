/**
 * Fronteiras de serialização — os três pontos onde o código recebe um valor
 * sem contrato estático:
 *
 * - `Response.json()` (lado cliente) e `Request.json()` (lado rota) devolvem
 *   `any`, porque o corpo é escrito em tempo de execução pela outra ponta;
 * - `JSON.parse()` devolve `any` pelo mesmo motivo: o formato vive no
 *   storage/SSE, não no TypeScript.
 *
 * Concentrar aqui a única conversão `any → T` mantém o resto do código — e o
 * completion — tipado, com um único ponto documentado onde o tipo é um
 * palpite. O formato esperado de cada endpoint está declarado em
 * `@/shared/types/api`.
 */

/** Corpo que o Fetch API sabe ler: `Request` ou `Response`. */
interface JsonSource {
  json(): Promise<unknown>;
}

/**
 * Lê o corpo JSON de uma `Request`/`Response` assumindo o contrato `T`.
 *
 * ```ts
 * const body = await readJson<UsersListBody>(res);
 * ```
 */
export async function readJson<T>(source: JsonSource): Promise<T> {
  return (await source.json()) as T;
}

/**
 * Assume o formato de um valor já serializado (`localStorage`, payload SSE).
 *
 * Lança o mesmo `SyntaxError` do `JSON.parse` para quem chama tratar.
 */
export function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}
