// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// CLASS TEACHER SHARE INVITE — React Frontend
// Components: ShareInviteButton · ShareModal · InviteCard
//             InviteAnalytics · InviteAcceptPage
// Mobile responsive · WhatsApp · SMS · Copy link
// ============================================================

'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api/client';

// ─────────────────────────────────────────────────────────────
// API client
// ─────────────────────────────────────────────────────────────
export const InviteAPI = {
  generate:    (streamId: string) =>
    apiClient.post('/api/v1/invites/generate', { streamId }),
  trackShare:  (id: string, channel: string) =>
    apiClient.post(`/api/v1/invites/${id}/track-share`, { channel }),
  revoke:      (id: string) =>
    apiClient.delete(`/api/v1/invites/${id}`),
  getMyInvites:()          => apiClient.get('/api/v1/invites/mine'),
  getAnalytics:(id: string)=> apiClient.get(`/api/v1/invites/${id}/analytics`),
  // Public
  validate:    (token: string) => apiClient.get(`/api/v1/invites/validate/${token}`),
  accept:      (d: any)    => apiClient.post('/api/v1/invites/accept', d),
};

// ─────────────────────────────────────────────────────────────
// Exact message builder (mirrors backend exactly)
// ─────────────────────────────────────────────────────────────
const buildShareMessage = (teacherName: string, className: string, inviteLink: string) =>
`👋 You've been invited by ${teacherName}, ${className} Class Teacher, to join ZARODA School Management System.

Start with your class today and let the rest of the school join later.

Sign up here: ${inviteLink}

ZARODA Solutions – Empowering Schools with Technology`;


// ─────────────────────────────────────────────────────────────
// ShareInviteButton — the main entry point
// Drop this anywhere in the class teacher's dashboard
// Usage: <ShareInviteButton streamId="..." streamName="Grade 4 North" />
// ─────────────────────────────────────────────────────────────
export function ShareInviteButton({
  streamId,
  streamName,
  compact = false,
}: {
  streamId:   string;
  streamName: string;
  compact?:   boolean;
}) {
  const [open,    setOpen]    = useState(false);
  const [invite,  setInvite]  = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const loadInvite = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await InviteAPI.generate(streamId);
      setInvite(data);
      setOpen(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not generate invite link.');
    } finally { setLoading(false); }
  }, [streamId]);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={loadInvite}
        disabled={loading}
        className={`
          inline-flex items-center gap-2 font-medium rounded-xl
          bg-[#1a2e5a] text-white hover:bg-[#142347]
          active:scale-95 transition-all disabled:opacity-60
          ${compact
            ? 'px-3 py-2 text-xs'
            : 'px-5 py-3 text-sm shadow-sm hover:shadow-md'}
        `}
      >
        {loading ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Generating…
          </>
        ) : (
          <>
            <ShareIcon size={compact ? 14 : 16} />
            {compact ? 'Share' : 'Share Invite'}
          </>
        )}
      </button>

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}

      {/* Share modal */}
      {open && invite && (
        <ShareModal
          invite={invite}
          streamName={streamName}
          onClose={() => setOpen(false)}
          onRevoke={() => { setInvite(null); setOpen(false); }}
        />
      )}
    </>
  );
}


