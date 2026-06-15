'use client';
import { useState, useEffect } from 'react';
import { Bell, Send, MessageSquare, Megaphone, Loader2, X, Plus } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

const AUDIENCE_OPTS = [
  { value: 'all',      label: 'Everyone' },
  { value: 'teachers', label: 'Teachers only' },
  { value: 'parents',  label: 'Parents only' },
  { value: 'learners', label: 'Learners only' },
  { value: 'admins',   label: 'Admins only' },
];
const PRIORITY_CONF: Record<string, string> = {
  normal: 'bg-blue-100 text-blue-700',
  urgent: 'bg-red-100  text-red-700',
  info:   'bg-gray-100 text-gray-700',
};

export default function CommunicationPage() {
  const { user } = useAuth();
  const [tab,    setTab]    = useState<'announcements'|'messages'|'reminders'>('announcements');
  const [items,  setItems]  = useState<any[]>([]);
  const [loading,setLoading]= useState(true);
  const [showNew,setShowNew]= useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({ title:'', content:'', audience:'all', priority:'normal', channel:'push' });

  const load = () => {
    setLoading(true);
    apiClient.get('/communication/announcements')
      .then(r => setItems(r.data))
      .catch(() => toast.error('Could not load announcements'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.post('/communication/announcements', form);
      toast.success('Announcement sent!');
      setShowNew(false);
      setForm({ title:'', content:'', audience:'all', priority:'normal', channel:'push' });
      load();
    } catch { toast.error('Could not send announcement'); }
    finally { setSaving(false); }
  };

  const sendFeeReminders = async () => {
    try {
      await apiClient.post('/communication/fee-reminders', { term: 'term_1', academicYear: '2025/2026' });
      toast.success('Fee reminders sent to all parents with outstanding balances!');
    } catch { toast.error('Could not send reminders'); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Communication</h1>
          <p className="text-sm text-theme-muted">Announcements · Fee reminders · Parent messaging</p>
        </div>
        {isHoi(user?.role || '') && (
          <div className="flex gap-2">
            <button onClick={sendFeeReminders} className="btn-ghost text-sm">
              <Bell size={14}/> Fee Reminders
            </button>
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <Plus size={16}/> Announce
            </button>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-theme gap-1">
        {[{key:'announcements',label:'📢 Announcements'},{key:'messages',label:'💬 Messages'},{key:'reminders',label:'🔔 Reminders'}].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab===t.key ? 'border-[#1a2e5a] text-theme-heading' : 'border-transparent text-theme-muted hover:text-theme-heading'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'announcements' && (
        loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 shimmer rounded-xl"/>)}</div>
        ) : items.length === 0 ? (
          <div className="card p-10 text-center">
            <Megaphone size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
            <p className="text-theme-muted">No announcements yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((a: any) => (
              <div key={a.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#1a2e5a] flex items-center justify-center flex-shrink-0">
                    <Megaphone size={16} className="text-[#d4af37]"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-theme-heading text-sm">{a.title}</span>
                      <span className={`badge ${PRIORITY_CONF[a.priority] || 'bg-gray-100 text-gray-600'}`}>
                        {a.priority}
                      </span>
                      <span className="badge bg-surface-2 text-theme-muted text-[10px]">→ {a.audience}</span>
                    </div>
                    <p className="text-sm text-theme mt-1 line-clamp-2">{a.content}</p>
                    <p className="text-xs text-theme-muted mt-1.5">
                      {a.sentAt ? new Date(a.sentAt).toLocaleDateString('en-KE', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Draft'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'messages' && (
        <div className="card p-8 text-center text-theme-muted">
          <MessageSquare size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
          <p>Parent–teacher messages load from <code className="bg-surface-2 px-1 rounded">/api/v1/communication/messages</code></p>
        </div>
      )}

      {tab === 'reminders' && (
        <div className="card p-6 space-y-4">
          <h3 className="font-bold text-theme-heading">Bulk Fee Reminders</h3>
          <p className="text-sm text-theme-muted">Send personalised fee reminders to all parents with outstanding balances. Each message includes the learner's name, balance, and due date.</p>
          <div className="flex gap-3">
            <select className="input w-36"><option>Term 1</option><option>Term 2</option><option>Term 3</option></select>
            <select className="input w-36"><option>SMS + WhatsApp</option><option>SMS only</option><option>Email only</option></select>
            <button onClick={sendFeeReminders} className="btn-primary">
              <Send size={14}/> Send Reminders
            </button>
          </div>
        </div>
      )}

      {/* New Announcement Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">New Announcement</h3>
              <button onClick={() => setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div>
                <label className="label">Title *</label>
                <input required value={form.title} onChange={set('title')} className="input" placeholder="Staff meeting reminder"/>
              </div>
              <div>
                <label className="label">Message *</label>
                <textarea required value={form.content} onChange={set('content') as any} rows={4}
                  className="input resize-none" placeholder="Your announcement here…"/>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Audience</label>
                  <select value={form.audience} onChange={set('audience')} className="input">
                    {AUDIENCE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Priority</label>
                  <select value={form.priority} onChange={set('priority')} className="input">
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                    <option value="info">Info</option>
                  </select>
                </div>
                <div>
                  <label className="label">Channel</label>
                  <select value={form.channel} onChange={set('channel')} className="input">
                    <option value="push">Push Only</option>
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                    <option value="all">All channels</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <><Loader2 size={14} className="animate-spin"/> Sending…</> : <><Send size={14}/> Send Now</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
