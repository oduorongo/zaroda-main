// ============================================================
// app/auth/layout.tsx
// ============================================================
// Auth pages change often (signup forms in particular) and must never be frozen
// as a static snapshot — confirmed root cause of a referral going uncredited: the
// referred teacher's signup hit an old cached build of /auth/signup-individual from
// before the referral `?ref=` capture code shipped, so it never reached the backend.
export const dynamic = 'force-dynamic';

// Light background on purpose — a dark hero photo behind these forms was very
// hard to read on a phone outdoors in daylight glare (low-contrast white text
// over a photo washes out in direct sun). A plain light background keeps every
// label and input readable at any time of day.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#d4af37]/10 rounded-full blur-3xl -translate-y-20 translate-x-20"/>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#1a2e5a]/5 rounded-full blur-3xl translate-y-20"/>
      <div className="relative z-10 w-full flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
