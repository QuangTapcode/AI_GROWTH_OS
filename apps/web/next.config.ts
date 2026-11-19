import type { NextConfig } from "next";

const apiBase = process.env.API_BASE_URL || 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR ?? '.next',
  experimental: { cpus: 1 },
  async rewrites() {
    return [
      {
        source: '/v1/:path*',
        destination: `${apiBase}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
