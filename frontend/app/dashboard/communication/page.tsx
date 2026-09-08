'use client';
import { useState, useEffect } from 'react';
import { Bell, Send, Megaphone, Loader2, X, Plus, Wallet, History, Trash2 } from 'lucide-react';
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
  low:    'bg-gray-100 text-gray-700',
  normal: 'bg-blue-100 text-blue-700',
  high:   'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100  text-red-700',
};

// GSM-7 basic + extension charset — everything else (emoji, most accented letters,
// Kiswahili-specific punctuation, etc.) forces the whole message into UCS-2, which
// has a much smaller per-segment budget. Matches what carriers actually bill on.
// eslint-disable-next-line no-control-regex
const GSM7_RE = /^[ -~¡£¤¥§¿ÄÅÆÉÑÖØÜßàäåæèéìñòöøùüΓΔΘΛΞΠΣΦΨΩ€]*$/;

// Estimates the SMS unit count Africa's Talking will actually bill for — a single
// segment caps at 160 chars (GSM-7) / 70 (UCS-2), and once a message needs to be
// concatenated across multiple segments each one drops to 153 / 67 chars to leave
// room for the concatenation header.
function smsSegments(text: string): { count: number; perSegment: number; charset: 'GSM-7' | 'UCS-2' } {
  const gsm7 = GSM7_RE.test(text);
  const singleCap = gsm7 ? 160 : 70;
  const multiCap = gsm7 ? 153 : 67;
  const len = text.length;
  if (len === 0) return { count: 0, perSegment: singleCap, charset: gsm7 ? 'GSM-7' : 'UCS-2' };
  if (len <= singleCap) return { count: 1, perSegment: singleCap, charset: gsm7 ? 'GSM-7' : 'UCS-2' };
  return { count: Math.ceil(len / multiCap), perSegment: multiCap, charset: gsm7 ? 'GSM-7' : 'UCS-2' };
}

