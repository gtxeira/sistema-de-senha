import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Gera `.next/standalone` (servidor mínimo com node_modules rastreado)
  // para a imagem de produção — ver Dockerfile, estágio `runner`.
  output: 'standalone',

  allowedDevOrigins: ['192.168.18.75'],
  images: {
    remotePatterns: [
      {
        // Garage / S3 compatível local
        hostname: 'localhost',
        pathname: '/**',
        port: '3900',
        protocol: 'http',
      },
    ],
  },
  turbopack: {
    root: process.cwd(),
  },

  // Valida `href`/`router.push()` literalmente contra as rotas da aplicação.
  typedRoutes: true,

  experimental: {
    // Gera `.d.ts` em `.next/types` com IntelliSense de `process.env`.
    typedEnv: true,
  },
};

export default nextConfig;
