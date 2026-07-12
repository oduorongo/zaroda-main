// app/page.tsx — Public marketing homepage (feature showcase)
'use client';
import Link from 'next/link';
import {
  BookOpen, DollarSign, MessageSquare, FileText, Library,
  Trophy, Scale, Smartphone, Sparkles, ShieldCheck, MapPin,
  ArrowRight, Check, Phone,
} from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';

const MODULES = [
  { icon: BookOpen,      title: 'Academic Core',        desc: 'Teachers enter marks online — mark lists and CBC report cards generate automatically, with real-time analytics. Learners, streams, attendance, and the KICD-compliant timetable generator across all grade bands.', color: 'bg-[#1a2e5a]' },
  { icon: DollarSign,    title: 'Finance & Fees',       desc: 'M-Pesa STK push collection, auto-reconciliation, FPE/FDJSE/FDSSE fund tracking, and payroll with statutory deductions.', color: 'bg-green-600' },
  { icon: Sparkles,      title: 'AI Professional Records', desc: 'Generate KICD-aligned Schemes of Work, Lesson Plans, and Lesson Notes in seconds, powered by ZARODA AI. HOI approval built in.', color: 'bg-purple-600' },
  { icon: MessageSquare, title: 'Communication',        desc: 'SMS via Africa\'s Talking, email, WhatsApp, and push notifications. Personalised bulk fee reminders to parents.', color: 'bg-blue-600' },
  { icon: Library,       title: 'Library',              desc: 'Full catalogue with barcode borrowing and returns. Completely free — no fines, ever.', color: 'bg-cyan-600', badge: 'FREE' },
  { icon: Trophy,        title: 'Sports & Championships', desc: 'School teams, AI talent analytics, and a bridge to ZARODA Sports for cross-school championships — free.', color: 'bg-amber-500' },
  { icon: Scale,         title: 'Discipline & Guidance', desc: 'Incident recording, confidential counselling, behaviour assessments, and QASO-ready reports.', color: 'bg-red-500' },
  { icon: Smartphone,    title: 'Mobile Apps',          desc: 'Dedicated apps for Teachers, Heads, Parents, and Learners — attendance, results, and fees on the go.', color: 'bg-[#f5820a]' },
];

const PRICING = [
  { tier: 'Primary / Junior', grades: 'Grade 1–9', price: '2,400', per: 'per stream / year', highlight: false },
  { tier: 'Senior School',    grades: 'Grade 10–12', price: '3,360', per: 'per stream / year', highlight: true },
];

const TRUST = [
  { icon: MapPin,      label: 'Built for Kenya', sub: 'All 47 counties' },
  { icon: BookOpen,    label: 'CBC / CBE aligned', sub: 'KICD curriculum' },
  { icon: ShieldCheck, label: 'Secure', sub: 'Per-school data isolation' },
];

