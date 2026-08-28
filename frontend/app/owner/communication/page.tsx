// app/owner/communication/page.tsx
// Owner broadcasts a message to all school admins or all users, via email or SMS
// (sent for real through the platform's Resend/Africa's Talking setup) or WhatsApp
// (still a wa.me link — there's no server-side WhatsApp sender in this app).
'use client';
import { useState, useEffect } from 'react';
import { Megaphone, Loader2, MessageCircle, Mail, Phone, Copy, Check, Send } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

export default function OwnerCommunicationPage() {
  const [audience, setAudience] = useState<'admins' | 'all'>('admins');
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [title, setTitle]       = useState('');
  const [message, setMessage]   = useState('');
  const [copied, setCopied]     = useState('');
  const [sending, setSending]   = useState<'email' | 'sms' | ''>('');

  const load = (aud: string) => {
    setLoading(true);
    apiClient.get('/admin/broadcast/recipients', { params: { audience: aud } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(audience); }, [audience]);

  const recipients = data?.recipients || [];
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
    if (!title.trim()) { toast.error('Write a subject/title first'); return; }
    if (!message.trim()) { toast.error('Write a message first'); return; }
    setSending(channel);
    try {
      const { data: result } = await apiClient.post('/admin/broadcast', {
        audience, title, message, channels: [channel],
      });
      if (result?.error) { toast.error(result.error); return; }
      const stats = result[channel];
      if (!stats) { toast.error('No response for this channel.'); return; }
      toast.success(`Sent ${stats.sent}/${stats.attempted} via ${channel === 'email' ? 'email' : 'SMS'}.`);
      if (stats.sent === 0 && stats.detail) toast.error(`${channel === 'email' ? 'Email' : 'SMS'}: ${stats.detail}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || `Could not send ${channel}.`);
    } finally {
      setSending('');
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <Megaphone className="text-theme-muted" size={20}/>
          <h1 className="text-xl font-black text-theme-heading">Communication</h1>
        </div>
        <p className="text-sm text-theme-muted">Send a message to school admins or all users across the platform.</p>

        {/* Audience */}
        <div className="card p-4 space-y-3">
          <label className="label">Audience</label>
          <div className="flex gap-1">
            {([['admins','School admins'],['all','All users']] as const).map(([v,label]) => (
              <button key={v} onClick={() => setAudience(v)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${audience===v ? 'bg-[#1a2e5a] text-white' : 'bg-surface-2 text-theme-muted'}`}>
                {label}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="flex justify-center py-3"><Loader2 className="animate-spin text-theme-muted" size={18}/></div>
          ) : data && (
            <div className="text-xs text-theme-muted flex gap-4">
              <span><b className="text-theme-heading">{data.count}</b> recipients</span>
              <span><Phone size={11} className="inline"/> {data.withPhone} with phone</span>
              <span><Mail size={11} className="inline"/> {data.withEmail} with email</span>
            </div>
          )}
        </div>

        {/* Message */}
        <div className="card p-4 space-y-3">
          <label className="label">Subject</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className="input w-full"
            placeholder="Subject line (used for email; ignored for SMS)"/>
          <label className="label">Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6}
            className="input w-full" placeholder="Write your announcement to schools…"/>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button onClick={() => sendReal('email')} disabled={sending === 'email'} className="btn-primary justify-center">
              {sending === 'email' ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>} Send Email
            </button>
            <button onClick={() => sendReal('sms')} disabled={sending === 'sms'} className="btn-primary justify-center">
              {sending === 'sms' ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>} Send SMS
            </button>
            <button onClick={whatsappFirst} className="btn-ghost justify-center">
              <MessageCircle size={15}/> WhatsApp
            </button>
          </div>
          <p className="text-[11px] text-theme-muted">
            Email and SMS send for real to every recipient in this audience. WhatsApp has no automated sender —
            it opens a chat with the message ready to forward manually.
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
      </div>
    </div>
  );
}
