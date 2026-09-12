// app/owner/communication/page.tsx
// Owner broadcasts a message to all school admins or all users, via email or SMS
// (sent for real through the platform's Resend/Africa's Talking setup) or WhatsApp
// (still a wa.me link — there's no server-side WhatsApp sender in this app).
'use client';
import { useState, useEffect } from 'react';
import { Megaphone, Loader2, MessageCircle, Mail, Phone, Copy, Check, Send, AlertTriangle, History, X, Trash2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

// Same GSM-7/UCS-2 segment estimate as the tenant Communication composer
// (app/dashboard/communication/page.tsx) — a message over 160 chars (70 with
// emoji/unusual punctuation) splits into multiple SMS units per recipient.
// eslint-disable-next-line no-control-regex
const GSM7_RE = /^[\x20-\x7E¡£¤¥§¿ÄÅÆÉÑÖØÜßàäåæèéìñòöøùüΓΔΘΛΞΠΣΦΨΩ€]*$/;
function smsSegments(text: string): { count: number; charset: 'GSM-7' | 'UCS-2' } {
  const gsm7 = GSM7_RE.test(text);
  const singleCap = gsm7 ? 160 : 70;
  const multiCap = gsm7 ? 153 : 67;
  const len = text.length;
  if (len === 0) return { count: 0, charset: gsm7 ? 'GSM-7' : 'UCS-2' };
  if (len <= singleCap) return { count: 1, charset: gsm7 ? 'GSM-7' : 'UCS-2' };
  return { count: Math.ceil(len / multiCap), charset: gsm7 ? 'GSM-7' : 'UCS-2' };
}

export default function OwnerCommunicationPage() {
  const [audience, setAudience] = useState<'admins' | 'all' | 'individual' | 'incomplete'>('admins');
  const [data, setData]         = useState<any>(null);
  const [incomplete, setIncomplete] = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [title, setTitle]       = useState('');
  const [message, setMessage]   = useState('');
  const [copied, setCopied]     = useState('');
  const [sending, setSending]   = useState<'email' | 'sms' | ''>('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory]   = useState<any[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Real delivery status from Africa's Talking's Delivery Report webhook — separate
  // from the "sent" counts above, which only mean the telco accepted the message.
  const [showDlr, setShowDlr]   = useState(false);
  const [dlrRows, setDlrRows]   = useState<any[]>([]);
  const [dlrLoading, setDlrLoading] = useState(false);
  const openDlr = () => {
    setShowDlr(true);
    setDlrLoading(true);
    apiClient.get('/admin/sms-delivery-reports')
      .then(r => setDlrRows(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDlrRows([]))
      .finally(() => setDlrLoading(false));
  };

  // Diagnostic: send one SMS to one specific number, outside the audience/bulk
  // flow — what AT support asks for when troubleshooting a Sender ID/blacklist
  // issue on a particular number.
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const sendTestSms = async () => {
    if (!testPhone.trim()) { toast.error('Enter a phone number'); return; }
    setSendingTest(true);
    setTestResult(null);
    try {
      const { data } = await apiClient.post('/admin/test-sms', { phone: testPhone.trim(), message: testMessage.trim() || undefined });
      setTestResult(data);
      if (data.sent > 0) toast.success('Sent — check the phone.');
      else toast.error(data.detail || 'Not sent — see details below.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not send test SMS.');
    } finally {
      setSendingTest(false);
    }
  };

  const openHistory = () => {
    setShowHistory(true);
    apiClient.get('/admin/broadcast-history').then(r => setHistory(Array.isArray(r.data) ? r.data : [])).catch(() => setHistory([]));
  };

  const retryBroadcastSms = async (id: string) => {
    const ok = window.confirm('Retry SMS for only the recipients that failed last time?');
    if (!ok) return;
    setRetrying(id);
    try {
      const { data } = await apiClient.post(`/admin/broadcast-history/${id}/retry-sms`);
      if (data.error) { toast.error(data.error); return; }
      toast.success(data.message || 'Retry complete.');
      openHistory();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not retry.');
    } finally {
      setRetrying(null);
    }
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

  // Sends for real via POST /admin/broadcast (Resend for email, Africa's Talking for
  // SMS) — no dependency on the viewer having a desktop mail app configured, unlike
  // the mailto: link this replaced.
  const sendReal = async (channel: 'email' | 'sms') => {
    if (audience !== 'incomplete') {
      if (!title.trim()) { toast.error('Write a subject/title first'); return; }
      if (!message.trim()) { toast.error('Write a message first'); return; }
    }
    const recipientCount = channel === 'sms' ? phones.length : emails.length;
    const smsNote = channel === 'sms' && message.trim()
      ? ` (${smsSegments(message).count} SMS unit${smsSegments(message).count === 1 ? '' : 's'} each)`
      : '';
    const ok = window.confirm(
      `Send this ${channel === 'sms' ? 'SMS' : 'email'} to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}${smsNote}?\n\nThis cannot be undone.`,
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
      toast.success(`Sent ${stats.sent}/${stats.attempted} via ${channel === 'email' ? 'email' : 'SMS'}.`);
      if (stats.failed > 0 && stats.detail) toast.error(`${channel === 'email' ? 'Email' : 'SMS'}: ${stats.detail}`, { duration: 8000 });
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
            <button onClick={openDlr} className="btn-ghost text-xs px-2.5 py-1.5">
              <Check size={13}/> Delivery Reports
            </button>
            <button onClick={openHistory} className="btn-ghost text-xs px-2.5 py-1.5">
              <History size={13}/> History
            </button>
          </div>
        </div>
        <p className="text-sm text-theme-muted">Send a message to school admins, all users, individual (no-school) teacher accounts, or nudge schools that haven't finished setup.</p>

        {/* Test SMS — one number, outside the bulk/audience flow */}
        <div className="card p-4 space-y-3 border border-blue-200/60 bg-blue-50/30">
          <div className="flex items-center gap-2">
            <Phone size={15} className="text-[#1a2e5a]"/>
            <span className="text-sm font-semibold text-theme-heading">Send test SMS to one number</span>
          </div>
          <p className="text-xs text-theme-muted">
            For troubleshooting with Africa's Talking support — e.g. confirming a specific number is no longer blacklisted after activating promo messages.
          </p>
          <div className="flex flex-wrap gap-2">
            <input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="07XXXXXXXX or +2547XXXXXXXX"
              className="input text-sm flex-1 min-w-[160px]"/>
            <input value={testMessage} onChange={e => setTestMessage(e.target.value)} placeholder="Message (optional — a default test message is used)"
              className="input text-sm flex-[2] min-w-[200px]"/>
            <button onClick={sendTestSms} disabled={sendingTest} className="btn-primary text-sm">
              {sendingTest ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Send
            </button>
          </div>
          {testResult && (
            <div className="text-xs bg-surface-2 rounded-lg p-3 space-y-1">
              <div><b>Sent:</b> {testResult.sent} / <b>Failed:</b> {testResult.failed}</div>
              {testResult.detail && <div><b>Detail:</b> {testResult.detail}</div>}
            </div>
          )}
        </div>

        {/* Audience */}
        <div className="card p-4 space-y-3">
          <label className="label">Audience</label>
          <div className="flex gap-1">
            {([['admins','School admins'],['all','All users'],['individual','Individual accounts'],['incomplete','Incomplete setup']] as const).map(([v,label]) => (
              <button key={v} onClick={() => setAudience(v)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${audience===v ? 'bg-[#1a2e5a] text-white' : 'bg-surface-2 text-theme-muted'}`}>
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
            <>
              <div className="text-xs text-theme-muted flex gap-4">
                <span><b className="text-theme-heading">{data.count}</b> recipients</span>
                <span><Phone size={11} className="inline"/> {data.withPhone} with phone</span>
                <span><Mail size={11} className="inline"/> {data.withEmail} with email</span>
              </div>
              {data.blacklisted > 0 && (
                <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-lg">
                  ⚠️ {data.blacklisted} of {data.withPhone} phone numbers previously opted out of promotional SMS and will likely reject an SMS send again.
                </p>
              )}
            </>
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
                placeholder="Subject line (used for email; ignored for SMS)"/>
            </>
          )}
          <label className="label">Message{audience === 'incomplete' ? ' (optional — a default reminder is used if left blank)' : ''}</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6}
            className="input w-full"
            placeholder={audience === 'incomplete'
              ? "Leave blank to send the default reminder to finish setup, or write your own…"
              : "Write your announcement to schools…"}/>
          {message.trim() && (() => {
            const seg = smsSegments(message);
            return (
              <p className={`text-xs -mt-1 ${seg.count > 1 ? 'text-amber-600' : 'text-theme-muted'}`}>
                {message.length} characters ({seg.charset}) — as SMS: {seg.count} unit{seg.count === 1 ? '' : 's'} per recipient
                {seg.count > 1 ? ' (billed as multiple messages)' : ''}
              </p>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button onClick={() => sendReal('email')} disabled={sending === 'email'}
              className="justify-center flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">
              {sending === 'email' ? <Loader2 size={15} className="animate-spin"/> : <Mail size={15}/>} Send Email
            </button>
            <button onClick={() => sendReal('sms')} disabled={sending === 'sms'}
              className="justify-center flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-60">
              {sending === 'sms' ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>} Send SMS
            </button>
            {audience !== 'incomplete' && (
              <button onClick={whatsappFirst} className="btn-ghost justify-center">
                <MessageCircle size={15}/> WhatsApp
              </button>
            )}
          </div>
          <p className="text-[11px] text-theme-muted">
            {audience === 'incomplete'
              ? 'Email and SMS go only to admins of schools with incomplete setup — not the full recipient list.'
              : 'Email and SMS send for real to every recipient in this audience. WhatsApp has no automated sender — it opens a chat with the message ready to forward manually.'}
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
                    {h.channel === 'sms' && h.failedNumbers?.length > 0 && (
                      <button onClick={() => retryBroadcastSms(h.id)} disabled={retrying === h.id}
                        className="text-[11px] font-semibold text-[#1a2e5a] hover:underline mt-1">
                        {retrying === h.id ? 'Retrying…' : `Retry SMS for the ${h.failedNumbers.length} that failed →`}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showDlr && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
            <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl my-8 mt-16">
              <div className="flex items-center justify-between p-5 border-b border-theme">
                <div>
                  <h3 className="text-lg font-bold text-theme-heading">Delivery Reports</h3>
                  <p className="text-xs text-theme-muted mt-0.5">What Africa&apos;s Talking confirms actually reached each phone — not just what we sent.</p>
                </div>
                <button onClick={() => setShowDlr(false)}><X size={20} className="text-theme-muted"/></button>
              </div>
              <div className="p-5 space-y-2 max-h-[70vh] overflow-y-auto">
                {dlrLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="animate-spin text-theme-muted" size={20}/></div>
                ) : dlrRows.length === 0 ? (
                  <p className="text-sm text-theme-muted text-center py-6">
                    No delivery reports yet. Make sure the callback URL is registered on the Africa&apos;s Talking dashboard under SMS → Delivery Reports, then send an SMS — reports usually land within a couple of minutes.
                  </p>
                ) : dlrRows.map((d: any) => {
                  const ok = /success|delivered/i.test(d.status || '');
                  return (
                    <div key={d.id} className="card p-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <span className="font-mono text-sm text-theme-heading">{d.phoneNumber || '—'}</span>
                        {d.failureReason && <p className="text-[11px] text-red-600 mt-0.5">{d.failureReason}</p>}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`badge ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} text-[10px] uppercase`}>{d.status || 'unknown'}</span>
                        <span className="text-theme-muted">{new Date(d.receivedAt).toLocaleString('en-KE', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
