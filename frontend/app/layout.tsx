// ============================================================
// app/layout.tsx  — Root layout
// ============================================================
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title:       'ZARODA School Management System',
  description: 'Kenya CBC/CBE-aligned school management — INNOVATIVE. RELIABLE. FORWARD.',
  icons:       { icon: '/favicon.ico' },
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
