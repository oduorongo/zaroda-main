'use client';
import Link from 'next/link';
import { Sparkles, FileText, BookOpen, ClipboardList, ArrowRight } from 'lucide-react';

export default function TeacherRecords() {
  const ITEMS = [
    { icon: FileText,      title: 'Scheme of Work',  desc: 'AI-generate a full KICD-aligned scheme for your subject and grade', href: '/dashboard/professional-records' },
    { icon: BookOpen,      title: 'Lesson Plans',    desc: 'Build CBC lesson plans from your scheme',                          href: '/dashboard/professional-records' },
    { icon: ClipboardList, title: 'Lesson Notes',    desc: 'Generate detailed lesson notes',                                  href: '/dashboard/professional-records' },
    { icon: FileText,      title: 'Record of Work',  desc: 'Track what you have covered each week',                           href: '/dashboard/professional-records' },
  ];
  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Schemes &amp; Records</h1>
          <p className="text-sm text-theme-muted">AI-powered professional documents for your teaching</p>
        </div>
      </div>
      <div className="card p-5 bg-gradient-to-r from-[#1a2e5a] to-[#243f7a] text-white">
        <div className="flex items-center gap-2 mb-1"><Sparkles size={16} className="text-[#d4af37]"/><span className="font-bold">AI Document Generation</span></div>
        <p className="text-sm text-white/60">Select your subject and grade, and ZARODA generates KICD-compliant documents in seconds. Your HOI reviews and approves.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ITEMS.map(it => {
          const Icon = it.icon;
          return (
            <Link key={it.title} href={it.href} className="card p-5 hover:shadow-md transition-all group">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-purple-600 flex items-center justify-center flex-shrink-0"><Icon size={20} className="text-white"/></div>
                <div className="flex-1">
                  <div className="flex items-center gap-1 font-bold text-theme-heading">{it.title} <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity"/></div>
                  <p className="text-xs text-theme-muted mt-0.5">{it.desc}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
