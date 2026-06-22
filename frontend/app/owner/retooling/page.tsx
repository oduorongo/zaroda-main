// app/owner/retooling/page.tsx
// Owner posts/edits teacher-retooling articles. Readable by all schools' users.
'use client';
import { useState, useEffect } from 'react';
import { GraduationCap, Plus, Pencil, Trash2, X, Loader2, Eye, EyeOff } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

const BLANK = { id: '', title: '', summary: '', body: '', category: '', videoUrl: '', coverImage: '', isPublished: true };

export default function OwnerRetoolingPage() {
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState<any>(null);
  const [saving, setSaving]     = useState(false);

  const load = () => {
    setLoading(true);
    apiClient.get('/retooling/articles')
      .then(r => setArticles(Array.isArray(r.data) ? r.data : []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openNew  = () => setEditing({ ...BLANK });
  const openEdit = async (a: any) => {
    try { const r = await apiClient.get(`/retooling/articles/${a.id}`); setEditing({ ...BLANK, ...r.data }); }
    catch { toast.error('Could not open article'); }
  };

  const save = async () => {
    if (!editing.title.trim() || !editing.body.trim()) { toast.error('Title and body are required'); return; }
    setSaving(true);
    try {
      if (editing.id) {
        await apiClient.patch(`/retooling/articles/${editing.id}`, editing);
        toast.success('Article updated');
      } else {
        await apiClient.post('/retooling/articles', editing);
        toast.success('Article posted');
      }
      setEditing(null); load();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const remove = async (a: any) => {
    if (!confirm(`Delete "${a.title}"?`)) return;
    try { await apiClient.delete(`/retooling/articles/${a.id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Could not delete'); }
  };

  const set = (k: string) => (e: any) => setEditing({ ...editing, [k]: e.target.value });

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="text-theme-muted" size={20}/>
            <h1 className="text-xl font-black text-theme-heading">Retooling</h1>
          </div>
          <button onClick={openNew} className="btn-primary"><Plus size={16}/> New article</button>
        </div>
        <p className="text-sm text-theme-muted">Professional-development articles for teachers across all schools.</p>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={26}/></div>
        ) : articles.length === 0 ? (
          <div className="card p-10 text-center text-theme-muted">No articles yet. Post your first retooling article.</div>
        ) : (
          <div className="space-y-3">
            {articles.map(a => (
              <div key={a.id} className="card p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-theme-heading">{a.title}</span>
                    {a.isPublished
                      ? <span className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5 flex items-center gap-0.5"><Eye size={10}/> Published</span>
                      : <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 flex items-center gap-0.5"><EyeOff size={10}/> Draft</span>}
                  </div>
                  {a.category && <div className="text-[11px] text-theme-muted mt-0.5">{a.category}</div>}
                  {a.summary && <p className="text-sm text-theme-muted mt-1 line-clamp-2">{a.summary}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(a)} className="text-theme-muted hover:text-[#2563eb] p-1.5"><Pencil size={15}/></button>
                  <button onClick={() => remove(a)} className="text-theme-muted hover:text-red-600 p-1.5"><Trash2 size={15}/></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setEditing(null)}>
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()} style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold text-theme-heading">{editing.id ? 'Edit article' : 'New article'}</h3>
              <button onClick={() => setEditing(null)} className="text-theme-muted"><X size={20}/></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              <div>
                <label className="label">Title <span className="text-red-500">*</span></label>
                <input value={editing.title} onChange={set('title')} className="input w-full" placeholder="Article title"/>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Category</label>
                  <input value={editing.category} onChange={set('category')} className="input w-full" placeholder="e.g. CBC Assessment"/>
                </div>
                <div>
                  <label className="label">YouTube link (optional)</label>
                  <input value={editing.videoUrl} onChange={set('videoUrl')} className="input w-full" placeholder="https://youtu.be/…"/>
                </div>
              </div>
              <div>
                <label className="label">Summary</label>
                <input value={editing.summary} onChange={set('summary')} className="input w-full" placeholder="One-line summary shown in the list"/>
              </div>
              <div>
                <label className="label">Body <span className="text-red-500">*</span></label>
                <textarea value={editing.body} onChange={set('body')} rows={10} className="input w-full" placeholder="Write the article…"/>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.isPublished} onChange={e => setEditing({ ...editing, isPublished: e.target.checked })}/>
                Publish (visible to all schools). Uncheck to keep as draft.
              </label>
            </div>
            <div className="flex justify-end gap-2 p-5 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setEditing(null)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="animate-spin" size={16}/> : null} {editing.id ? 'Save changes' : 'Post article'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
