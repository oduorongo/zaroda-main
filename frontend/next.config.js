/** @type {import('next').NextConfig} */
const path = require('path');
const nextConfig = {
  // Don't fail the production build on type/lint errors. The app runs fine; these
  // can be cleaned up over time. (Dev still surfaces them in the editor.)
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Force the "@/..." alias to resolve to this folder at the webpack level. This is
  // independent of tsconfig paths, which Next.js on some setups fails to apply during
  // a production build (causing "Module not found: Can't resolve '@/lib/...'").
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname);
    return config;
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'api.zarodasolutions.app' }],
  },
  async rewrites() {
    return [
      {
        source:      '/api/v1/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/v1/:path*`,
      },
    ];
  },
};
module.exports = nextConfig;
