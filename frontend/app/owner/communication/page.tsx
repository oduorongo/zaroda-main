// app/owner/communication/page.tsx
// Owner broadcasts a message to all school admins or all users, via email
// (sent for real through the platform's Resend setup) or WhatsApp (still a
// wa.me link — there's no server-side WhatsApp sender in this app).
// SMS is paused platform-wide while Africa's Talking Sender ID registration
// is pending payment — the test-SMS panel, SMS broadcast button, delivery
// reports and SMS retry-in-history were removed rather than deleted from the
// backend, so this is a straightforward flip back on once that's resolved.
'use client';
import { useState, useEffect } from 'react';
import { Megaphone, Loader2, MessageCircle, Mail, Phone, Copy, Check, Send, AlertTriangle, History, X, Trash2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

export default function OwnerCommunicationPage() {
  const [audience, setAudience] = useState<'admins' | 'all' | 'school' | 'individual' | 'incomplete'>('admins');
  const [data, setData]         = useState<any>(null);
  const [incomplete, setIncomplete] = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [title, setTitle]       = useState('');
  const [message, setMessage]   = useState('');
  const [copied, setCopied]     = useState('');
  const [sending, setSending]   = useState<'email' | ''>('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory]   = useState<any[]>([]);

  // Diagnostic: confirms RESEND_API_KEY is actually set and working (e.g. for
  // password-reset emails) without needing Render log access.
  const [testEmail, setTestEmail] = useState('');
  const [testEmailMessage, setTestEmailMessage] = useState('');
  const [testEmailResult, setTestEmailResult] = useState<any>(null);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const sendTestEmail = async () => {
    if (!testEmail.trim()) { toast.error('Enter an email address'); return; }
    setSendingTestEmail(true);
    setTestEmailResult(null);
    try {
      const { data } = await apiClient.post('/admin/test-email', { email: testEmail.trim(), message: testEmailMessage.trim() || undefined });
      setTestEmailResult(data);
      if (data.ok) toast.success('Sent — check the inbox (and spam folder).');
      else toast.error(data.detail || data.error || 'Not sent — see details below.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not send test email.');
    } finally {
      setSendingTestEmail(false);
    }
  };

  const openHistory = () => {
    setShowHistory(true);
    apiClient.get('/admin/broadcast-history').then(r => setHistory(Array.isArray(r.data) ? r.data : [])).catch(() => setHistory([]));
  };

  const deleteBroadcast = async (id: string) => {
    if (!confirm('Delete this from history? The message already sent can\'t be unsent.')) return;
    try {
      await apiClient.delete(`/admin/broadcast-history/${id}`);
      toast.success('Deleted.');
      openHistory();
    } catch { toast.error('Could not delete.'); }
  };

  const load = (aud: string) => {
    setLoading(true);
    if (aud === 'incomplete') {
      apiClient.get('/admin/setup-incomplete')
        .then(r => setIncomplete(r.data))
        .catch(() => setIncomplete(null))
        .finally(() => setLoading(false));
      return;
    }
    apiClient.get('/admin/broadcast/recipients', { params: { audience: aud } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(audience); }, [audience]);

  const incompleteTenants = incomplete?.tenants || [];
  const recipients = audience === 'incomplete'
    ? incompleteTenants.map((t: any) => ({ firstName: t.adminName, lastName: '', role: 'admin', schoolName: t.name, phone: t.adminPhone, email: t.adminEmail }))
    : (data?.recipients || []);
  const phones = recipients.map((r: any) => r.phone).filter(Boolean);
  const emails = recipients.map((r: any) => r.email).filter(Boolean);

  const copy = (label: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(label); setTimeout(() => setCopied(''), 1800);
    toast.success('Copied');
  };

  // WhatsApp has no server-side sender in this app — opens a chat with the message
  // prefilled so the owner can pick/forward recipients manually.
  const whatsappFirst = () => {
    if (!message.trim()) { toast.error('Write a message first'); return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  // Sends for real via POST /admin/broadcast (Resend for email) — no dependency
  // on the viewer having a desktop mail app configured, unlike the mailto: link
  // this replaced.
  const sendReal = async (channel: 'email') => {
    if (audience !== 'incomplete') {
      if (!title.trim()) { toast.error('Write a subject/title first'); return; }
      if (!message.trim()) { toast.error('Write a message first'); return; }
    }
    const recipientCount = emails.length;
    const ok = window.confirm(
      `Send this email to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}?\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    setSending(channel);
    try {
      const { data: result } = audience === 'incomplete'
        ? await apiClient.post('/admin/setup-reminders', { channels: [channel], message: message.trim() || undefined })
        : await apiClient.post('/admin/broadcast', { audience, title, message, channels: [channel] });
      if (result?.error) { toast.error(result.error); return; }
      const stats = result[channel];
      if (!stats) { toast.error('No response for this channel.'); return; }
      toast.success(`Sent ${stats.sent}/${stats.attempted} via email.`);
      if (stats.failed > 0 && stats.detail) toast.error(`Email: ${stats.detail}`, { duration: 8000 });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || `Could not send ${channel}.`);
    } finally {
      setSending('');
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Megaphone className="text-theme-muted" size={20}/>
            <h1 className="text-xl font-black text-theme-heading">Communication</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-surface-2 text-theme-muted">
              SMS — Coming soon
            </span>
            <button onClick={openHistory} className="btn-ghost text-xs px-2.5 py-1.5">
              <History size={13}/> History
            </button>
          </div>
        </div>
        <p className="text-sm text-theme-muted">Send a message to school admins, school users (non-admin), individual (no-school) teacher accounts, everyone at once, or nudge schools that haven't finished setup. Split by audience to stay under a daily email cap — admins, school users and individual accounts never overlap.</p>

        {/* Test email — one address, outside the bulk/audience flow. Confirms
            RESEND_API_KEY is actually configured on the server and shows the exact
            failure reason if not, e.g. for diagnosing password-reset emails. */}
        <div className="card p-4 space-y-3 border border-blue-200/60 bg-blue-50/30">
          <div className="flex items-center gap-2">
            <Mail size={15} className="text-[#1a2e5a]"/>
            <span className="text-sm font-semibold text-theme-heading">Send test email to one address</span>
          </div>
          <p className="text-xs text-theme-muted">
            Confirms email delivery (Resend) is actually configured and working — e.g. for password-reset emails — without needing to check server logs.
          </p>
          <div className="flex flex-wrap gap-2">
            <input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="you@example.com"
              className="input text-sm flex-1 min-w-[160px]"/>
            <input value={testEmailMessage} onChange={e => setTestEmailMessage(e.target.value)} placeholder="Message (optional — a default test message is used)"
              className="input text-sm flex-[2] min-w-[200px]"/>
            <button onClick={sendTestEmail} disabled={sendingTestEmail} className="btn-primary text-sm">
              {sendingTestEmail ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Send
            </button>
          </div>
          {testEmailResult && (
            <div className="text-xs bg-surface-2 rounded-lg p-3 space-y-1">
              <div><b>Status:</b> {testEmailResult.ok ? '✅ Sent' : testEmailResult.error || '❌ Failed'}</div>
              {testEmailResult.detail && <div><b>Detail:</b> {testEmailResult.detail}</div>}
            </div>
          )}
        </div>

        {/* Audience */}
        <div className="card p-4 space-y-3">
          <label className="label">Audience</label>
          <div className="flex flex-wrap gap-1">
            {([['admins','School admins'],['school','School users'],['individual','Individual accounts'],['all','All users'],['incomplete','Incomplete setup']] as const).map(([v,label]) => (
              <button key={v} onClick={() => setAudience(v)}
                className={`flex-1 min-w-[110px] px-3 py-2 rounded-lg text-sm font-medium ${audience===v ? 'bg-[#1a2e5a] text-white' : 'bg-surface-2 text-theme-muted'}`}>
                {label}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="flex justify-center py-3"><Loader2 className="animate-spin text-theme-muted" size={18}/></div>
          ) : audience === 'incomplete' ? (
            incomplete && (
              <div className="text-xs text-theme-muted flex gap-4">
                <span><b className="text-theme-heading">{incomplete.count}</b> schools with incomplete setup</span>
                <span><Phone size={11} className="inline"/> {incompleteTenants.filter((t:any)=>t.adminPhone).length} with phone</span>
                <span><Mail size={11} className="inline"/> {incompleteTenants.filter((t:any)=>t.adminEmail).length} with email</span>
              </div>
            )
          ) : data && (
            <div className="text-xs text-theme-muted flex gap-4">
              <span><b className="text-theme-heading">{data.count}</b> recipients</span>
              <span><Phone size={11} className="inline"/> {data.withPhone} with phone</span>
              <span><Mail size={11} className="inline"/> {data.withEmail} with email</span>
            </div>
          )}
        </div>

        {audience === 'incomplete' && !loading && incomplete && incompleteTenants.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-theme-heading mb-2">
              <AlertTriangle size={15} className="text-amber-500"/> Schools still setting up
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-theme">
              {incompleteTenants.map((t: any) => {
                // Setup order that actually works: classes must exist before teachers
                // can be assigned to them, and both before learners can be enrolled —
                // so the procedure is always shown in this sequence, not just a flat list
                // of what's missing.
                const steps = [
                  Number(t.streamCount) === 0 && 'Add classes/streams (Academic → Classes)',
                  Number(t.teacherCount) === 0 && 'Add teaching staff and assign them to classes/subjects (Staff → Add Teacher)',
                  Number(t.learnerCount) === 0 && 'Enroll learners into their classes (Learners → Add Learner)',
                ].filter(Boolean) as string[];
                return (
                  <div key={t.id} className="py-2 text-sm">
                    <div className="text-theme-heading font-medium">{t.name}</div>
                    <ol className="mt-1 space-y-0.5 text-xs text-theme-muted list-decimal list-inside">
                      {steps.map((step, i) => <li key={i}>{step}</li>)}
                    </ol>
                    <div className="text-theme-muted text-xs mt-1">{t.adminName || 'No admin found'} {t.adminPhone ? `· ${t.adminPhone}` : ''} {t.adminEmail ? `· ${t.adminEmail}` : ''}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Message */}
        <div className="card p-4 space-y-3">
          {audience !== 'incomplete' && (
            <>
              <label className="label">Subject</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className="input w-full"
                placeholder="Subject line"/>
            </>
          )}
          <label className="label">Message{audience === 'incomplete' ? ' (optional — a default reminder is used if left blank)' : ''}</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6}
            className="input w-full"
            placeholder={audience === 'incomplete'
              ? "Leave blank to send the default reminder to finish setup, or write your own…"
              : "Write your announcement to schools…"}/>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button onClick={() => sendReal('email')} disabled={sending === 'email'}
              className="justify-center flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">
              {sending === 'email' ? <Loader2 size={15} className="animate-spin"/> : <Mail size={15}/>} Send Email
            </button>
            {audience !== 'incomplete' && (
              <button onClick={whatsappFirst} className="btn-ghost justify-center">
                <MessageCircle size={15}/> WhatsApp
              </button>
            )}
          </div>
          <p className="text-[11px] text-theme-muted">
            {audience === 'incomplete'
              ? 'Email goes only to admins of schools with incomplete setup — not the full recipient list. (SMS — coming soon.)'
              : 'Email sends for real to every recipient in this audience. WhatsApp has no automated sender — it opens a chat with the message ready to forward manually. (SMS — coming soon.)'}
          </p>
        </div>

        {/* Recipient lists for reference / manual outreach */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-theme-heading flex items-center gap-1"><Phone size={14}/> Phone numbers ({phones.length})</span>
              <button onClick={() => copy('phones', phones.join(', '))} className="text-xs text-[#1a2e5a] hover:underline">
                {copied==='phones' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="text-xs text-theme-muted max-h-32 overflow-y-auto break-words">{phones.join(', ') || '—'}</div>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-theme-heading flex items-center gap-1"><Mail size={14}/> Emails ({emails.length})</span>
              <button onClick={() => copy('emails', emails.join(', '))} className="text-xs text-[#1a2e5a] hover:underline">
                {copied==='emails' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="text-xs text-theme-muted max-h-32 overflow-y-auto break-words">{emails.join(', ') || '—'}</div>
          </div>
        </div>

        {/* Recipient preview */}
        {recipients.length > 0 && (
          <div className="card p-4">
            <div className="text-xs font-semibold text-theme-muted uppercase tracking-wide mb-2">Recipients</div>
            <div className="max-h-64 overflow-y-auto divide-y divide-theme">
              {recipients.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                  <div className="min-w-0">
                    <span className="text-theme-heading">{r.firstName} {r.lastName}</span>
                    <span className="text-theme-muted text-xs ml-2 capitalize">{(r.role || '').replace('_',' ')}</span>
                  </div>
                  <span className="text-theme-muted text-xs truncate ml-2">{r.schoolName || ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showHistory && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
            <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl my-8 mt-16">
              <div className="flex items-center justify-between p-5 border-b border-theme">
                <h3 className="text-lg font-bold text-theme-heading">Broadcast History</h3>
                <button onClick={() => setShowHistory(false)}><X size={20} className="text-theme-muted"/></button>
              </div>
              <div className="p-5 space-y-2 max-h-[70vh] overflow-y-auto">
                {history.length === 0 ? (
                  <p className="text-sm text-theme-muted text-center py-6">No broadcasts sent yet.</p>
                ) : history.map((h: any) => (
                  <div key={h.id} className="card p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-theme-heading">{h.title || '(no title)'}</span>
                      <div className="flex items-center gap-2">
                        <span className="badge bg-surface-2 text-theme-muted text-[10px] uppercase">{h.channel} · {h.audience}</span>
                        <button onClick={() => deleteBroadcast(h.id)} className="text-theme-muted hover:text-red-600" title="Delete">
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-theme mt-1 line-clamp-2">{h.message}</p>
                    <div className="flex items-center gap-3 flex-wrap mt-1.5 text-xs text-theme-muted">
                      <span>{new Date(h.createdAt).toLocaleDateString('en-KE', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                      <span>{h.sent}/{h.recipientCount} sent</span>
                    </div>
                    {h.failed > 0 && h.detail && (
                      <p className="text-[11px] text-red-600 mt-1">{h.detail}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
