// app/sitemap.ts — Public pages served at /sitemap.xml
import type { MetadataRoute } from 'next';

const BASE = 'https://zarodaschool.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/retooling', '/auth/signup', '/auth/login', '/legal/privacy', '/legal/terms'].map((path) => ({
    url: `${BASE}${path}`,
    lastModified: new Date(),
  }));
}
