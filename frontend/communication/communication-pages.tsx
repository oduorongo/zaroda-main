// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// MODULE 04: Communication — Next.js Frontend
// Pages: Announcements Feed · Create Announcement
//        Retooling Broadcast · Fee Reminders · Inbox (Parent-Teacher)
// ============================================================

'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';

// ─────────────────────────────────────────────────────────────
// lib/api/communication.ts
// ─────────────────────────────────────────────────────────────
export const CommAPI = {
  // Announcements
  createAnnouncement: (d: any)    => apiClient.post('/api/v1/communication/announcements', d),
  publishAnnouncement:(id: string, d: any) => apiClient.patch(`/api/v1/communication/announcements/${id}/publish`, d),
  getFeed:            (page = 1)  => apiClient.get('/api/v1/communication/announcements/feed', { params: { page } }),
  markRead:           (id: string)=> apiClient.post(`/api/v1/communication/announcements/${id}/read`),

  // Campaigns
  sendFeeReminders:   (d: any)    => apiClient.post('/api/v1/communication/campaigns/fee-reminders', d),
  sendRetooling:      (d: any)    => apiClient.post('/api/v1/communication/campaigns/retooling', d),
  getCampaigns:       ()          => apiClient.get('/api/v1/communication/campaigns'),

  // Threads
  sendMessage:        (d: any)    => apiClient.post('/api/v1/communication/threads/messages', d),
  getThreads:         ()          => apiClient.get('/api/v1/communication/threads'),
  getMessages:        (id: string)=> apiClient.get(`/api/v1/communication/threads/${id}/messages`),

  // Push
  subscribePush:      (d: any)    => apiClient.post('/api/v1/communication/push/subscribe', d),
};

// ─────────────────────────────────────────────────────────────
// lib/hooks/usePush.ts — Web Push registration
// ─────────────────────────────────────────────────────────────
export function usePush() {
  const registerPush = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg  = await navigator.serviceWorker.register('/sw.js');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      await CommAPI.subscribePush({
        endpoint: sub.endpoint,
        p256dh:   btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!))),
        auth:     btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')!))),
        userAgent: navigator.userAgent,
      });
    } catch (err) {
      console.warn('Push registration failed:', err);
    }
  }, []);

  useEffect(() => { registerPush(); }, []);
}


// ─────────────────────────────────────────────────────────────
// app/dashboard/communication/announcements/page.tsx
// Announcement Feed (all roles see this)
// ─────────────────────────────────────────────────────────────
const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-red-50 border-red-300',
  high:   'bg-orange-50 border-orange-200',
  normal: 'bg-white border-gray-100',
  low:    'bg-gray-50 border-gray-100',
};
const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high:   'bg-orange-100 text-orange-700',
  normal: 'bg-blue-50 text-blue-600',
  low:    'bg-gray-100 text-gray-500',
};
const CATEGORY_ICONS: Record<string, string> = {
  general:'📢', academic:'📚', finance:'💰', sports:'🏆',
  health:'🏥', event:'🎉', emergency:'🚨', retooling:'🔧',
};

