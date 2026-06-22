// app/owner/communication/page.tsx
// Owner broadcasts a message to all school admins or all users, via WhatsApp, email,
// or SMS. Works with no external credentials: WhatsApp links + mailto + copyable lists.
'use client';
import { useState, useEffect } from 'react';
import { Megaphone, Loader2, MessageCircle, Mail, Phone, Copy, Check } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

export default function OwnerCommunicationPage() {
  const [audience, setAudience] = useState<'admins' | 'all'>('admins');
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState('');
  const [copied, setCopied]     = useState('');

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

  // WhatsApp: opens a chat with the message prefilled (owner picks/forwards recipients).
  const whatsappFirst = () => {
    if (!message.trim()) { toast.error('Write a message first'); return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const emailAll = () => {
    if (!emails.length) { toast.error('No email addresses for this audience'); return; }
    const subject = encodeURIComponent('A message from ZARODA');
    const body = encodeURIComponent(message);
    // BCC keeps recipients private.
    window.location.href = `mailto:?bcc=${emails.join(',')}&subject=${subject}&body=${body}`;
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
          <label className="label">Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6}
            className="input w-full" placeholder="Write your announcement to schools…"/>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button onClick={whatsappFirst} className="btn-primary justify-center">
              <MessageCircle size={15}/> WhatsApp
            </button>
            <button onClick={emailAll} className="btn-ghost justify-center">
              <Mail size={15}/> Email all (BCC)
            </button>
            <button onClick={() => copy('msg', message)} className="btn-ghost justify-center">
              {copied==='msg' ? <Check size={15}/> : <Copy size={15}/>} Copy message
            </button>
          </div>
          <p className="text-[11px] text-theme-muted">
            WhatsApp opens with your message ready to forward. Email opens your mail app with all recipients BCC'd. For SMS, copy the numbers below into your SMS tool.
          </p>
        </div>

        {/* Recipient lists for SMS / external tools */}
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
