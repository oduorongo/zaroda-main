// app/owner/testimonials/page.tsx
// Owner-only view of real testimonials submitted by teachers/HOIs across every
// school — evidence-gathering for award submissions / case studies. Nothing here
// is written by Zaroda; it's exactly what users typed, with their name/school/role.
'use client';
import { useState, useEffect } from 'react';
import { Quote, Star, Star as StarFilled, Copy } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

const STATUS_OPTS = [
  { value: '',          label: 'All' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'featured',  label: 'Featured' },
  { value: 'archived',  label: 'Archived' },
];

export default function OwnerTestimonialsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const load = () => {
    setLoading(true);
    apiClient.get('/testimonials', { params: status ? { status } : {} })
      .then(r => setItems(Array.isArray(r.data) ? r.data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [status]);

  const setItemStatus = async (id: string, next: string) => {
    try { await apiClient.patch(`/testimonials/${id}`, { status: next }); toast.success('Updated'); load(); }
    catch { toast.error('Could not update'); }
  };

  const remove = async (id: string) => {
    if (!confirm('Permanently delete this testimonial?')) return;
    try { await apiClient.delete(`/testimonials/${id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Could not delete'); }
  };

  const copyAll = () => {
    const text = items.map(t =>
      `"${t.message}"\n— ${t.authorName}, ${t.authorRole}${t.schoolName ? `, ${t.schoolName}` : ''}${t.rating ? ` (${t.rating}/5)` : ''}`
    ).join('\n\n');
    navigator.clipboard?.writeText(text);
    toast.success('Copied — paste into your evidence document.');
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Quote size={22} className="text-[#1a2e5a]"/>
            <h1 className="text-xl font-black text-theme-heading">Testimonials</h1>
          </div>
          <div className="flex items-center gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input text-xs py-1.5 w-auto">
              {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button onClick={copyAll} disabled={!items.length} className="btn-ghost text-xs py-1.5 px-3"><Copy size={13}/> Copy all</button>
          </div>
        </div>
        <p className="text-sm text-theme-muted">
          Unedited submissions from teachers and HOIs using Zaroda, collected from their dashboards.
        </p>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 shimmer rounded-xl"/>)}</div>
        ) : items.length === 0 ? (
          <div className="card p-10 text-center text-theme-muted">No testimonials submitted yet.</div>
        ) : (
          <div className="space-y-3">
            {items.map(t => (
              <div key={t.id} className="card p-4">
                <p className="text-sm text-theme-heading italic">&ldquo;{t.message}&rdquo;</p>
                <div className="flex items-center justify-between flex-wrap gap-2 mt-3">
                  <div>
                    <div className="font-semibold text-sm text-theme-heading">{t.authorName}</div>
                    <div className="text-xs text-theme-muted">{t.authorRole}{t.schoolName ? ` · ${t.schoolName}` : ''} · {new Date(t.createdAt).toLocaleDateString('en-KE')}</div>
                    {t.rating && (
                      <div className="flex mt-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          i < t.rating ? <StarFilled key={i} size={13} className="fill-[#d4af37] text-[#d4af37]"/> : <Star key={i} size={13} className="text-theme-muted"/>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {t.status !== 'featured' && <button onClick={() => setItemStatus(t.id, 'featured')} className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700">Feature</button>}
                    {t.status !== 'archived' && <button onClick={() => setItemStatus(t.id, 'archived')} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-200">Archive</button>}
                    <button onClick={() => remove(t.id)} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
