'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckSquare, BarChart3, Calendar, Sparkles, Users, BookOpen,
  ChevronRight, GraduationCap, Clock, Star, X,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

export default function TeacherHome() {
  const { user } = useAuth();
  const [classes, setClasses]   = useState<any[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [today, setToday]       = useState<any[]>([]);
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  // "Share your experience" — teachers using the dedicated /teacher portal never
  // see the admin/HOI dashboard where this normally lives, so it needs its own
  // copy here (same pattern as app/dashboard/page.tsx and the parent portal).
  const [testimonialDismissed, setTestimonialDismissed] = useState(true);
  const [showTestimonialForm, setShowTestimonialForm] = useState(false);
  const [myTestimonial, setMyTestimonial] = useState<any>(null);
  const [testimonialForm, setTestimonialForm] = useState({ message: '', rating: 5, allowPublicUse: true });
  const [submittingTestimonial, setSubmittingTestimonial] = useState(false);
  useEffect(() => {
    if (!user) return;
    const dismissedAt = Number(localStorage.getItem(`testimonial-dismissed:${user.id}`) || 0);
    const recentlyDismissed = dismissedAt && (Date.now() - dismissedAt) / 86400000 < 14;
    apiClient.get('/testimonials/mine').then(r => {
      const submitted = r.data?.testimonial || null;
      setMyTestimonial(submitted);
      setTestimonialDismissed(submitted ? false : !!recentlyDismissed);
    }).catch(() => {});
  }, [user]);
  const dismissTestimonial = () => {
    setTestimonialDismissed(true);
    if (user) localStorage.setItem(`testimonial-dismissed:${user.id}`, String(Date.now()));
  };
  const submitTestimonial = async () => {
    if (!testimonialForm.message.trim()) return;
    setSubmittingTestimonial(true);
    try {
      const { data } = await apiClient.post('/testimonials', testimonialForm);
      toast.success('Thank you — your experience has been recorded!');
      setShowTestimonialForm(false);
      setMyTestimonial({ id: data?.id, message: testimonialForm.message, rating: testimonialForm.rating });
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Could not submit — try again.'); }
    finally { setSubmittingTestimonial(false); }
  };
  const deleteMyTestimonial = async () => {
    if (!myTestimonial?.id) return;
    try { await apiClient.delete(`/testimonials/${myTestimonial.id}`); toast.success('Testimonial removed.'); setMyTestimonial(null); }
    catch { toast.error('Could not remove — try again.'); }
  };

  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiClient.get('/academic/streams').catch(()=>({data:[]})),
      apiClient.get('/academic/teachers').catch(()=>({data:[]})),
      apiClient.get('/academic/my-timetable').catch(()=>({data:[]})),
      apiClient.get(`/academic/teachers/${user.id}/stream-subjects`).catch(()=>({data:[]})),
      apiClient.get('/academic/my-assessment-progress').catch(()=>({data:[]})),
    ]).then(([s, t, tt, ss, ap]) => {
      // All streams this teacher owns OR is assigned to teach in (across learning areas).
      const assignedIds = new Set<string>((ss.data||[]).map((row:any)=>String(row.streamId)));
      const mine = (s.data||[]).filter((x:any) =>
        assignedIds.has(String(x.id)) || x.id === user.streamId || x.classTeacherId === user.id);
      setClasses(mine.length ? mine : (s.data||[]));
      const me = (t.data||[]).find((x:any) => x.id === user.id);
      setSubjects(me?.subjects || []);
      // Today's lessons from personal timetable
      const dayName = new Date().toLocaleDateString('en-US',{weekday:'long'});
      setToday((tt.data||[]).filter((l:any) => l.day === dayName));
      setProgress(ap.data || []);
    }).finally(()=>setLoading(false));
  }, [user]);

  if (!user) return null;

  const QUICK = [
    { icon: CheckSquare, label: 'Take Attendance', sub: 'Mark today\u2019s roll call', href: '/teacher/attendance', color: 'bg-green-600' },
    { icon: BarChart3,   label: 'Enter Marks',     sub: 'Record assessment scores', href: '/teacher/enter-marks',      color: 'bg-rose-600' },
    { icon: Sparkles,    label: 'AI Schemes',      sub: 'Generate KICD records',  href: '/teacher/records',     color: 'bg-purple-600' },
    { icon: Calendar,    label: 'My Timetable',    sub: 'Weekly schedule',        href: '/teacher/timetable',   color: 'bg-blue-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-[#1a2e5a] to-[#243f7a] rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-[#d4af37]/10 rounded-full -translate-y-10 translate-x-10"/>
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <GraduationCap size={24} className="text-[#d4af37]"/>
          </div>
          <div>
            <h1 className="text-2xl font-black">Welcome, {user.firstName}</h1>
            <p className="text-white/60 text-sm">
              {subjects.length > 0 ? subjects.slice(0,3).join(' · ') : 'Teacher'}{subjects.length > 3 ? ` +${subjects.length-3}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Share your experience */}
      {!testimonialDismissed && (
        <div className="card p-5 border border-blue-200/60 bg-blue-50/40 relative">
          <button onClick={dismissTestimonial} className="absolute top-4 right-4 text-theme-muted hover:text-theme-heading"><X size={16}/></button>
          {myTestimonial ? (
            <>
              <h3 className="font-bold text-theme-heading mb-1">Your testimonial</h3>
              <p className="text-sm text-theme-muted italic mb-3">&ldquo;{myTestimonial.message}&rdquo;</p>
              <button onClick={deleteMyTestimonial} className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200">Delete</button>
            </>
          ) : !showTestimonialForm ? (
            <>
              <h3 className="font-bold text-theme-heading mb-1">Share your experience with Zaroda</h3>
              <p className="text-sm text-theme-muted mb-3">A short testimonial helps us understand and showcase the real impact this system has on teaching and learning in Kenya.</p>
              <button onClick={() => setShowTestimonialForm(true)} className="btn-primary text-sm">Write a testimonial</button>
            </>
          ) : (
            <div className="space-y-3">
              <textarea
                value={testimonialForm.message}
                onChange={(e) => setTestimonialForm(f => ({ ...f, message: e.target.value }))}
                className="input resize-y" rows={4}
                placeholder="How has Zaroda changed the way you teach or plan lessons?"
              />
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" onClick={() => setTestimonialForm(f => ({ ...f, rating: n }))}>
                      <Star size={18} className={n <= testimonialForm.rating ? 'fill-[#d4af37] text-[#d4af37]' : 'text-theme-muted'}/>
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-theme-muted">
                  <input type="checkbox" checked={testimonialForm.allowPublicUse} onChange={(e) => setTestimonialForm(f => ({ ...f, allowPublicUse: e.target.checked }))}/>
                  OK to use publicly (with my name)
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={submitTestimonial} disabled={submittingTestimonial || !testimonialForm.message.trim()} className="btn-primary text-sm">
                  {submittingTestimonial ? 'Submitting…' : 'Submit'}
                </button>
                <button onClick={() => setShowTestimonialForm(false)} className="btn-ghost text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <Users size={18} className="mx-auto text-[#1a2e5a] mb-1"/>
          <div className="text-xl font-black text-theme-heading">{loading ? '…' : classes.length}</div>
          <div className="text-xs text-theme-muted">My Classes</div>
        </div>
        <div className="card p-4 text-center">
          <BookOpen size={18} className="mx-auto text-purple-600 mb-1"/>
          <div className="text-xl font-black text-theme-heading">{loading ? '…' : subjects.length}</div>
          <div className="text-xs text-theme-muted">Subjects</div>
        </div>
        <div className="card p-4 text-center">
          <Clock size={18} className="mx-auto text-[#f5820a] mb-1"/>
          <div className="text-xl font-black text-theme-heading">{loading ? '…' : today.length}</div>
          <div className="text-xs text-theme-muted">Lessons Today</div>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="section-title">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK.map(q => {
            const Icon = q.icon;
            return (
              <Link key={q.label} href={q.href} className="card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className={`w-11 h-11 rounded-xl ${q.color} flex items-center justify-center mb-3`}><Icon size={20} className="text-white"/></div>
                <div className="font-bold text-theme-heading text-sm">{q.label}</div>
                <div className="text-xs text-theme-muted mt-0.5">{q.sub}</div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Today's lessons */}
      <div>
        <h2 className="section-title">Today's Lessons</h2>
        {loading ? <div className="h-20 shimmer rounded-2xl"/> : today.length === 0 ? (
          <div className="card p-6 text-center text-theme-muted text-sm">No lessons scheduled for today</div>
        ) : (
          <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
            {today.map((l:any, i:number) => (
              <div key={i} className="flex items-center gap-3 p-3" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <div className="w-14 text-xs font-bold text-theme-muted">{l.periodLabel}</div>
                <div className="flex-1">
                  <div className="font-semibold text-theme-heading text-sm">{l.subject}</div>
                  <div className="text-xs text-theme-muted">{l.streamName}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My classes */}
      <div>
        <h2 className="section-title">My Classes</h2>
        {loading ? <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{[1,2,3].map(i=><div key={i} className="h-24 shimmer rounded-2xl"/>)}</div>
        : classes.length === 0 ? (
          <div className="card p-6 text-center text-theme-muted text-sm">No classes assigned yet — ask your administrator</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {classes.map((c:any) => (
              <Link key={c.id} href={`/teacher/attendance?streamId=${c.id}`} className="card p-4 hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center text-[#d4af37] font-black text-xs">
                    {c.gradeLevel?.replace('grade_','G').replace('_','').toUpperCase().slice(0,3)}
                  </div>
                  <ChevronRight size={16} className="text-theme-muted group-hover:text-theme-heading transition-colors"/>
                </div>
                <div className="font-bold text-theme-heading">{c.name}</div>
                <div className="text-xs text-theme-muted mt-0.5 flex items-center gap-1"><Users size={11}/> {c.learnersCount || 0} learners</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Assessment upload progress — how many of my learners have marks per assessment */}
      {progress.length > 0 && (
        <div>
          <h2 className="section-title">Assessment Upload Progress</h2>
          <div className="card p-5 space-y-3">
            <p className="text-xs text-theme-muted">Marks entered for your classes, per created assessment.</p>
            {progress.map((a:any) => (
              <div key={a.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-semibold text-theme-heading truncate">{a.name || (a.examType||'').replace('_',' ')} <span className="text-theme-muted font-normal">· {(a.term||'').replace('term_','Term ')}</span></span>
                  <span className="text-theme-muted">{a.entered}/{a.total} ({a.percent}%)</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${a.percent}%`, background: a.percent >= 80 ? '#16a34a' : a.percent >= 40 ? '#d4af37' : '#f5820a' }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
