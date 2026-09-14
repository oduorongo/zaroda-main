'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, Link2, RefreshCw, UserPlus2, Smartphone, Users } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';
import { matchesLearner } from '@/components/LearnerSearch';

const ksh = (n: number) => 'KES ' + Number(n || 0).toLocaleString('en-KE');

export default function MpesaSettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [form, setForm] = useState({
    gateway: 'daraja' as 'daraja' | 'tuma',
    shortcode: '', consumerKey: '', consumerSecret: '', passkey: '', environment: 'production',
    tumaEmail: '', tumaApiKey: '',
  });

  const [txns, setTxns] = useState<any[]>([]);
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [tab, setTab] = useState<'settings' | 'activity' | 'unmatched'>('settings');

  // Class-teacher fee-collection override — many primary/JS schools have the class
  // teacher collect money directly rather than routing everything through a bursar.
  const [classTeacherOverride, setClassTeacherOverride] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  useEffect(() => {
    apiClient.get('/finance/settings/class-teacher-override')
      .then(r => setClassTeacherOverride(!!r.data?.enabled))
      .catch(() => {});
  }, []);
  const toggleClassTeacherOverride = async () => {
    const next = !classTeacherOverride;
    setSavingOverride(true);
    try {
      await apiClient.patch('/finance/settings/class-teacher-override', { enabled: next });
      setClassTeacherOverride(next);
      toast.success(next
        ? 'Class teachers can now record payments for learners in their own class.'
        : 'Class teachers can no longer record payments.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not update this setting.');
    } finally { setSavingOverride(false); }
  };

  const loadSettings = () => {
    setLoading(true);
    apiClient.get('/finance/mpesa/settings')
      .then(r => {
        setSettings(r.data);
        if (r.data) setForm(f => ({
          ...f, shortcode: r.data.shortcode || '', environment: r.data.environment || 'production',
          gateway: r.data.gateway === 'tuma' ? 'tuma' : 'daraja', tumaEmail: r.data.tumaEmail || '',
        }));
      })
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  };
  const loadActivity = () => {
    apiClient.get('/finance/mpesa/transactions').then(r => setTxns(r.data || [])).catch(() => setTxns([]));
    apiClient.get('/finance/mpesa/unmatched').then(r => setUnmatched(r.data || [])).catch(() => setUnmatched([]));
  };
  useEffect(() => { loadSettings(); loadActivity(); }, []);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.gateway === 'daraja' && !form.shortcode.trim()) { toast.error('Enter your Paybill or Till shortcode'); return; }
    if (form.gateway === 'tuma' && !form.tumaEmail.trim()) { toast.error("Enter your school's Tuma account email"); return; }
    setSaving(true);
    try {
      await apiClient.post('/finance/mpesa/settings', form);
      toast.success('Saved. Any keys you leave blank next time stay as they were.');
      setForm(f => ({ ...f, consumerKey: '', consumerSecret: '', passkey: '', tumaApiKey: '' })); // never echo secrets back
      loadSettings();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save settings'); }
    finally { setSaving(false); }
  };

  const registerC2b = async () => {
    setRegistering(true);
    try {
      const { data } = await apiClient.post('/finance/mpesa/settings/register-c2b');
      toast.success(data.message || 'C2B URLs registered with Safaricom.');
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not register with Safaricom'); }
    finally { setRegistering(false); }
  };

  const [assigning, setAssigning] = useState<any>(null);
  const [learnerQuery, setLearnerQuery] = useState('');
  const [allLearners, setAllLearners] = useState<any[]>([]);
  useEffect(() => {
    if (!assigning || allLearners.length) return;
    apiClient.get('/academic/learners').then(r => setAllLearners(r.data || [])).catch(() => setAllLearners([]));
  }, [assigning]);
  const learnerResults = learnerQuery.trim().length >= 2
    ? allLearners.filter(l => matchesLearner(l, learnerQuery)).slice(0, 15)
    : [];

  const assignToLearner = async (learnerId: string) => {
    try {
      await apiClient.post(`/finance/mpesa/unmatched/${assigning.id}/assign`, { learnerId });
      toast.success('Payment matched and recorded.');
      setAssigning(null); setLearnerQuery('');
      loadActivity();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not assign this payment'); }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
        <div>
          <h1 className="text-2xl font-black text-theme-heading">M-Pesa Settings</h1>
          <p className="text-sm text-theme-muted">Connect your school's own Paybill so fees post automatically when parents pay</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-theme gap-1">
        {[
          { key: 'settings', label: 'Paybill Settings' },
          { key: 'activity', label: `Activity${txns.length ? ` (${txns.length})` : ''}` },
          { key: 'unmatched', label: `Unmatched${unmatched.length ? ` (${unmatched.length})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab===t.key?'border-[#1a2e5a] text-theme-heading':'border-transparent text-theme-muted hover:text-theme-heading'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'settings' && (
        loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={26}/></div> : (
        <>
          <div className="card p-5 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-theme-heading"><Users size={16}/> Let class teachers collect fees</div>
              <button type="button" onClick={toggleClassTeacherOverride} disabled={savingOverride}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${classTeacherOverride ? 'bg-[#1a2e5a]' : 'bg-surface-2'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${classTeacherOverride ? 'translate-x-5' : ''}`}/>
              </button>
            </div>
            <p className="text-xs text-theme-muted">
              Common in primary/JS schools where the class teacher — not a bursar — collects money from learners. When on, each class teacher gets a "Collect Fees" option in their own workspace, but can only record payments for learners in the class(es) they're registered as class teacher of. Editing or deleting a payment still needs the bursar or an administrator.
            </p>
          </div>

          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-theme-heading"><Smartphone size={16}/> Choose how to collect payments</div>
            <div className="grid sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm(f => ({...f, gateway: 'daraja'}))}
                className={`text-left p-3 rounded-xl border transition-all ${form.gateway==='daraja' ? 'border-[#1a2e5a] bg-surface-2' : 'border-theme'}`}>
                <div className="font-bold text-theme-heading text-sm">Direct Paybill (Safaricom Daraja)</div>
                <div className="text-xs text-theme-muted mt-1">Needs a Daraja app from Safaricom's developer portal, but supports both STK push AND parents paying you unprompted (C2B) straight from their own M-Pesa menu.</div>
              </button>
              <button type="button" onClick={() => setForm(f => ({...f, gateway: 'tuma'}))}
                className={`text-left p-3 rounded-xl border transition-all ${form.gateway==='tuma' ? 'border-[#1a2e5a] bg-surface-2' : 'border-theme'}`}>
                <div className="font-bold text-theme-heading text-sm">Tuma</div>
                <div className="text-xs text-theme-muted mt-1">Just sign up at tuma.co.ke for an email + API key — no Safaricom developer approval needed. STK push only (parents can't pay unprompted).</div>
              </button>
            </div>
            <p className="text-sm text-theme-muted pt-1">Either way: <b>Send M-Pesa Request</b> (the "M-Pesa" button next to an invoice) pushes a prompt to a parent's phone, and the payment posts to the right learner automatically using their admission number.</p>
          </div>

          <form onSubmit={saveSettings} className="card p-5 space-y-4">
            {form.gateway === 'daraja' ? (
              <>
                <div>
                  <label className="label">Paybill / Till Number *</label>
                  <input value={form.shortcode} onChange={e => setForm(f => ({...f, shortcode: e.target.value}))} className="input" placeholder="e.g. 400200"/>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Consumer Key {settings?.hasConsumerKey && <span className="text-green-600 font-normal">· already set</span>}</label>
                    <input value={form.consumerKey} onChange={e => setForm(f => ({...f, consumerKey: e.target.value}))} className="input" placeholder={settings?.hasConsumerKey ? '•••••••• (leave blank to keep)' : 'From Daraja app'}/>
                  </div>
                  <div>
                    <label className="label">Consumer Secret {settings?.hasConsumerSecret && <span className="text-green-600 font-normal">· already set</span>}</label>
                    <input type="password" value={form.consumerSecret} onChange={e => setForm(f => ({...f, consumerSecret: e.target.value}))} className="input" placeholder={settings?.hasConsumerSecret ? '•••••••• (leave blank to keep)' : 'From Daraja app'}/>
                  </div>
                </div>
                <div>
                  <label className="label">Passkey (for STK Push) {settings?.hasPasskey && <span className="text-green-600 font-normal">· already set</span>}</label>
                  <input type="password" value={form.passkey} onChange={e => setForm(f => ({...f, passkey: e.target.value}))} className="input" placeholder={settings?.hasPasskey ? '•••••••• (leave blank to keep)' : 'Lipa Na M-Pesa Online passkey'}/>
                </div>
                <div>
                  <label className="label">Environment</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['production','sandbox'] as const).map(env => (
                      <button key={env} type="button" onClick={() => setForm(f => ({...f, environment: env}))}
                        className={`text-sm px-3 py-2.5 rounded-xl border transition-all capitalize ${form.environment===env ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]' : 'bg-white text-[#1a2e5a] border-theme'}`}>
                        {env}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-theme-muted mt-1">Use sandbox while testing with Safaricom's test credentials; switch to production once your Paybill is live.</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="label">Tuma Account Email *</label>
                  <input type="email" value={form.tumaEmail} onChange={e => setForm(f => ({...f, tumaEmail: e.target.value}))} className="input" placeholder="you@yourschool.ac.ke"/>
                </div>
                <div>
                  <label className="label">Tuma API Key {settings?.hasTumaApiKey && <span className="text-green-600 font-normal">· already set</span>}</label>
                  <input type="password" value={form.tumaApiKey} onChange={e => setForm(f => ({...f, tumaApiKey: e.target.value}))} className="input" placeholder={settings?.hasTumaApiKey ? '•••••••• (leave blank to keep)' : 'From your Tuma dashboard'}/>
                </div>
              </>
            )}
            <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
              {saving ? <Loader2 size={15} className="animate-spin"/> : <Save size={15}/>} Save Settings
            </button>
          </form>

          {form.gateway === 'daraja' && (
            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-theme-heading"><Link2 size={16}/> Accept payments parents send directly (C2B)</div>
              <p className="text-sm text-theme-muted">Registers this Paybill's confirmation URL with Safaricom, so any payment a parent sends — even without you prompting them — posts automatically. Save your settings above first.</p>
              <button onClick={registerC2b} disabled={registering || !settings?.shortcode} className="btn-primary">
                {registering ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>} Register with Safaricom
              </button>
              {!settings?.shortcode && <p className="text-xs text-amber-600">Save your Paybill shortcode first.</p>}
            </div>
          )}
        </>
        )
      )}

      {tab === 'activity' && (
        <div className="card p-5">
          {txns.length === 0 ? (
            <p className="text-sm text-theme-muted text-center py-8">No M-Pesa activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-theme-muted border-b border-theme">
                  <th className="px-2 py-2">Date</th><th className="px-2 py-2">Type</th><th className="px-2 py-2">Phone</th>
                  <th className="px-2 py-2">Reference</th><th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2">Status</th>
                </tr></thead>
                <tbody>
                  {txns.map((t: any) => (
                    <tr key={t.id} className="border-b border-theme/40">
                      <td className="px-2 py-2">{(t.createdAt || '').slice(0, 10)}</td>
                      <td className="px-2 py-2 uppercase text-xs">{t.type}</td>
                      <td className="px-2 py-2">{t.phone || '—'}</td>
                      <td className="px-2 py-2 text-theme-muted text-xs">{t.accountReference || t.mpesaReceiptNumber || '—'}</td>
                      <td className="px-2 py-2 text-right font-semibold">{ksh(t.amount)}</td>
                      <td className="px-2 py-2">
                        <span className={`badge text-[10px] ${
                          t.status === 'matched' || t.status === 'completed' ? 'bg-green-100 text-green-700'
                          : t.status === 'unmatched' ? 'bg-amber-100 text-amber-700'
                          : t.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                        }`}>{t.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'unmatched' && (
        <div className="space-y-3">
          <p className="text-sm text-theme-muted">A payment lands here when the account number the parent typed didn't match any learner's admission number — assign it to the right learner and it'll be recorded and allocated exactly like any other payment.</p>
          {unmatched.length === 0 ? (
            <div className="card p-8 text-center text-theme-muted">Nothing unmatched right now.</div>
          ) : unmatched.map((t: any) => (
            <div key={t.id} className="card p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-bold text-theme-heading">{ksh(t.amount)} <span className="font-normal text-theme-muted text-sm">from {t.phone || 'unknown number'}</span></div>
                <div className="text-xs text-theme-muted">Typed as account no.: "{t.accountReference || '(blank)'}" · {t.mpesaReceiptNumber} · {(t.createdAt||'').slice(0,10)}</div>
              </div>
              <button onClick={() => setAssigning(t)} className="btn-primary text-sm"><UserPlus2 size={14}/> Assign to learner</button>
            </div>
          ))}
        </div>
      )}

      {assigning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setAssigning(null)}>
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-theme-heading mb-1">Assign {ksh(assigning.amount)}</h3>
            <p className="text-sm text-theme-muted mb-3">Search the learner this payment belongs to</p>
            <input autoFocus value={learnerQuery} onChange={e => setLearnerQuery(e.target.value)} placeholder="Name or admission number" className="input mb-3"/>
            <div className="max-h-56 overflow-y-auto space-y-1">
              {learnerResults.map((l: any) => (
                <button key={l.id} onClick={() => assignToLearner(l.id)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 text-sm">
                  {l.firstName} {l.lastName} <span className="text-theme-muted">· Adm {l.admissionNumber || '—'}</span>
                </button>
              ))}
              {learnerQuery.trim().length >= 2 && learnerResults.length === 0 && (
                <p className="text-xs text-theme-muted px-1 py-2">No matches.</p>
              )}
            </div>
            <button onClick={() => setAssigning(null)} className="btn-ghost w-full justify-center mt-3">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
