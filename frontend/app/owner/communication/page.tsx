// app/owner/communication/page.tsx
'use client';
import { Megaphone } from 'lucide-react';

export default function OwnerCommunicationPage() {
  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <Megaphone className="text-theme-muted" size={20}/>
          <h1 className="text-xl font-black text-theme-heading">Communication</h1>
        </div>
        <div className="card p-8 text-center text-theme-muted">
          Platform-wide messaging to all school admins and users — via WhatsApp, email and SMS — is coming next.
        </div>
      </div>
    </div>
  );
}
