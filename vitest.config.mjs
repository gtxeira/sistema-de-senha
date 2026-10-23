import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

import { checkIsRunningInDocker } from './scripts/check-is-running-in-docker.js';
import { loadEnvFile } from './scripts/load-env-file.js';

export default defineConfig(() => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const testEnv = loadEnvFile(resolve(root, '.env.test'));

  const isDocker = checkIsRunningInDocker();

  const s3Endpoint = isDocker
    ? testEnv.S3_ENDPOINT.replace('localhost', 'garage')
    : testEnv.S3_ENDPOINT;

  return {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // Em produção o Next resolve `server-only` para o marcador que
        // rejeita imports em Client Components. Nos testes o pacote lança
        // por padrão, então apontamos para um stub vazio.
        'server-only': fileURLToPath(
          new URL('./tests/stubs/server-only.ts', import.meta.url),
        ),
      },
    },
    test: {
      environment: 'happy-dom',
      fileParallelism: false,
      globals: true,
      include: ['tests/**/*.test.{js,jsx,ts,tsx}'],
      setupFiles: ['./tests/setup.ts'],

      env: {
        DATABASE_URL: testEnv.DATABASE_URL,
        S3_ACCESS_KEY: testEnv.S3_ACCESS_KEY,
        S3_BUCKET: testEnv.S3_BUCKET,
        S3_ENDPOINT: s3Endpoint,
        S3_PUBLIC_URL: testEnv.S3_PUBLIC_URL,
        S3_REGION: testEnv.S3_REGION,
        S3_SECRET_KEY: testEnv.S3_SECRET_KEY,
      },

      server: {
        deps: {
          inline: ['next-auth', 'next'],
        },
      },

      coverage: {
        exclude: [
          'tests/**',
          'src/**/*.test.{js,jsx,ts,tsx}',
          'src/**/*.module.css',
          // Cliente Prisma gerado — não é código nosso.
          'src/server/generated/**',
        ],
        include: [
          'src/server/**/*.ts',
          'src/client/**/*.ts',
          'src/shared/**/*.ts',
          'src/hooks/**/*.ts',
          'src/app/api/**/*.ts',
          'src/proxy.ts',
        ],
        provider: 'v8',
        reporter: ['text', 'html', 'json-summary'],
      },
    },
  };
});
