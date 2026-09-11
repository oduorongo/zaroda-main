// app/retooling/page.tsx — Public retooling hub (no login required).
// Anyone visiting the landing page can browse teacher professional-development
// articles here. Mirrors app/dashboard/retooling/page.tsx but hits the
// unauthenticated /public/retooling endpoints and adds its own header/footer
// since it sits outside the dashboard shell.
//
// Deliberately avoids the shared `.card` / `.btn-ghost` classes: those read the
// app's light/dark CSS variables, and the site defaults every visitor to dark
// mode (see app/layout.tsx) — so those classes rendered as dark-navy-on-dark-navy
// here, unreadable. This page is public marketing surface, always light, so it
// uses explicit light colors instead of the theme-variable classes.
'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { GraduationCap, Loader2, Youtube, ArrowLeft, ArrowRight } from 'lucide-react';
import apiClient from '@/lib/api/client';

export default function PublicRetoolingPage() {
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState<any>(null);
  const [openLoading, setOpenLoading] = useState(false);

  useEffect(() => {
    apiClient.get('/public/retooling/articles')
      .then(r => setArticles(Array.isArray(r.data) ? r.data : []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, []);

  const read = async (a: any) => {
    setOpenLoading(true); setOpen({ id: a.id });
    try { const r = await apiClient.get(`/public/retooling/articles/${a.id}`); setOpen(r.data); }
    catch { setOpen(null); }
    finally { setOpenLoading(false); }
  };

  return (
    <div className="force-light min-h-screen bg-white">
      {/* ───── Nav ───── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-[#e2e6f0]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/zaroda-logo.png" alt="ZARODA" className="w-10 h-10 rounded-xl object-cover"/>
            <div>
              <div className="font-black text-[#1a2e5a] leading-none">ZARODA SCHOOL</div>
              <div className="text-[9px] text-[#f97316] font-black uppercase tracking-widest">Management System</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/auth/login" className="text-sm font-semibold text-[#1a2e5a] px-3 py-2 hover:bg-[#f4f6fb] rounded-xl">Sign In</Link>
            <Link href="/auth/signup" className="btn-primary text-sm">Get started free</Link>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-12">
        {open ? (
          <div className="space-y-4">
            <button onClick={() => setOpen(null)}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#1a2e5a] border border-[#e2e6f0] rounded-xl px-4 py-2.5 hover:bg-[#f4f6fb] transition-all">
              <ArrowLeft size={15}/> Back to articles
            </button>
            {openLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#7a82a8]" size={26}/></div>
            ) : (
              <article className="bg-white border border-[#e2e6f0] rounded-2xl shadow-sm p-6 space-y-4">
                <div>
                  {open.category && <div className="text-xs text-[#7a82a8] uppercase tracking-wide">{open.category}</div>}
                  <h1 className="text-2xl font-black text-[#1a2e5a] mt-1">{open.title}</h1>
                  {open.authorName && <div className="text-xs text-[#7a82a8] mt-1">By {open.authorName}</div>}
                </div>
                {open.videoUrl && (
                  <a href={open.videoUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 text-red-600 font-medium text-sm">
                    <Youtube size={18}/> Watch the video
                  </a>
                )}
                <div className="text-[#4a5278] whitespace-pre-wrap leading-relaxed">{open.body}</div>
              </article>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <GraduationCap className="text-[#1a2e5a]" size={22}/>
              <h1 className="text-2xl md:text-3xl font-black text-[#1a2e5a]">Retooling</h1>
            </div>
            <p className="text-sm text-[#7a82a8]">
              Free professional-development articles and videos for teachers, from ZARODA — no sign-in required.
              Want AI-generated Schemes of Work, Lesson Plans, and more?{' '}
              <Link href="/auth/signup-individual" className="text-[#1a2e5a] font-semibold underline">Try ZARODA AI free <ArrowRight size={12} className="inline"/></Link>
            </p>

            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#7a82a8]" size={26}/></div>
            ) : articles.length === 0 ? (
              <div className="bg-white border border-[#e2e6f0] rounded-2xl p-10 text-center text-[#7a82a8]">No articles yet. Check back soon.</div>
            ) : (
              <div className="space-y-3">
                {articles.map(a => (
                  <button key={a.id} onClick={() => read(a)}
                    className="bg-white border border-[#e2e6f0] rounded-2xl shadow-sm p-4 w-full text-left hover:shadow-md transition-all">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#1a2e5a]">{a.title}</span>
                      {a.videoUrl && <Youtube size={14} className="text-red-600"/>}
                    </div>
                    {a.category && <div className="text-[11px] text-[#7a82a8] mt-0.5">{a.category}</div>}
                    {a.summary && <p className="text-sm text-[#7a82a8] mt-1">{a.summary}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
