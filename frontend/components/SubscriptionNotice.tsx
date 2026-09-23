// Subscription notice shown above every dashboard page to the admins who can pay
// (the roles the billing endpoints accept). Tells them, in order of urgency:
// streams already read-only, streams in their 14-day grace, streams lapsing soon,
// and — while the school is still on its free period — when that ends and what
// happens then. The free-period notice can be dismissed; the others cannot.
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, Info, X } from 'lucide-react';
import apiClient from '@/lib/api/client';

export const BILLING_ROLES = ['hoi', 'dhois', 'school_admin', 'tenant_owner'];

const fmt = (d?: string | null) => d
  ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  : '';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function SubscriptionNotice({ role }: { role?: string }) {
  const [s, setS] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const allowed = !!role && BILLING_ROLES.includes(role);

  useEffect(() => {
    if (!allowed) return;
    apiClient.get('/billing/subscription/summary').then(r => setS(r.data)).catch(() => {});
  }, [allowed]);

  // Dismissing hides it until the last 30 days of the free period, when it returns.
  const endingSoon = (s?.streams || []).some((x: any) => x.status === 'free_ending');
  const dismissKey = s?.freeUntil ? `zaroda.freeNotice.${s.freeUntil}.${endingSoon ? 'soon' : 'early'}` : '';
  useEffect(() => {
    if (!dismissKey) return;
    try { setDismissed(localStorage.getItem(dismissKey) === '1'); } catch { /* storage unavailable */ }
  }, [dismissKey]);

  if (!allowed || !s) return null;
  const billable = (s.streams || []).filter((x: any) => x.billable);
  const lapsed = billable.filter((x: any) => x.status === 'lapsed');
  const grace = billable.filter((x: any) => x.status === 'grace');
  const dueSoon = billable.filter((x: any) => x.status === 'due_soon');
  const link = <Link href="/dashboard/subscription" className="font-semibold underline whitespace-nowrap">Open Subscription →</Link>;
  const box = 'mb-4 rounded-xl px-4 py-3 text-sm flex gap-2 items-start border';

  if (lapsed.length) {
    return (
      <div className={`${box} bg-red-50 text-red-800 border-red-200`}>
        <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
        <p>{plural(lapsed.length, 'stream is', 'streams are')} read-only because the subscription lapsed ({lapsed.map((x: any) => x.name).join(', ')}). Records can still be viewed and printed, and fee collection is unaffected. {link}</p>
      </div>
    );
  }
  if (grace.length) {
    const until = grace.map((x: any) => x.graceEndsOn).sort()[0];
    return (
      <div className={`${box} bg-amber-50 text-amber-800 border-amber-200`}>
        <Clock size={16} className="shrink-0 mt-0.5"/>
        <p>{plural(grace.length, 'stream is', 'streams are')} in the {s.graceDays}-day grace period. Pay by {fmt(until)} to keep {grace.length === 1 ? 'it' : 'them'} open; after that, unpaid streams become read-only. {link}</p>
      </div>
    );
  }
  if (s.onFreePeriod && !dismissed) {
    const dismiss = () => {
      setDismissed(true);
      try { localStorage.setItem(dismissKey, '1'); } catch { /* storage unavailable */ }
    };
    return (
      <div className={`${box} bg-blue-50 text-blue-800 border-blue-200`}>
        <Info size={16} className="shrink-0 mt-0.5"/>
        <p className="flex-1">
          <b>ZARODA is free for your school until {fmt(s.freeUntil)}.</b> After that the subscription is per stream with learners:
          KES {Number(s.pricePrimaryJs).toLocaleString('en-KE')} per primary/JS stream and KES {Number(s.priceSenior).toLocaleString('en-KE')} per senior stream, per year.
          You will get an invoice then, with a {s.graceDays}-day grace period to {fmt(s.freeGraceEndsOn)}; streams still unpaid after that become read-only.
          Fee collection is never affected. {link}
        </p>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100"><X size={16}/></button>
      </div>
    );
  }
  if (dueSoon.length) {
    const on = dueSoon.map((x: any) => x.coverEnd).sort()[0];
    return (
      <div className={`${box} bg-amber-50 text-amber-800 border-amber-200`}>
        <Clock size={16} className="shrink-0 mt-0.5"/>
        <p>{plural(dueSoon.length, 'stream’s', 'streams’')} subscription ends soon (first on {fmt(on)}). Renewing early adds the year on top, so no time is lost. {link}</p>
      </div>
    );
  }
  return null;
}
