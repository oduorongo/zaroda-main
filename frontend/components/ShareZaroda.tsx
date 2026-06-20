// components/ShareZaroda.tsx
// Marketing share panel available to every user. Offers a short and a detailed
// referral message, auto-filled with the school name, carrying both the public
// sign-up link and the user's personal referral link. Copy + WhatsApp per version.
'use client';
import { useState, useEffect } from 'react';
import { Share2, Copy, X, MessageCircle, Check } from 'lucide-react';
import apiClient from '@/lib/api/client';

function buildMessages(schoolName: string, signupUrl: string) {
  const school = schoolName && schoolName.trim() ? schoolName.trim() : 'our school';
  const link = signupUrl;

  const short =
`Still compiling mark lists and report cards by hand? 📚

We use ZARODA School Management System at ${school} — teachers enter marks online, CBC report cards generate automatically, and fees are tracked per learner.

Built in Kenya for the CBC/CBE curriculum. Take a look 👉 ${link}`;

  const detailed =
`Tired of chasing marks on paper and recalculating report cards by hand? 📚

I'm using *ZARODA School Management System* at ${school} and it has changed how we run the school.

If your school still struggles with:
• Teachers submitting marks late, on loose sheets
• Hours spent compiling mark lists and ranking learners by hand
• Report cards that don't follow CBC performance levels (EE, ME, AE, BE)
• Fee balances tracked in books that never quite add up
• No quick way for parents to see how their child is doing

…ZARODA fixes all of it:
✅ Teachers enter marks online; mark lists & rankings compile automatically
✅ CBC-compliant report cards (Grade 1–12) in seconds
✅ Fees, invoices and balances tracked per learner
✅ Class teachers, HOI and parents each get the right access
✅ Built in Kenya, for the Kenyan CBC/CBE curriculum

Sign up or take a tour 👉 ${link}`;

  return { short, detailed };
}

export function ShareZaroda({ onClose }: { onClose: () => void }) {
  const [schoolName, setSchoolName] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string>('');

  const signupUrl =
    (typeof window !== 'undefined' ? window.location.origin : 'https://zaroda-web.onrender.com') + '/auth/signup';

  useEffect(() => {
    apiClient.get('/schools/settings')
      .then(s => setSchoolName(s.data?.schoolName || ''))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const { short, detailed } = buildMessages(schoolName, signupUrl);

  const copy = (text: string, which: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(''), 1800);
  };
  const whatsapp = (text: string) =>
    `https://wa.me/?text=${encodeURIComponent(text)}`;

  const Block = ({ title, body, id }: { title: string; body: string; id: string }) => (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-theme-heading text-sm">{title}</h4>
        <div className="flex gap-2">
          <button onClick={() => copy(body, id)} className="btn-ghost text-xs py-1 px-2">
            {copied === id ? <><Check size={13}/> Copied</> : <><Copy size={13}/> Copy</>}
          </button>
          <a href={whatsapp(body)} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs py-1 px-2">
            <MessageCircle size={13}/> WhatsApp
          </a>
        </div>
      </div>
      <pre className="text-xs text-theme whitespace-pre-wrap font-sans bg-surface-2 rounded-lg p-3 max-h-52 overflow-y-auto">{body}</pre>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()} style={{ border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between p-5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Share2 size={18} className="text-theme-muted"/>
            <h3 className="font-bold text-theme-heading">Refer ZARODA to another school</h3>
          </div>
          <button onClick={onClose} className="text-theme-muted"><X size={20}/></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <p className="text-theme-muted text-sm text-center py-8">Preparing your share messages…</p>
          ) : (
            <>
              <p className="text-sm text-theme-muted">
                Share ZARODA with other schools. Pick a short or detailed message — your school name and links are already filled in. Copy it or send it straight to WhatsApp.
              </p>
              <Block title="Short message" body={short} id="short" />
              <Block title="Detailed message" body={detailed} id="detailed" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
