/**
 * Stub do pacote `server-only` para o Vitest.
 *
 * Em produção o Next resolve `server-only` para o marcador que falha quando
 * o módulo é importado por um Client Component. Fora do bundler do Next —
 * como nos testes — o pacote lança por padrão; este stub mantém os módulos
 * de servidor importáveis nos testes unitários.
 */
export {};
