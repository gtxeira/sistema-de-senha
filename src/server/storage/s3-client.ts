import 'server-only';

/**
 * Ponto de importação do runtime da aplicação: mantém o marcador `server-only`
 * (import direto em Client Component falha no build). A implementação fica em
 * `s3.ts` para poder ser reutilizada por scripts fora do Next.js, como o seed.
 */
export * from './s3';
