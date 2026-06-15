// app/invite/[token]/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import apiClient from '@/lib/api/client';

export default function InvitePage({ params }: { params: { token: string } }) {
  const router  = useRouter();
  const [status, setStatus] = useState<'loading'|'valid'|'invalid'>('loading');
  const [invite, setInvite] = useState<any>(null);

  useEffect(() => {
    apiClient.get(`/referral/invite/${params.token}/validate`)
      .then(r => { setInvite(r.data); setStatus('valid'); })
      .catch(() => setStatus('invalid'));
  }, [params.token]);

  if (status === 'loading') return (
    <div className="min-h-screen bg-[#0f1c38] flex items-center justify-center">
      <Loader2 size={32} className="text-[#d4af37] animate-spin"/>
    </div>
  );

  if (status === 'invalid') return (
    <div className="min-h-screen bg-[#0f1c38] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center">
        <XCircle size={40} className="mx-auto text-red-500 mb-3"/>
        <h2 className="text-lg font-bold text-[#1a2e5a]">Invalid or Expired Link</h2>
        <p className="text-sm text-[#7a82a8] mt-1 mb-4">This invite link has expired or has been used too many times.</p>
        <Link href="/auth/signup" className="btn-primary inline-flex">Start Free Trial Instead</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f1c38] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 bg-[#d4af37] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl font-black text-[#0f1c38]">Z</span>
        </div>
        <CheckCircle size={24} className="mx-auto text-green-500 mb-2"/>
        <h2 className="text-lg font-bold text-[#1a2e5a]">You've been invited!</h2>
        <p className="text-sm text-[#7a82a8] mt-2 mb-1">
          By <strong className="text-[#1a2e5a]">{invite?.teacherName}</strong>
        </p>
        <p className="text-xs text-[#7a82a8] mb-6">
          {invite?.className} Class Teacher · ZARODA School Management System
        </p>
        <Link
          href={`/auth/signup?inviteToken=${params.token}`}
          className="btn-primary w-full justify-center text-sm">
          Create Your School Account →
        </Link>
        <p className="text-xs text-[#7a82a8] mt-3">Start with your class · Free 2-week trial · No card needed</p>
      </div>
    </div>
  );
}
