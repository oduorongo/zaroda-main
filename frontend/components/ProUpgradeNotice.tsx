// components/ProUpgradeNotice.tsx
// Shown in place of a Pro-only page's content when the tenant is on the
// Essential plan — the backend already refuses these endpoints with a 403
// ("... is a Pro plan feature ..."), this is just the friendly frontend face of that.
import { Lock } from 'lucide-react';

export function isProPlanError(err: any): boolean {
  return err?.response?.status === 403 && String(err?.response?.data?.message || '').includes('Pro plan feature');
}

export function ProUpgradeNotice({ feature }: { feature: string }) {
  return (
    <div className="card p-8 text-center max-w-lg mx-auto">
      <div className="w-12 h-12 rounded-2xl bg-[#d4af37]/10 flex items-center justify-center mx-auto mb-3">
        <Lock size={20} className="text-[#d4af37]"/>
      </div>
      <h2 className="font-bold text-theme-heading mb-1">{feature} is a Pro plan feature</h2>
      <p className="text-sm text-theme-muted mb-4">
        Your school is currently on the Essential plan, which covers fee recording only. Upgrade to Pro to unlock {feature.toLowerCase()}, detailed reports, payroll, HR and student transport.
      </p>
      <a href="mailto:support@zarodasolutions.app?subject=Upgrade%20to%20Zaroda%20Pro" className="btn-primary inline-flex">Upgrade to Pro</a>
    </div>
  );
}
