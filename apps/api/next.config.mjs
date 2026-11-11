/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_BUILD_DIR ?? '.next',
  experimental: { cpus: 1 },
};

export default nextConfig;
