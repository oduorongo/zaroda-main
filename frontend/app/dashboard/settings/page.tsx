// ── Settings page ─────────────────────────────────────────────
// app/dashboard/settings/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { School, Bell, Key, Palette, Save, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

function SettingsPage() {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    schoolName: '', phone: '', email: '', address: '', knecCode: '',
    principalName: '', motto: '',
    mpesaPaybill: '', mpesaPasskey: '',
    atApiKey: '', atUsername: '',
    brandPrimary: '#1a2e5a', brandPrimaryDeep: '#0f1c38', brandAccent: '#d4af37',
    badgeBase64: '',
  });

  // Load existing school settings (incl. report-card brand colours)
  useEffect(() => {
    apiClient.get('/schools/settings')
      .then(r => setForm(f => ({ ...f, ...Object.fromEntries(
        Object.entries(r.data || {}).filter(([, v]) => v != null && v !== '')
      ) })))
      .catch(() => {/* first-time / no settings yet */});
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Read an image file, downscale to <=256px, store as a data URL (keeps it small).
  const onBadgeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Image too large (max 2 MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) { ctx.drawImage(img, 0, 0, w, h); }
        const dataUrl = canvas.toDataURL('image/png');
        setForm(f => ({ ...f, badgeBase64: dataUrl }));
        toast.success('Badge ready — click Save to apply');
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await apiClient.patch('/schools/settings', form);
      toast.success('Settings saved!');
    } catch { toast.error('Could not save settings'); }
    finally { setSaving(false); }
  };

  const SECTIONS = [
    {
      icon: School, title: 'School Information',
      fields: [
        { key: 'schoolName',    label: 'School Name',      placeholder: 'Starlight Primary School' },
        { key: 'phone',         label: 'School Phone',     placeholder: '+254 700 000 000' },
        { key: 'email',         label: 'School Email',     placeholder: 'info@school.ac.ke' },
        { key: 'address',       label: 'School Address',   placeholder: 'P.O. Box 1234, Nairobi' },
        { key: 'knecCode',      label: 'KNEC Code',        placeholder: '123456' },
        { key: 'principalName', label: 'Head Teacher / Principal', placeholder: 'Mr. John Doe' },
        { key: 'motto',         label: 'School Motto',     placeholder: 'Elimu Bora' },
      ],
    },
    {
      icon: Key, title: 'M-Pesa (Daraja)',
      fields: [
        { key: 'mpesaPaybill', label: 'Paybill Number', placeholder: '123456' },
        { key: 'mpesaPasskey', label: 'Passkey',        placeholder: 'From Daraja portal', type: 'password' },
      ],
    },
    {
      icon: Bell, title: "Africa's Talking (SMS)",
      fields: [
        { key: 'atApiKey',    label: 'API Key',    placeholder: 'Your AT API key', type: 'password' },
        { key: 'atUsername',  label: 'Username',   placeholder: 'Your AT username' },
      ],
    },
  ];

  const COLOURS = [
    { key: 'brandPrimary',     label: 'Primary (header & table headings)' },
    { key: 'brandPrimaryDeep', label: 'Deep shade (logo text)' },
    { key: 'brandAccent',      label: 'Accent (badges & highlights)' },
  ];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Settings</h1>
          <p className="text-sm text-theme-muted">School profile · Report card branding · M-Pesa · SMS</p>
        </div>
      </div>

      <form onSubmit={save} className="space-y-5">
        {SECTIONS.map(sec => {
          const Icon = sec.icon;
          return (
            <div key={sec.title} className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Icon size={18} className="text-theme-heading"/>
                <h3 className="font-bold text-theme-heading">{sec.title}</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sec.fields.map(f => (
                  <div key={f.key}>
                    <label className="label">{f.label}</label>
                    <input
                      type={(f as any).type || 'text'}
                      value={(form as any)[f.key]}
                      onChange={set(f.key)}
                      placeholder={f.placeholder}
                      className="input"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* ── Report Card Branding ─────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Palette size={18} className="text-theme-heading"/>
            <h3 className="font-bold text-theme-heading">Report Card Branding</h3>
          </div>
          <p className="text-sm text-theme-muted mb-4">
            These colours are applied to your school's printed report cards.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {COLOURS.map(c => (
              <div key={c.key}>
                <label className="label">{c.label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={(form as any)[c.key]}
                    onChange={set(c.key)}
                    className="h-10 w-12 rounded border cursor-pointer"
                    style={{ borderColor: 'var(--border)' }}
                  />
                  <input
                    type="text"
                    value={(form as any)[c.key]}
                    onChange={set(c.key)}
                    className="input flex-1"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* School badge / logo upload — appears on report cards */}
          <div className="mt-5">
            <label className="label">School Badge / Logo</label>
            <p className="text-xs text-theme-muted mb-2">Shown on report cards and mark lists. PNG or JPG, ideally square, under 500&nbsp;KB.</p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg border flex items-center justify-center overflow-hidden bg-surface-2" style={{ borderColor: 'var(--border)' }}>
                {form.badgeBase64
                  ? <img src={form.badgeBase64} alt="badge" className="w-full h-full object-contain"/>
                  : <span className="text-[10px] text-theme-muted text-center px-1">No badge</span>}
              </div>
              <div className="flex items-center gap-2">
                <label className="btn-ghost text-sm cursor-pointer">
                  Upload badge
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onBadgeUpload}/>
                </label>
                {form.badgeBase64 && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, badgeBase64: '' }))} className="text-sm text-red-600 hover:underline">Remove</button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3 px-4 py-3" style={{ background: form.brandPrimary }}>
              <div className="w-9 h-9 rounded-md flex items-center justify-center font-black"
                   style={{ background: form.brandAccent, color: form.brandPrimaryDeep }}>
                {(form.schoolName || 'Z').charAt(0).toUpperCase()}
              </div>
              <div className="text-white font-bold text-sm">{form.schoolName || 'Your School Name'}</div>
              <div className="ml-auto text-xs font-bold" style={{ color: form.brandAccent }}>REPORT CARD</div>
            </div>
            <div className="px-4 py-2 text-xs text-theme-muted bg-surface">
              Header preview — this is how the report card banner will look.
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <><Loader2 size={14} className="animate-spin"/> Saving…</> : <><Save size={14}/> Save Settings</>}
          </button>
        </div>
      </form>
    </div>
  );
}

export default SettingsPage;
