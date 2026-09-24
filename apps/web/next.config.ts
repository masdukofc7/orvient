import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.DOCKER === 'true' ? 'standalone' : undefined,
  reactStrictMode: true,
  transpilePackages: ['@inventory/shared'],
};

export default nextConfig;