// ─────────────────────────────────────────────────────────────
// ShareModal — the full-featured sharing interface
// ─────────────────────────────────────────────────────────────
function ShareModal({
  invite,
  streamName,
  onClose,
  onRevoke,
}: {
  invite:     any;
  streamName: string;
  onClose:    () => void;
  onRevoke:   () => void;
}) {
  const [copied,       setCopied]       = useState(false);
  const [linkCopied,   setLinkCopied]   = useState(false);
  const [revoking,     setRevoking]     = useState(false);
  const [showRevoke,   setShowRevoke]   = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const shareMessage = buildShareMessage(
    invite.teacherName,
    invite.className,
    invite.inviteUrl,
  );

  // Close on overlay click
  const handleOverlay = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── WhatsApp share ─────────────────────────────────────────
  const shareWhatsApp = async () => {
    await InviteAPI.trackShare(invite.id, 'whatsapp').catch(() => {});
    const encoded = encodeURIComponent(shareMessage);
    // wa.me works on mobile (opens WhatsApp app) and desktop (opens web.whatsapp.com)
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  // ── SMS share ──────────────────────────────────────────────
  const shareSms = async () => {
    await InviteAPI.trackShare(invite.id, 'sms').catch(() => {});
    const encoded = encodeURIComponent(shareMessage);
    // iOS: sms:&body=... | Android: sms:?body=...
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    window.location.href = isIos
      ? `sms:&body=${encoded}`
      : `sms:?body=${encoded}`;
  };

  // ── Copy full message ──────────────────────────────────────
  const copyMessage = async () => {
    await navigator.clipboard.writeText(shareMessage);
    await InviteAPI.trackShare(invite.id, 'copy').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── Copy link only ─────────────────────────────────────────
  const copyLink = async () => {
    await navigator.clipboard.writeText(invite.inviteUrl);
    await InviteAPI.trackShare(invite.id, 'copy').catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };

  // ── Revoke ─────────────────────────────────────────────────
  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await InviteAPI.revoke(invite.id);
      onRevoke();
    } finally { setRevoking(false); }
  };

  // Expiry info
  const expiresAt       = new Date(invite.expiresAt);
  const daysLeft        = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));
  const spotsRemaining  = invite.spotsRemaining ?? Math.max(0, 50 - (invite.useCount || 0));
  const isExpiringSoon  = daysLeft <= 2;

  return (
    // Full-screen overlay — works on mobile too
    <div
      ref={overlayRef}
      onClick={handleOverlay}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
    >
      {/* Sheet: slides up on mobile, centered card on desktop */}
      <div className="
        w-full sm:max-w-md bg-white
        rounded-t-2xl sm:rounded-2xl
        shadow-2xl overflow-hidden
        animate-slide-up sm:animate-none
      ">
        {/* Header */}
        <div className="bg-[#1a2e5a] px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">Invite Colleagues</h2>
            <p className="text-white/70 text-xs mt-0.5">
              Share to onboard {streamName} first
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Message preview */}
          <div className="bg-[#f4f6fb] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message Preview</span>
              <button onClick={copyMessage}
                className="text-xs text-[#1a2e5a] font-medium hover:underline flex items-center gap-1">
                {copied ? (
                  <><CheckIcon size={12} className="text-green-600"/> <span className="text-green-600">Copied!</span></>
                ) : (
                  <><CopyIcon size={12}/> Copy message</>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line font-mono">
              {shareMessage}
            </p>
          </div>

          {/* Share buttons */}
          <div className="grid grid-cols-2 gap-3">
            {/* WhatsApp */}
            <button
              onClick={shareWhatsApp}
              className="flex items-center justify-center gap-2.5 px-4 py-3.5
                bg-[#25D366] text-white rounded-xl font-semibold text-sm
                hover:bg-[#20be5a] active:scale-95 transition-all shadow-sm"
            >
              <WhatsAppIcon size={20}/>
              WhatsApp
            </button>

            {/* SMS */}
            <button
              onClick={shareSms}
              className="flex items-center justify-center gap-2.5 px-4 py-3.5
                bg-[#1a2e5a] text-white rounded-xl font-semibold text-sm
                hover:bg-[#142347] active:scale-95 transition-all shadow-sm"
            >
              <SmsIcon size={20}/>
              Send SMS
            </button>
          </div>

          {/* Copy invite link */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">Invite link</p>
              <p className="text-xs font-mono text-gray-700 truncate">{invite.inviteUrl}</p>
            </div>
            <button
              onClick={copyLink}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${linkCopied
                  ? 'bg-green-100 text-green-700'
                  : 'bg-[#1a2e5a] text-white hover:bg-[#142347]'}`}
            >
              {linkCopied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          {/* Expiry / usage info */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs
            ${isExpiringSoon
              ? 'bg-orange-50 border border-orange-200'
              : 'bg-blue-50 border border-blue-100'}`}>
            <span className="text-lg">{isExpiringSoon ? '⏰' : 'ℹ️'}</span>
            <div className="flex-1">
              <span className={isExpiringSoon ? 'text-orange-700' : 'text-blue-700'}>
                {daysLeft === 0
                  ? 'Expires today'
                  : `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
                {' · '}
                {spotsRemaining} spot{spotsRemaining !== 1 ? 's' : ''} remaining
              </span>
            </div>
          </div>

          {/* Revoke section */}
          {!showRevoke ? (
            <button onClick={() => setShowRevoke(true)}
              className="w-full text-xs text-gray-400 hover:text-red-500 transition-colors py-1">
              Deactivate this link
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-red-800">Deactivate invite link?</p>
              <p className="text-xs text-red-600">This will permanently disable this link. Any existing signups are not affected.</p>
              <div className="flex gap-2">
                <button onClick={() => setShowRevoke(false)}
                  className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs">
                  Cancel
                </button>
                <button onClick={handleRevoke} disabled={revoking}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-60">
                  {revoking ? 'Deactivating…' : 'Yes, Deactivate'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Safe area spacer for iOS */}
        <div className="h-safe-bottom sm:h-0 bg-white"/>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// InviteCard — compact card showing invite status in dashboard
// ─────────────────────────────────────────────────────────────
export function InviteCard({ streamId, streamName }: { streamId: string; streamName: string }) {
  const [invite,  setInvite]  = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);

  useEffect(() => {
    InviteAPI.getMyInvites()
      .then(r => {
        const match = r.data.find((i: any) => i.className === streamName && !i.isExpired && i.isActive);
        setInvite(match || null);
      })
      .finally(() => setLoading(false));
  }, [streamName]);

  const generate = async () => {
    setLoading(true);
    try {
      const { data } = await InviteAPI.generate(streamId);
      setInvite(data);
      setOpen(true);
    } finally { setLoading(false); }
  };

  if (loading) return (
    <div className="bg-[#f4f6fb] rounded-xl p-4 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"/>
      <div className="h-3 bg-gray-100 rounded w-3/4"/>
    </div>
  );

  return (
    <>
      <div className="bg-[#f4f6fb] border border-[#1a2e5a]/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${invite ? 'bg-green-500' : 'bg-gray-300'}`}/>
            <span className="text-sm font-semibold text-gray-900">Invite Link</span>
          </div>
          {invite && (
            <span className="text-xs text-gray-400">{invite.useCount} joined</span>
          )}
        </div>

        {invite ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 truncate font-mono">{invite.inviteUrl}</p>
            <div className="flex gap-2">
              <button onClick={() => setOpen(true)}
                className="flex-1 py-2 bg-[#1a2e5a] text-white rounded-lg text-xs font-medium hover:bg-[#142347] flex items-center justify-center gap-1.5">
                <ShareIcon size={12}/> Share
              </button>
              <button onClick={generate}
                className="px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-white">
                ↻
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">No active invite link. Generate one to onboard your class.</p>
            <button onClick={generate} disabled={loading}
              className="w-full py-2 bg-[#1a2e5a] text-white rounded-lg text-xs font-medium hover:bg-[#142347] disabled:opacity-60">
              {loading ? 'Generating…' : '+ Generate Invite Link'}
            </button>
          </div>
        )}
      </div>

      {open && invite && (
        <ShareModal
          invite={invite}
          streamName={streamName}
          onClose={() => setOpen(false)}
          onRevoke={() => { setInvite(null); setOpen(false); }}
        />
      )}
    </>
  );
}


// ─────────────────────────────────────────────────────────────
// InviteAcceptPage — what the recipient sees when they open the link
// Route: /invite/[token]
// ─────────────────────────────────────────────────────────────
export function InviteAcceptPage({ token }: { token: string }) {
  const [state,   setState]   = useState<'loading'|'valid'|'invalid'|'submitting'|'done'>('loading');
  const [invite,  setInvite]  = useState<any>(null);
  const [clickId, setClickId] = useState<string | null>(null);
  const [error,   setError]   = useState('');
  const [form,    setForm]    = useState({ schoolName: '', adminName: '', adminEmail: '' });

  useEffect(() => {
    InviteAPI.validate(token)
      .then(r => {
        if (r.data.valid) {
          setInvite(r.data);
          setClickId(r.data.clickId);
          setState('valid');
        } else {
          setError(r.data.error || 'Invalid invite link.');
          setState('invalid');
        }
      })
      .catch(() => { setError('Could not verify invite link.'); setState('invalid'); });
  }, [token]);

  const submit = async () => {
    if (!form.schoolName || !form.adminName || !form.adminEmail) {
      setError('All fields are required.'); return;
    }
    setState('submitting');
    try {
      await InviteAPI.accept({
        token, clickId,
        schoolName:  form.schoolName,
        adminName:   form.adminName,
        adminEmail:  form.adminEmail,
        streamName:  invite?.invite?.className,
      });
      setState('done');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Signup failed. Please try again.');
      setState('valid');
    }
  };

  // Loading
  if (state === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6fb] p-4">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#1a2e5a] border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <p className="text-gray-500 text-sm">Verifying invite…</p>
      </div>
    </div>
  );

  // Invalid
  if (state === 'invalid') return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6fb] p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm">
        <div className="text-5xl mb-4">😕</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Invite Link Issue</h2>
        <p className="text-sm text-gray-500 mb-6">{error}</p>
        <a href="https://app.zarodasolutions.app"
          className="inline-block px-6 py-3 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347]">
          Go to ZARODA →
        </a>
      </div>
    </div>
  );

  // Done
  if (state === 'done') return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6fb] p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">You're In!</h2>
        <p className="text-sm text-gray-500 mb-1">
          Welcome to ZARODA School Management System.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Check your email at <strong>{form.adminEmail}</strong> for your login details.
        </p>
        <div className="bg-[#f4f6fb] rounded-xl p-4 text-xs text-gray-500 text-left mb-6">
          <p className="font-semibold text-[#1a2e5a] mb-1">ZARODA Solutions</p>
          <p>Empowering Schools with Technology</p>
          <p className="mt-1">+254781230805 · www.zarodasolutions.app</p>
        </div>
        <a href="https://app.zarodasolutions.app"
          className="inline-block w-full py-3 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347]">
          Go to Dashboard →
        </a>
      </div>
    </div>
  );

  // Valid — show signup form
  return (
    <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-[#1a2e5a] px-6 py-5 text-center">
          <div className="text-2xl mb-2">🎓</div>
          <h1 className="text-white font-bold text-lg">ZARODA School Management</h1>
          <p className="text-white/70 text-xs mt-1">Empowering Schools with Technology</p>
        </div>

        <div className="px-6 py-5">
          {/* Invite context */}
          <div className="bg-[#f4f6fb] rounded-xl p-4 mb-5">
            <p className="text-xs text-gray-500 mb-1">You've been invited by</p>
            <p className="font-semibold text-gray-900">
              {invite?.invite?.teacherName}
            </p>
            <p className="text-sm text-gray-600">
              {invite?.invite?.className} Class Teacher
            </p>
            <div className="flex gap-3 mt-2.5 text-xs text-gray-400">
              <span>⏱ {invite?.daysRemaining} day{invite?.daysRemaining !== 1 ? 's' : ''} left</span>
              <span>👥 {invite?.spotsRemaining} spot{invite?.spotsRemaining !== 1 ? 's' : ''} remaining</span>
            </div>
          </div>

          <h2 className="font-semibold text-gray-900 mb-1">Create Your School Account</h2>
          <p className="text-xs text-gray-500 mb-4">
            Start with your class today — the whole school can join later.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {[
              { key: 'schoolName', label: 'School Name', placeholder: 'e.g. Starlight Primary School', type: 'text' },
              { key: 'adminName',  label: 'Your Name',   placeholder: 'Principal / Head Teacher', type: 'text' },
              { key: 'adminEmail', label: 'Email Address', placeholder: 'you@school.ac.ke', type: 'email' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                <input
                  type={f.type}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({...p, [f.key]: e.target.value}))}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm
                    focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] focus:border-transparent"
                />
              </div>
            ))}
          </div>

          <button
            onClick={submit}
            disabled={state === 'submitting'}
            className="mt-5 w-full py-3.5 bg-[#1a2e5a] text-white rounded-xl text-sm font-semibold
              hover:bg-[#142347] active:scale-95 transition-all disabled:opacity-60"
          >
            {state === 'submitting' ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Creating account…
              </span>
            ) : 'Create My School Account →'}
          </button>

          <p className="text-xs text-center text-gray-400 mt-3">
            By signing up you agree to ZARODA's terms of service
          </p>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// InviteAnalytics — compact analytics panel for teacher
