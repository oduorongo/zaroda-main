// ============================================================
// app/auth/layout.tsx
// ============================================================
// Auth pages change often (signup forms in particular) and must never be frozen
// as a static snapshot — confirmed root cause of a referral going uncredited: the
// referred teacher's signup hit an old cached build of /auth/signup-individual from
// before the referral `?ref=` capture code shipped, so it never reached the backend.
export const dynamic = 'force-dynamic';

// Brand navy hero photo behind every auth page, same as before — the
// `force-light` class (see styles/globals.css) pins the white card and its
// inputs/labels to light styling regardless, so the photo behind it doesn't
// bring back the old outdoor-visibility problem (that was about the form
// fields, not this decorative backdrop).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="force-light relative min-h-screen bg-[#0f1c38] flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/hero-classroom.png')" }}/>
      <div className="absolute inset-0 bg-[#0f1c38]/88"/>
      <div className="relative z-10 w-full flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
