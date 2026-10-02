// ============================================================
// app/layout.tsx  — Root layout
// ============================================================
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { Toaster } from 'react-hot-toast';
import InstallPrompt from '@/components/install-prompt';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://zarodaschool.com'),
  title:       { default: 'ZARODA School – School Management System for Kenyan Schools', template: '%s | ZARODA School' },
  description: 'ZARODA School is a CBC/CBE school management system for Kenya: marks, report cards, fees, M-Pesa, timetables, AI professional records and parent communication.',
  openGraph:   { siteName: 'ZARODA School', type: 'website', url: 'https://zarodaschool.com' },
  manifest:    '/manifest.json',
  icons:       { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ZARODA SMS' },
};

export const viewport: Viewport = {
  themeColor: '#1a2e5a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Set the theme class before paint to avoid a flash of the wrong theme.
  const noFlash = `(function(){try{var s=localStorage.getItem('zaroda-theme');var t='dark';if(s){t=(JSON.parse(s).state||{}).theme||'dark';}if(t==='dark')document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}})();`;
  return (
    <html lang="en" className={`${inter.className} dark`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>
        {children}
        <InstallPrompt />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { borderRadius: '12px', fontSize: '13px', fontWeight: '500' },
            success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  );
}