export default function HomePage() {
  const { user } = useAuth();

  // The homepage is always the first page for everyone.
  // Logged-in users simply see a "Go to Dashboard" button in the nav.

  return (
    <div className="min-h-screen bg-white">
      {/* ───── Nav ───── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-[#e2e6f0]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/zaroda-logo.png" alt="ZARODA" className="w-10 h-10 rounded-xl object-cover"/>
            <div>
              <div className="font-black text-[#1a2e5a] leading-none">ZARODA SCHOOL</div>
              <div className="text-[9px] text-[#f97316] font-black uppercase tracking-widest">Management System</div>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#4a5278]">
            <a href="#features" className="hover:text-[#1a2e5a]">Features</a>
            <a href="#pricing"  className="hover:text-[#1a2e5a]">Pricing</a>
            <a href="#contact"  className="hover:text-[#1a2e5a]">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href="/dashboard" className="btn-primary text-sm">Go to Dashboard</Link>
            ) : (
              <>
                <Link href="/auth/login" className="text-sm font-semibold text-[#1a2e5a] px-3 py-2 hover:bg-[#f4f6fb] rounded-xl">Sign In</Link>
                <Link href="/auth/signup" className="btn-primary text-sm">Get started free</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ───── Hero ───── */}
      <section className="relative overflow-hidden bg-[#0f1c38] text-white">
        {/* Background classroom/dashboard image with a dark overlay so text stays readable */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/hero-classroom.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0f1c38]/85 via-[#0f1c38]/80 to-[#0f1c38]/92"/>
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#d4af37]/10 rounded-full blur-3xl -translate-y-20 translate-x-20"/>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#243f7a]/40 rounded-full blur-3xl translate-y-20"/>
        <div className="relative max-w-6xl mx-auto px-4 py-20 md:py-28 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-4 py-1.5 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 bg-[#d4af37] rounded-full"/> Made in Kenya for Kenyan schools
          </div>
          <div className="inline-flex items-center gap-2 bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#d4af37] text-sm font-bold px-4 py-1.5 rounded-full mb-6">
            🎉 FREE for all of 2026 — subscription begins 15 Jan 2027
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-tight max-w-3xl mx-auto">
            Run your entire school from <span className="text-[#d4af37]">one platform</span>
          </h1>
          <p className="text-white/60 text-lg mt-6 max-w-2xl mx-auto">
            ZARODA is the complete CBC/CBE school management system — academics, finance, AI-powered records, communication, library, sports, and discipline. All in one place.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-9">
            <Link href="/auth/signup" className="inline-flex items-center justify-center gap-2 bg-[#d4af37] text-[#0f1c38] font-bold px-7 py-3.5 rounded-xl hover:bg-[#f0d060] transition-all active:scale-95">
              Get started free <ArrowRight size={18}/>
            </Link>
            <Link href="/auth/login" className="inline-flex items-center justify-center gap-2 border border-white/25 font-semibold px-7 py-3.5 rounded-xl hover:bg-white/10 transition-all">
              Sign In
            </Link>
          </div>
          <p className="text-white/35 text-xs mt-4">No credit card required · Set up in minutes</p>

          {/* Trust strip */}
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-4 mt-14 pt-10 border-t border-white/10">
            {TRUST.map(t => {
              const Icon = t.icon;
              return (
                <div key={t.label} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                    <Icon size={17} className="text-[#d4af37]"/>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold">{t.label}</div>
                    <div className="text-xs text-white/40">{t.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───── Features ───── */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <p className="text-[#f5820a] font-bold text-sm uppercase tracking-widest mb-2">Everything included</p>
          <h2 className="text-3xl md:text-4xl font-black text-[#1a2e5a]">One system. Every department.</h2>
          <p className="text-[#7a82a8] mt-3 max-w-xl mx-auto">No more juggling spreadsheets and paper registers. ZARODA brings your whole school online.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {MODULES.map(m => {
            const Icon = m.icon;
            return (
              <div key={m.title} className="card p-6 hover:shadow-md hover:-translate-y-1 transition-all">
                <div className={`w-12 h-12 rounded-2xl ${m.color} flex items-center justify-center mb-4`}>
                  <Icon size={22} className="text-white"/>
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="font-bold text-[#1a2e5a]">{m.title}</h3>
                  {m.badge && <span className="text-[9px] font-black bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{m.badge}</span>}
                </div>
                <p className="text-sm text-[#7a82a8] leading-relaxed">{m.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ───── AI highlight band ───── */}
      <section className="bg-[#f4f6fb] py-20">
        <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 rounded-full px-3 py-1 text-xs font-bold mb-4">
              <Sparkles size={12}/> POWERED BY ZARODA AI
            </div>
            <h2 className="text-3xl font-black text-[#1a2e5a] leading-tight">Lesson planning that used to take hours, done in seconds</h2>
            <p className="text-[#7a82a8] mt-4 leading-relaxed">
              Teachers select a subject and grade, and ZARODA generates a full KICD-aligned Scheme of Work — complete with strands, sub-strands, learning outcomes, and key inquiry questions. Heads review and approve with one click.
            </p>
            <ul className="space-y-2.5 mt-6">
              {['Full 14-week schemes of work','Lesson plans and lesson notes','HOI approval workflow built in','Export to Word and PDF'].map(item => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-[#4a5278]">
                  <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Check size={12} className="text-green-600"/>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6 bg-white">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={18} className="text-[#1a2e5a]"/>
              <span className="font-bold text-[#1a2e5a] text-sm">Scheme of Work — Mathematics Grade 4</span>
              <span className="ml-auto text-[9px] font-black bg-purple-100 text-purple-700 px-2 py-0.5 rounded">AI</span>
            </div>
            <div className="space-y-2.5">
              {[1,2,3,4].map(w => (
                <div key={w} className="flex items-center gap-3 p-2.5 bg-[#f4f6fb] rounded-xl">
                  <div className="w-7 h-7 rounded-lg bg-[#1a2e5a] flex items-center justify-center text-[#d4af37] text-xs font-bold flex-shrink-0">W{w}</div>
                  <div className="flex-1">
                    <div className="h-2 bg-[#e2e6f0] rounded-full w-3/4 mb-1.5"/>
                    <div className="h-2 bg-[#e2e6f0] rounded-full w-1/2"/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───── Pricing ───── */}
      <section id="pricing" className="max-w-5xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <p className="text-[#f5820a] font-bold text-sm uppercase tracking-widest mb-2">Simple pricing</p>
          <h2 className="text-3xl md:text-4xl font-black text-[#1a2e5a]">Pay per stream, per year</h2>
          <div className="inline-flex items-center gap-2 bg-green-50 border border-green-300 text-green-700 text-sm font-bold px-4 py-2 rounded-full mt-4">
            🎉 Free for the whole of 2026 — you pay nothing until 15 January 2027
          </div>
          <p className="text-[#7a82a8] mt-3">The prices below take effect from 15 Jan 2027. Save 30% when you have 3 or more streams.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {PRICING.map(p => (
            <div key={p.tier} className={`card p-7 relative ${p.highlight ? 'ring-2 ring-[#d4af37]' : ''}`}>
              {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#d4af37] text-[#0f1c38] text-[10px] font-black px-3 py-1 rounded-full">SENIOR SCHOOL</span>}
              <h3 className="font-bold text-[#1a2e5a]">{p.tier}</h3>
              <p className="text-xs text-[#7a82a8] mb-4">{p.grades}</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-sm font-semibold text-[#7a82a8]">KES</span>
                <span className="text-4xl font-black text-[#1a2e5a]">{p.price}</span>
              </div>
              <p className="text-xs text-[#7a82a8] mb-5">{p.per} · from Jan 2027</p>
              <Link href="/auth/signup" className="btn-primary w-full justify-center">Get started free</Link>
            </div>
          ))}
        </div>

        <div className="text-center mt-8 text-sm text-[#7a82a8]">
          <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-green-600"/> Free all of 2026</span>
          <span className="mx-3">·</span>
          <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-green-600"/> Library always free</span>
          <span className="mx-3">·</span>
          <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-green-600"/> ZARODA Sports always free</span>
        </div>
      </section>

      {/* ───── CTA ───── */}
      <section className="bg-[#1a2e5a] text-white">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h2 className="text-3xl md:text-4xl font-black">Ready to bring your school online?</h2>
          <p className="text-white/60 mt-3 max-w-lg mx-auto">Join Kenyan schools modernising how they manage academics, finance, and more.</p>
          <Link href="/auth/signup" className="inline-flex items-center gap-2 bg-[#d4af37] text-[#0f1c38] font-bold px-8 py-3.5 rounded-xl hover:bg-[#f0d060] transition-all active:scale-95 mt-7">
            Get started free <ArrowRight size={18}/>
          </Link>
        </div>
      </section>

      {/* ───── Footer ───── */}
      <footer id="contact" className="bg-[#0f1c38] text-white/60">
        <div className="max-w-6xl mx-auto px-4 py-12 grid sm:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img src="/zaroda-logo.png" alt="ZARODA" className="w-9 h-9 rounded-lg object-cover"/>
              <div>
                <div className="font-black text-white leading-none">ZARODA SCHOOL</div>
                <div className="text-[9px] font-black text-[#fdba74] uppercase tracking-widest">Management System</div>
              </div>
            </div>
            <p className="text-sm">Kenya's complete CBC/CBE school management system.</p>
            <p className="text-xs mt-3 tracking-widest uppercase text-[#d4af37]">Innovative. Reliable. Forward.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-3">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#features" className="hover:text-white">Features</a></li>
              <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
              <li><Link href="/auth/signup" className="hover:text-white">Free in 2026</Link></li>
              <li><Link href="/auth/login" className="hover:text-white">Sign In</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-3">Get in touch</h4>
            <a href="https://wa.me/254781230805" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-white mb-2">
              <Phone size={14}/> +254 781 230 805
            </a>
            <p className="text-sm">support@zarodasolutions.app</p>
            <p className="text-sm">www.zarodasolutions.app</p>
          </div>
        </div>
        <div className="border-t border-white/10 py-5 text-center text-xs">
          © {new Date().getFullYear()} ZARODA Solutions. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