export default function AnnouncementsPage() {
  const { user }  = useAuth();
  const [feed,    setFeed]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [hasMore, setHasMore] = useState(true);
  usePush(); // register push on mount

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const { data } = await CommAPI.getFeed(p);
      if (p === 1) setFeed(data);
      else setFeed(prev => [...prev, ...data]);
      setHasMore(data.length === 20);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1); }, []);

  const handleRead = async (id: string) => {
    await CommAPI.markRead(id);
    setFeed(prev => prev.map(a => a.id === id ? {...a, isRead: true} : a));
  };

  const canCreate = ['super_admin','tenant_owner','school_admin','hoi','dhois'].includes(user?.role || '');

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-500 mt-0.5">School notices and updates</p>
        </div>
        {canCreate && (
          <a href="/dashboard/communication/announcements/create"
            className="px-4 py-2 bg-[#1a2e5a] text-white text-sm font-medium rounded-lg hover:bg-[#142347]">
            + New Announcement
          </a>
        )}
      </div>

      {loading && feed.length === 0 ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"/>
              <div className="h-3 bg-gray-100 rounded w-full mb-2"/>
              <div className="h-3 bg-gray-100 rounded w-2/3"/>
            </div>
          ))}
        </div>
      ) : feed.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-4xl mb-3">📢</div>
          <p className="text-sm">No announcements yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feed.map(a => (
            <div
              key={a.id}
              onClick={() => !a.isRead && handleRead(a.id)}
              className={`border rounded-xl p-5 cursor-pointer transition-all hover:shadow-sm
                ${PRIORITY_STYLES[a.priority] || 'bg-white border-gray-100'}
                ${!a.isRead ? 'ring-1 ring-[#1a2e5a]/20' : ''}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg flex-shrink-0">{CATEGORY_ICONS[a.category] || '📢'}</span>
                  <h3 className={`font-semibold text-gray-900 truncate ${!a.isRead ? 'text-[#1a2e5a]' : ''}`}>
                    {a.title}
                  </h3>
                  {!a.isRead && (
                    <span className="w-2 h-2 bg-[#1a2e5a] rounded-full flex-shrink-0"/>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded capitalize ${PRIORITY_BADGE[a.priority]}`}>
                    {a.priority}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed">{a.body}</p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-gray-400">
                  {new Date(a.publishedAt).toLocaleDateString('en-KE',{
                    day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
                  })}
                </span>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>👁 {a.viewCount}</span>
                  <span className="capitalize">{a.audience}</span>
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <button onClick={() => { setPage(p => p+1); load(page+1); }}
              disabled={loading}
              className="w-full py-3 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50">
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// app/dashboard/communication/announcements/create/page.tsx
// ─────────────────────────────────────────────────────────────
export function CreateAnnouncementPage() {
  const [form, setForm] = useState({
    title: '', body: '', category: 'general', audience: 'all',
    priority: 'normal', publish: true, sendPush: true, sendSms: false,
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState('');
  const set = (k: string) => (e: any) => setForm(p => ({...p, [k]: e.target?.value ?? e}));

  const submit = async () => {
    if (!form.title || !form.body) { setError('Title and body are required.'); return; }
    setLoading(true); setError('');
    try {
      await CommAPI.createAnnouncement(form);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create announcement.');
    } finally { setLoading(false); }
  };

  if (success) return (
    <div className="p-6 max-w-lg mx-auto text-center py-20">
      <div className="text-5xl mb-4">📢</div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Announcement Published!</h2>
      <p className="text-gray-500 text-sm mb-6">All targeted users will see this in their feed.</p>
      <div className="flex gap-3 justify-center">
        <a href="/dashboard/communication/announcements"
          className="px-5 py-2.5 bg-[#1a2e5a] text-white rounded-lg text-sm font-medium">
          View Feed
        </a>
        <button onClick={() => { setSuccess(false); setForm({ title:'', body:'', category:'general', audience:'all', priority:'normal', publish:true, sendPush:true, sendSms:false }); }}
          className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm">
          New Announcement
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">New Announcement</h1>
        <p className="text-sm text-gray-500 mt-0.5">Broadcast to your school community</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input value={form.title} onChange={set('title')} placeholder="e.g. Term 1 Exam Timetable Released"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
          <textarea value={form.body} onChange={set('body')} rows={6}
            placeholder="Write your announcement here…"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] resize-none"/>
          <p className="text-xs text-gray-400 mt-1">{form.body.length} characters</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category} onChange={set('category')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
              {['general','academic','finance','sports','health','event','emergency','retooling'].map(c => (
                <option key={c} value={c}>{CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase()+c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select value={form.priority} onChange={set('priority')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
              {['low','normal','high','urgent'].map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Audience selector — the Retooling feature */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Target Audience</label>
          <div className="grid grid-cols-5 gap-2">
            {[
              { v:'all',      label:'Everyone', icon:'🌐' },
              { v:'admins',   label:'Admins',   icon:'👔' },
              { v:'teachers', label:'Teachers', icon:'👩‍🏫' },
              { v:'learners', label:'Learners', icon:'🎒' },
              { v:'parents',  label:'Parents',  icon:'👨‍👩‍👧' },
            ].map(a => (
              <button key={a.v} type="button" onClick={() => setForm(p => ({...p, audience: a.v}))}
                className={`py-2.5 px-2 rounded-lg text-xs font-medium border flex flex-col items-center gap-1 transition-all
                  ${form.audience === a.v ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                <span className="text-base">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Delivery options */}
        <div className="bg-[#f4f6fb] rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Delivery Options</p>
          {[
            { key:'publish',  label:'Publish immediately',    desc:'Make visible in the announcement feed' },
            { key:'sendPush', label:'Send push notification', desc:'Notify app users instantly' },
            { key:'sendSms',  label:'Send SMS',               desc:'Send text to phone numbers (charges apply)' },
          ].map(opt => (
            <label key={opt.key} className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={(form as any)[opt.key]}
                onChange={e => setForm(p => ({...p, [opt.key]: e.target.checked}))}
                className="mt-0.5 w-4 h-4 accent-[#1a2e5a]"/>
              <div>
                <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                <div className="text-xs text-gray-500">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <button onClick={submit} disabled={loading}
          className="w-full py-3 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347] disabled:opacity-60 transition-colors">
          {loading ? 'Publishing…' : '📢 Publish Announcement'}
        </button>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// app/dashboard/communication/fee-reminders/page.tsx
// Bulk fee reminders with debtor preview
// ─────────────────────────────────────────────────────────────
export function FeeRemindersPage() {
  const [form, setForm] = useState({
    academicYear: '2025/2026', term: 'term_1',
    channel: 'sms', minBalance: '', streamId: '',
    customMessage: '',
  });
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<any>(null);
  const [error,    setError]    = useState('');
  const set = (k: string) => (e: any) => setForm(p => ({...p, [k]: e.target.value}));

  const send = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await CommAPI.sendFeeReminders({
        ...form,
        minBalance: form.minBalance ? parseFloat(form.minBalance) : undefined,
      });
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to send reminders.');
    } finally { setLoading(false); }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Bulk Fee Reminders</h1>
        <p className="text-sm text-gray-500 mt-0.5">Send SMS / WhatsApp / Email to parents with outstanding balances</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

      {result ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Reminders Sent!</h2>
          <p className="text-gray-500 text-sm mb-6">{result.message}</p>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label:'Targeted', value: result.totalTargets, color:'text-gray-800' },
              { label:'Sent',     value: result.sent,         color:'text-green-700' },
              { label:'Failed',   value: result.failed,       color: result.failed > 0 ? 'text-red-600' : 'text-gray-400' },
            ].map(s => (
              <div key={s.label} className="bg-[#f4f6fb] rounded-xl p-3 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setResult(null)}
            className="w-full py-2.5 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium">
            Send Another Batch
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
              <select value={form.academicYear} onChange={set('academicYear')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
                <option value="2025/2026">2025/2026</option>
                <option value="2026/2027">2026/2027</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
              <select value={form.term} onChange={set('term')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
                <option value="term_1">Term 1</option>
                <option value="term_2">Term 2</option>
                <option value="term_3">Term 3</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Channel</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v:'sms',       label:'SMS',       icon:'💬' },
                { v:'whatsapp',  label:'WhatsApp',  icon:'📱' },
                { v:'email',     label:'Email',     icon:'📧' },
              ].map(c => (
                <button key={c.v} type="button" onClick={() => setForm(p => ({...p, channel: c.v}))}
                  className={`py-2.5 rounded-lg text-sm font-medium border flex items-center justify-center gap-2 transition-all
                    ${form.channel === c.v ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Balance (KES) <span className="text-xs text-gray-400">optional — filter by min owed</span>
            </label>
            <input type="number" value={form.minBalance} onChange={set('minBalance')} placeholder="e.g. 500"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Custom Message <span className="text-xs text-gray-400">optional — leave blank for default template</span>
            </label>
            <textarea value={form.customMessage} onChange={set('customMessage')} rows={4}
              placeholder="Use {{guardian_name}}, {{learner_name}}, {{balance_due}}, {{due_date}} as variables"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] resize-none font-mono text-xs"/>
          </div>

          <div className="bg-[#f4f6fb] rounded-lg p-3 text-xs text-gray-500">
            <strong className="text-gray-700">Default template variables:</strong><br/>
            <code>{'{{guardian_name}}'}</code> · <code>{'{{learner_name}}'}</code> · <code>{'{{admission_no}}'}</code> · <code>{'{{balance_due}}'}</code> · <code>{'{{due_date}}'}</code> · <code>{'{{term}}'}</code>
          </div>

          <button onClick={send} disabled={loading}
            className="w-full py-3 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347] disabled:opacity-60">
            {loading ? 'Sending…' : '📤 Send Fee Reminders'}
          </button>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// app/dashboard/communication/inbox/page.tsx
// Parent ↔ Teacher messaging
// ─────────────────────────────────────────────────────────────
export function InboxPage() {
  const { user }        = useAuth();
  const [threads,       setThreads]       = useState<any[]>([]);
  const [activeThread,  setActiveThread]  = useState<any>(null);
  const [messages,      setMessages]      = useState<any[]>([]);
  const [newMsg,        setNewMsg]        = useState('');
  const [sending,       setSending]       = useState(false);
  const [loading,       setLoading]       = useState(true);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    CommAPI.getThreads()
      .then(r => setThreads(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeThread) return;
    CommAPI.getMessages(activeThread.id).then(r => {
      setMessages(r.data);
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
  }, [activeThread]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeThread) return;
    setSending(true);
    try {
      await CommAPI.sendMessage({ threadId: activeThread.id, learnerId: activeThread.learnerId, body: newMsg });
      const { data } = await CommAPI.getMessages(activeThread.id);
      setMessages(data);
      setNewMsg('');
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } finally { setSending(false); }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Thread list */}
      <div className="w-72 border-r border-gray-100 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Messages</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-gray-400 text-center">Loading…</div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-3xl mb-2">💬</div>
              <p className="text-xs text-gray-400">No messages yet</p>
            </div>
          ) : (
            threads.map(t => (
              <button key={t.id} onClick={() => setActiveThread(t)}
                className={`w-full text-left p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors
                  ${activeThread?.id === t.id ? 'bg-[#f4f6fb] border-l-2 border-l-[#1a2e5a]' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 bg-[#1a2e5a] rounded-full flex items-center justify-center text-white text-xs flex-shrink-0">
                    {t.learner?.firstName?.[0]}{t.learner?.lastName?.[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-800 truncate">
                      {t.learner?.firstName} {t.learner?.lastName}
                    </div>
                    <div className="text-xs text-gray-400 truncate">{t.subject}</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400 ml-9">
                  {t.lastMessageAt && new Date(t.lastMessageAt).toLocaleDateString('en-KE')}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message view */}
      {activeThread ? (
        <div className="flex-1 flex flex-col">
          {/* Thread header */}
          <div className="p-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-8 h-8 bg-[#1a2e5a] rounded-full flex items-center justify-center text-white text-xs">
              {activeThread.learner?.firstName?.[0]}{activeThread.learner?.lastName?.[0]}
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">
                {activeThread.learner?.firstName} {activeThread.learner?.lastName}
              </div>
              <div className="text-xs text-gray-400">{activeThread.subject}</div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(m => {
              const isMe = m.senderId === user?.id;
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-sm px-4 py-2.5 rounded-2xl text-sm
                    ${isMe ? 'bg-[#1a2e5a] text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                    <div className="leading-relaxed">{m.body}</div>
                    <div className={`text-xs mt-1 ${isMe ? 'text-white/60' : 'text-gray-400'}`}>
                      {new Date(m.createdAt).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={msgEndRef}/>
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100 flex gap-2">
            <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Type a message…"
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
            <button onClick={sendMessage} disabled={sending || !newMsg.trim()}
              className="px-4 py-2.5 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347] disabled:opacity-50 transition-colors">
              {sending ? '…' : '↑'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-sm">Select a conversation</p>
          </div>
        </div>
      )}
    </div>
  );
}
