// app/dashboard/retooling/page.tsx
// Read-only retooling articles for teachers & school users. Watch videos, read content.
'use client';
import { useState, useEffect } from 'react';
import { GraduationCap, Loader2, Youtube, ArrowLeft } from 'lucide-react';
import apiClient from '@/lib/api/client';

export default function RetoolingReadPage() {
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState<any>(null);
  const [openLoading, setOpenLoading] = useState(false);

  useEffect(() => {
    apiClient.get('/retooling/articles')
      .then(r => setArticles(Array.isArray(r.data) ? r.data : []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, []);

  const read = async (a: any) => {
    setOpenLoading(true); setOpen({ id: a.id });
    try { const r = await apiClient.get(`/retooling/articles/${a.id}`); setOpen(r.data); }
    catch { setOpen(null); }
    finally { setOpenLoading(false); }
  };

  if (open) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <button onClick={() => setOpen(null)} className="btn-ghost text-sm"><ArrowLeft size={15}/> Back to articles</button>
        {openLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={26}/></div>
        ) : (
          <article className="card p-6 space-y-4">
            <div>
              {open.category && <div className="text-xs text-theme-muted uppercase tracking-wide">{open.category}</div>}
              <h1 className="text-2xl font-black text-theme-heading mt-1">{open.title}</h1>
              {open.authorName && <div className="text-xs text-theme-muted mt-1">By {open.authorName}</div>}
            </div>
            {open.videoUrl && (
              <a href={open.videoUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 text-red-600 font-medium text-sm">
                <Youtube size={18}/> Watch the video
              </a>
            )}
            <div className="text-theme whitespace-pre-wrap leading-relaxed">{open.body}</div>
          </article>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <GraduationCap className="text-theme-muted" size={20}/>
        <h1 className="text-lg font-black text-theme-heading">Retooling & CPD</h1>
      </div>
      <p className="text-sm text-theme-muted">Professional-development articles and resources from ZARODA.</p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={26}/></div>
      ) : articles.length === 0 ? (
        <div className="card p-10 text-center text-theme-muted">No articles yet. Check back soon.</div>
      ) : (
        <div className="space-y-3">
          {articles.map(a => (
            <button key={a.id} onClick={() => read(a)} className="card p-4 w-full text-left hover:bg-surface-2 transition-colors">
              <div className="flex items-center gap-2">
                <span className="font-bold text-theme-heading">{a.title}</span>
                {a.videoUrl && <Youtube size={14} className="text-red-600"/>}
              </div>
              {a.category && <div className="text-[11px] text-theme-muted mt-0.5">{a.category}</div>}
              {a.summary && <p className="text-sm text-theme-muted mt-1">{a.summary}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
