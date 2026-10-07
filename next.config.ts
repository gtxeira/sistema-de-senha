import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        // Garage / S3 compatível local
        protocol: "http",
        hostname: "localhost",
        port: "3900",
        pathname: "/**",
      },
    ],
  },
  allowedDevOrigins: ["192.168.18.75"],

  // Valida `href`/`router.push()` literalmente contra as rotas da aplicação.
  typedRoutes: true,

  experimental: {
    // Gera `.d.ts` em `.next/types` com IntelliSense de `process.env`.
    typedEnv: true,
  },
};

export default nextConfig;