export default function CommunicationPage() {
  const { user } = useAuth();
  const [tab,    setTab]    = useState<'announcements'|'reminders'>('announcements');
  const [items,  setItems]  = useState<any[]>([]);
  const [loading,setLoading]= useState(true);
  const [showNew,setShowNew]= useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({ title:'', content:'', audience:'all', priority:'normal', channel:'sms' });
  const [reminderTerm, setReminderTerm] = useState('term_1');
  const [reminderChannel, setReminderChannel] = useState('sms');
  const [sendingReminders, setSendingReminders] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const [wallet, setWallet] = useState<{ balance: number; pricePerSms: number } | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpForm, setTopUpForm] = useState({ amount: 100, phone: '' });
  const [topUpStep, setTopUpStep] = useState<'form'|'waiting'>('form');
  const [toppingUp, setToppingUp] = useState(false);
  const [showTxns, setShowTxns] = useState(false);
  const [txns, setTxns] = useState<any[]>([]);
  const [blacklistWarning, setBlacklistWarning] = useState<{ checked: number; blacklisted: number } | null>(null);
  const [showBlacklist, setShowBlacklist] = useState(false);
  const [blacklistRows, setBlacklistRows] = useState<any[]>([]);
  const [blacklistLoading, setBlacklistLoading] = useState(false);
  const [confirmingOptIn, setConfirmingOptIn] = useState<string | null>(null);
  const openBlacklist = () => {
    setShowBlacklist(true);
    setBlacklistLoading(true);
    apiClient.get('/communication/sms-blacklist')
      .then(r => setBlacklistRows(Array.isArray(r.data) ? r.data : []))
      .catch(() => setBlacklistRows([]))
      .finally(() => setBlacklistLoading(false));
  };
  const toggleOptIn = async (phone: string, confirm: boolean) => {
    setConfirmingOptIn(phone);
    try {
      if (confirm) await apiClient.post(`/communication/sms-blacklist/${encodeURIComponent(phone)}/confirm-opt-in`);
      else await apiClient.delete(`/communication/sms-blacklist/${encodeURIComponent(phone)}/confirm-opt-in`);
      toast.success(confirm ? 'Marked as opted back in — future sends will include this number.' : 'Un-confirmed.');
      openBlacklist();
    } catch { toast.error('Could not update.'); } finally { setConfirmingOptIn(null); }
  };

  // Warn in-app before sending if some of this audience's numbers are known,
  // from past sends, to have opted out of promotional SMS — the numbers
  // themselves can never be warned by SMS since the telco blocks it outright.
  useEffect(() => {
    if (!showNew || (form.channel !== 'sms' && form.channel !== 'all')) { setBlacklistWarning(null); return; }
    apiClient.get('/communication/sms-blacklist-check', { params: { audience: form.audience } })
      .then(r => setBlacklistWarning(r.data))
      .catch(() => setBlacklistWarning(null));
  }, [showNew, form.audience, form.channel]);

  const loadWallet = () => apiClient.get('/communication/sms-wallet').then(r => setWallet(r.data)).catch(() => {});

  const load = () => {
    setLoading(true);
    apiClient.get('/communication/announcements')
      .then(r => setItems(r.data))
      .catch((err: any) => toast.error(err?.response?.data?.message || 'Could not load announcements'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); loadWallet(); }, []);

  const openTxns = () => {
    setShowTxns(true);
    apiClient.get('/communication/sms-wallet/transactions').then(r => setTxns(r.data)).catch(() => setTxns([]));
  };

  const topUpSmsWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topUpForm.phone) { toast.error('Enter the M-Pesa phone number to pay with.'); return; }
    if (!topUpForm.amount || topUpForm.amount < 10) { toast.error('Enter an amount of at least KES 10.'); return; }
    setToppingUp(true);
    try {
      const { data } = await apiClient.post('/communication/sms-wallet/topup', topUpForm);
      toast.success(data.message || 'Check your phone for the M-Pesa prompt.');
      setTopUpStep('waiting');

      const transactionId = data.transactionId;
      let paid = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const { data: s } = await apiClient.get(`/communication/sms-wallet/topup/status/${transactionId}`);
        if (s.status === 'paid') { paid = true; break; }
        if (s.status === 'failed') { toast.error('Payment failed or was cancelled.'); break; }
      }
      if (!paid) {
        toast.error('Payment not confirmed in time. Please try again.');
        setTopUpStep('form');
        setToppingUp(false);
        return;
      }
      toast.success('SMS wallet topped up!');
      setShowTopUp(false);
      setTopUpStep('form');
      loadWallet();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not complete top-up.'); }
    finally { setToppingUp(false); }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const channelLabel = form.channel === 'all' ? 'SMS + Email' : form.channel === 'sms' ? 'SMS' : form.channel === 'email' ? 'Email' : 'in-app notice only';
    const ok = window.confirm(`Send this announcement via ${channelLabel} to "${AUDIENCE_OPTS.find(a => a.value === form.audience)?.label || form.audience}"?\n\nThis cannot be undone.`);
    if (!ok) return;
    setSaving(true);
    try {
      const { data } = await apiClient.post('/communication/announcements', form);
      const parts: string[] = [];
      if (data.sms) parts.push(`SMS ${data.sms.sent}/${data.sms.attempted}`);
      if (data.email) parts.push(`Email ${data.email.sent}/${data.email.attempted}`);
      toast.success(parts.length ? `Sent — ${parts.join(', ')}` : 'Announcement saved!');
      if (data.sms?.detail && data.sms.failed > 0) toast.error(`SMS: ${data.sms.detail}`, { duration: 8000 });
      if (data.email?.detail && data.email.failed > 0) toast.error(`Email: ${data.email.detail}`, { duration: 8000 });
      setShowNew(false);
      setForm({ title:'', content:'', audience:'all', priority:'normal', channel:'sms' });
      load();
      if (data.sms) loadWallet();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not send announcement');
    }
    finally { setSaving(false); }
  };

  const retrySms = async (id: string) => {
    const ok = window.confirm('Retry SMS for only the recipients that failed last time? Anyone who already received it will not be messaged again.');
    if (!ok) return;
    setRetrying(id);
    try {
      const { data } = await apiClient.post(`/communication/announcements/${id}/retry-sms`);
      if (data.error) { toast.error(data.error); return; }
      toast.success(data.message || 'Retry complete.');
      load();
      loadWallet();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not retry.');
    } finally {
      setRetrying(null);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('Delete this from your announcement history? The message already sent can\'t be unsent — this just removes the record.')) return;
    try {
      await apiClient.delete(`/communication/announcements/${id}`);
      toast.success('Deleted.');
      load();
    } catch { toast.error('Could not delete.'); }
  };

  const sendFeeReminders = async () => {
    const channelLabel = reminderChannel === 'all' ? 'SMS + Email' : reminderChannel.toUpperCase();
    const ok = window.confirm(`Send fee reminders via ${channelLabel} to every parent with an outstanding balance?\n\nThis cannot be undone.`);
    if (!ok) return;
    setSendingReminders(true);
    try {
      const { data } = await apiClient.post('/communication/fee-reminders', {
        term: reminderTerm, academicYear: '2025/2026', channel: reminderChannel,
      });
      toast.success(data.message || `Sent to ${data.count} parents.`);
      if (data.sms?.failed > 0 && data.sms?.detail) toast.error(`SMS: ${data.sms.detail}`, { duration: 8000 });
      if (data.email?.failed > 0 && data.email?.detail) toast.error(`Email: ${data.email.detail}`, { duration: 8000 });
      if (data.sms) loadWallet();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not send reminders');
    } finally {
      setSendingReminders(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Communication</h1>
          <p className="text-sm text-theme-muted">Announcements · Fee reminders</p>
        </div>
        {isHoi(user?.role || '') && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-center rounded-xl px-3 py-1.5 bg-[#1a2e5a] text-white">
              <div className="text-[10px] text-[#d4af37] uppercase tracking-wide leading-none">SMS Wallet</div>
              <div className="font-bold text-sm leading-tight">KES {wallet?.balance ?? '…'}</div>
            </div>
            <button onClick={() => setShowTopUp(true)} className="btn-primary text-xs px-2.5 py-1.5">
              <Wallet size={13}/> Top Up
            </button>
            <button onClick={openTxns} className="btn-ghost text-xs px-2.5 py-1.5">
              <History size={13}/> History
            </button>
            <button onClick={openBlacklist} className="btn-ghost text-xs px-2.5 py-1.5">
              <X size={13}/> Blacklisted Numbers
            </button>
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
        {[{key:'announcements',label:'📢 Announcements'},{key:'reminders',label:'🔔 Reminders'}].map(t => (
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
                      <button onClick={() => deleteAnnouncement(a.id)} className="ml-auto text-theme-muted hover:text-red-600" title="Delete">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                    <p className="text-sm text-theme mt-1 line-clamp-2">{a.content}</p>
                    <div className="flex items-center gap-3 flex-wrap mt-1.5">
                      <p className="text-xs text-theme-muted">
                        {a.sentAt ? new Date(a.sentAt).toLocaleDateString('en-KE', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Draft'}
                      </p>
                      {a.delivery?.sms && (
                        <span className="text-[11px] text-theme-muted">SMS {a.delivery.sms.sent}/{a.delivery.sms.attempted}</span>
                      )}
                      {a.delivery?.email && (
                        <span className="text-[11px] text-theme-muted">Email {a.delivery.email.sent}/{a.delivery.email.attempted}</span>
                      )}
                    </div>
                    {a.delivery?.sms?.failed > 0 && a.delivery.sms.detail && (
                      <p className="text-[11px] text-red-600 mt-1">SMS: {a.delivery.sms.detail}</p>
                    )}
                    {a.delivery?.email?.failed > 0 && a.delivery.email.detail && (
                      <p className="text-[11px] text-red-600 mt-1">Email: {a.delivery.email.detail}</p>
                    )}
                    {a.delivery?.sms?.failedNumbers?.length > 0 && (
                      <button onClick={() => retrySms(a.id)} disabled={retrying === a.id}
                        className="text-[11px] font-semibold text-[#1a2e5a] hover:underline mt-1">
                        {retrying === a.id ? 'Retrying…' : `Retry SMS for the ${a.delivery.sms.failedNumbers.length} that failed →`}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'reminders' && (
        <div className="card p-6 space-y-4">
          <h3 className="font-bold text-theme-heading">Bulk Fee Reminders</h3>
          <p className="text-sm text-theme-muted">Send personalised fee reminders to all parents with outstanding balances. Each message includes the learner's name, balance, and due date.</p>
          <div className="flex gap-3">
            <select value={reminderTerm} onChange={e => setReminderTerm(e.target.value)} className="input w-36">
              <option value="term_1">Term 1</option>
              <option value="term_2">Term 2</option>
              <option value="term_3">Term 3</option>
            </select>
            <select value={reminderChannel} onChange={e => setReminderChannel(e.target.value)} className="input w-36">
              <option value="sms">SMS only</option>
              <option value="email">Email only</option>
              <option value="all">SMS + Email</option>
            </select>
            <button onClick={sendFeeReminders} disabled={sendingReminders} className="btn-primary">
              {sendingReminders ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Send Reminders
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
                <p className="text-xs text-theme-muted mt-1">
                  {form.channel === 'sms'
                    ? "Just a label for this announcement's history — not sent in the SMS text."
                    : 'Used as the email subject line, and as this announcement\'s label in its history.'}
                </p>
              </div>
              <div>
                <label className="label">Message *</label>
                <textarea required value={form.content} onChange={set('content') as any} rows={4}
                  className="input resize-none" placeholder="Your announcement here…"/>
                {(form.channel === 'sms' || form.channel === 'all') && form.content && (() => {
                  const seg = smsSegments(form.content);
                  const cost = seg.count * (wallet?.pricePerSms ?? 1);
                  return (
                    <p className={`text-xs mt-1.5 ${seg.count > 1 ? 'text-amber-600' : 'text-theme-muted'}`}>
                      {form.content.length} characters ({seg.charset}) — {seg.count} SMS {seg.count === 1 ? 'segment' : 'segments'} per recipient
                      {seg.count > 1 ? ' (billed as multiple messages)' : ''} · KES {cost} per recipient
                    </p>
                  );
                })()}
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
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="label">Channel</label>
                  <select value={form.channel} onChange={set('channel')} className="input">
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                    <option value="all">SMS + Email</option>
                    <option value="push">Don't send — save as in-app notice only</option>
                  </select>
                </div>
              </div>
              {blacklistWarning && blacklistWarning.blacklisted > 0 && (
                <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-lg">
                  ⚠️ {blacklistWarning.blacklisted} of {blacklistWarning.checked} recipients in this audience previously opted out of promotional SMS. They&apos;ll be skipped automatically (no wallet cost) unless confirmed opted back in — see <button type="button" onClick={openBlacklist} className="underline font-semibold">Blacklisted Numbers</button>.
                </p>
              )}
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

      {/* Top Up SMS Wallet Modal */}
      {showTopUp && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md my-8 mt-24">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <div>
                <h3 className="text-lg font-bold text-theme-heading">Top Up SMS Wallet</h3>
                <p className="text-xs text-theme-muted mt-0.5">Pay via M-Pesa, then every SMS you send draws from this balance.</p>
              </div>
              <button onClick={() => setShowTopUp(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={topUpSmsWallet} className="p-5 space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-700">
                Each SMS costs KES {wallet?.pricePerSms ?? 1} — announcements and fee reminders both draw from this wallet.
              </div>
              <div>
                <label className="label">Amount (KES) *</label>
                <input required type="number" min={10} value={topUpForm.amount}
                  onChange={(e) => setTopUpForm(f => ({ ...f, amount: Number(e.target.value) }))}
                  className="input" disabled={topUpStep === 'waiting'}/>
              </div>
              <div>
                <label className="label">M-Pesa Phone Number *</label>
                <input required type="tel" placeholder="07XXXXXXXX" value={topUpForm.phone}
                  onChange={(e) => setTopUpForm(f => ({ ...f, phone: e.target.value }))}
                  className="input" disabled={topUpStep === 'waiting'}/>
              </div>
              {topUpStep === 'waiting' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin flex-shrink-0"/>
                  Waiting for M-Pesa confirmation on your phone…
                </div>
              )}
              <div className="flex gap-3 border-t border-theme pt-4">
                <button type="button" onClick={() => setShowTopUp(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={toppingUp} className="btn-primary flex-1">
                  {toppingUp
                    ? <><Loader2 size={14} className="animate-spin"/> {topUpStep === 'waiting' ? 'Confirming…' : 'Starting…'}</>
                    : <><Wallet size={14}/> Pay KES {topUpForm.amount || 0}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SMS Wallet Transactions Modal */}
      {showTxns && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg my-8 mt-16">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">SMS Wallet History</h3>
              <button onClick={() => setShowTxns(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-2 max-h-[60vh] overflow-y-auto">
              {txns.length === 0 ? (
                <p className="text-sm text-theme-muted text-center py-6">No transactions yet.</p>
              ) : txns.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-2">
                  <div>
                    <p className="text-sm font-semibold text-theme-heading">{t.description || (t.type === 'topup' ? 'Top-up' : 'SMS sent')}</p>
                    <p className="text-xs text-theme-muted">{new Date(t.createdAt).toLocaleDateString('en-KE', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}{t.smsCount ? ` · ${t.smsCount} SMS` : ''}</p>
                  </div>
                  <span className={`text-sm font-bold ${t.type === 'topup' ? 'text-green-600' : 'text-red-500'}`}>
                    {t.type === 'topup' ? '+' : '-'}KES {t.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Blacklisted Numbers Modal */}
      {showBlacklist && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl my-8 mt-16">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <div>
                <h3 className="text-lg font-bold text-theme-heading">Blacklisted Numbers</h3>
                <p className="text-xs text-theme-muted mt-0.5">Numbers Africa&apos;s Talking rejected as telco opted-out. Have the guardian dial <span className="font-mono">*456*9#</span> → 5 Marketing messages → Activate all promo messages, then confirm here.</p>
              </div>
              <button onClick={() => setShowBlacklist(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-2 max-h-[60vh] overflow-y-auto">
              {blacklistLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="animate-spin text-theme-muted" size={20}/></div>
              ) : blacklistRows.length === 0 ? (
                <p className="text-sm text-theme-muted text-center py-6">No blacklisted numbers among your recipients.</p>
              ) : blacklistRows.map((b: any) => (
                <div key={b.phoneNumber} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-surface-2 flex-wrap">
                  <div>
                    <p className="text-sm font-mono font-semibold text-theme-heading">{b.phoneNumber}</p>
                    <p className="text-xs text-theme-muted">Flagged {b.flaggedCount}× · last {new Date(b.lastFlaggedAt).toLocaleDateString('en-KE', { day:'numeric', month:'short' })}</p>
                  </div>
                  {b.optedInConfirmed ? (
                    <button onClick={() => toggleOptIn(b.phoneNumber, false)} disabled={confirmingOptIn === b.phoneNumber}
                      className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                      ✓ Opted back in — undo
                    </button>
                  ) : (
                    <button onClick={() => toggleOptIn(b.phoneNumber, true)} disabled={confirmingOptIn === b.phoneNumber}
                      className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1a2e5a] text-white">
                      Mark confirmed opted back in
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
