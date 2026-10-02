// app/robots.ts — Crawler rules served at /robots.txt
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/admin', '/owner', '/teacher', '/onboard', '/invite', '/auth/reset-password'],
    },
    sitemap: 'https://zarodaschool.com/sitemap.xml',
    host: 'https://zarodaschool.com',
  };
}
