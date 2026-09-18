/** @type {import('next').NextConfig} */
const nextConfig = {
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
      {
        // Projeto de DEV
        protocol: "https",
        hostname: "nrjbkcniuyvdailmqcta.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        // Projeto de PRODUÇÃO
        protocol: "https",
        hostname: "qarydpctwdzsagwmtady.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  allowedDevOrigins: ['192.168.18.75'],
};

export default nextConfig;
