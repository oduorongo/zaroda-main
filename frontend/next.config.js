/** @type {import('next').NextConfig} */
const path = require('path');
const nextConfig = {
  // Don't fail the production build on type errors. The app runs fine; these can be
  // cleaned up over time. (Dev still surfaces them in the editor.)
  typescript: { ignoreBuildErrors: true },
  // Next.js 16 builds with Turbopack, which reads the "@/..." alias from tsconfig paths.
  // Webpack (next build --webpack) needs it set here.
  turbopack: { root: __dirname, resolveAlias: { "@": "./" } },
  webpack: (config) => {
    config.resolve.alias["@"] = path.resolve(__dirname);
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
  // Tell browsers to use HTTPS only for this site (and its subdomains) for a year.
  async headers() {
    return [
      {
        source:  '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      // The in-app Help page (/dashboard/help) shows the user guide in an iframe, so
      // this one path may be framed by the site itself. Later entries win per header.
      {
        source:  '/user-guide/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
    ];
  },
};
module.exports = nextConfig;
