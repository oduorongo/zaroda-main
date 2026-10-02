// app/page.tsx — Homepage route: SEO metadata + structured data around the client HomePage
import type { Metadata } from 'next';
import HomePage from '@/components/home-page';

export const metadata: Metadata = { alternates: { canonical: '/' } };

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ZARODA School',
  alternateName: ['ZARODA School Management System', 'ZARODA SMS', 'Zaroda School'],
  url: 'https://zarodaschool.com',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  publisher: {
    '@type': 'Organization',
    name: 'ZARODA Solutions',
    telephone: '+254781230805',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Ongo Place, Uriri Center',
      addressRegion: 'Migori County',
      addressCountry: 'KE',
    },
  },
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <HomePage />
    </>
  );
}
