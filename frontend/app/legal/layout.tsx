import Link from 'next/link';

/** A plain reading surface for the privacy policy and the terms. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white text-[#1b2333]">
      <header className="bg-[#0f1c38] text-white/70">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center justify-between gap-6 flex-wrap">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <img src="/zaroda-logo.png" alt="" className="w-8 h-8 rounded-lg object-cover"/>
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
              Zaroda School
            </span>
          </Link>
          <nav className="flex gap-5 text-sm">
            <Link href="/legal/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/legal/terms" className="hover:text-white">Terms</Link>
            <Link href="/" className="hover:text-white">Home</Link>
          </nav>
        </div>
      </header>

      <article className="legal max-w-3xl mx-auto px-5 py-12">{children}</article>

      <footer className="bg-[#0f1c38] text-white/60">
        <div className="max-w-3xl mx-auto px-5 py-8 text-sm">
          ZARODA Solutions · <a href="mailto:support@zarodasolutions.app" className="hover:text-white">support@zarodasolutions.app</a> ·{' '}
          <a href="tel:+254781230805" className="hover:text-white">+254 781 230 805</a>
        </div>
      </footer>

      {/* Scoped to this reading surface so the pages below stay plain prose. */}
      <style>{`
        .legal h1 { font-size: 1.9rem; font-weight: 800; color: #0f1c38; margin-bottom: .35rem; }
        .legal h2 { font-size: 1.15rem; font-weight: 700; color: #0f1c38; margin: 2.2rem 0 .6rem; }
        .legal h3 { font-size: 1rem; font-weight: 700; color: #1a2e5a; margin: 1.5rem 0 .4rem; }
        .legal p, .legal li { line-height: 1.7; margin-bottom: .85rem; }
        .legal .sub { color: #6b7280; font-size: .9rem; margin-bottom: 2rem; }
        .legal ul { list-style: disc; padding-left: 1.4rem; margin-bottom: 1rem; }
        .legal a { color: #1a2e5a; text-decoration: underline; }
        .legal table { width: 100%; border-collapse: collapse; margin: 1rem 0 1.5rem; font-size: .92rem; }
        .legal th { text-align: left; background: #0f1c38; color: #fff; padding: .5rem .7rem; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
        .legal td { padding: .5rem .7rem; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        .legal strong { color: #0f1c38; }
      `}</style>
    </main>
  );
}