// ─────────────────────────────────────────────────────────────
export function InviteAnalytics({ inviteId }: { inviteId: string }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    InviteAPI.getAnalytics(inviteId).then(r => setData(r.data)).catch(() => {});
  }, [inviteId]);

  if (!data) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
      <h3 className="font-semibold text-gray-900 text-sm">{data.className} — Invite Stats</h3>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Link Clicks', value: data.clickCount,      color:'text-[#1a2e5a]' },
          { label:'Signups',     value: data.signupCount,     color:'text-green-600' },
          { label:'Conversion',  value: `${data.conversionRate}%`, color:'text-[#f5820a]' },
        ].map(s => (
          <div key={s.label} className="text-center bg-[#f4f6fb] rounded-lg p-2.5">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {data.channelsUsed?.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Shared via:</span>
          {data.channelsUsed.map((c: string) => (
            <span key={c} className="px-2 py-0.5 bg-gray-100 rounded capitalize">{c}</span>
          ))}
        </div>
      )}

      {data.signups?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Schools that signed up:</p>
          {data.signups.map((s: any, i: number) => (
            <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
              <span className="w-5 h-5 bg-[#1a2e5a] rounded-full text-white text-xs flex items-center justify-center flex-shrink-0">
                {s.schoolName?.[0]}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-800 truncate">{s.schoolName}</div>
                <div className="text-xs text-gray-400">{new Date(s.signedUpAt).toLocaleDateString('en-KE')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// SVG Icon components (no external dependency needed)
// ─────────────────────────────────────────────────────────────
function ShareIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
}

function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function SmsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function CheckIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
