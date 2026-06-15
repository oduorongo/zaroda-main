// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// MODULE 05: Professional Records — Next.js Frontend
// Pages: Teacher Dashboard · Generate Scheme · Scheme Viewer
//        Lesson Plan Generator · Lesson Notes · Records of Work
//        Learner Progress · Teacher Folder · HOI Approval
// ============================================================

'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';

// ─────────────────────────────────────────────────────────────
// lib/api/professional-records.ts
// ─────────────────────────────────────────────────────────────
export const ProRecordsAPI = {
  // Schemes of Work
  generateScheme:    (d: any)    => apiClient.post('/api/v1/professional-records/schemes/generate', d),
  listSchemes:       (p?: any)   => apiClient.get('/api/v1/professional-records/schemes', { params: p }),
  getScheme:         (id: string)=> apiClient.get(`/api/v1/professional-records/schemes/${id}`),
  submitScheme:      (id: string)=> apiClient.post(`/api/v1/professional-records/schemes/${id}/submit`),
  reviewScheme:      (id: string, d: any) => apiClient.patch(`/api/v1/professional-records/schemes/${id}/review`, d),

  // Lesson Plans
  generatePlan:      (d: any)    => apiClient.post('/api/v1/professional-records/lesson-plans/generate', d),
  submitPlan:        (id: string)=> apiClient.post(`/api/v1/professional-records/lesson-plans/${id}/submit`),
  reviewPlan:        (id: string, d: any) => apiClient.patch(`/api/v1/professional-records/lesson-plans/${id}/review`, d),

  // Lesson Notes
  generateNotes:     (d: any)    => apiClient.post('/api/v1/professional-records/lesson-notes/generate', d),

  // Records of Work
  recordWork:        (d: any)    => apiClient.post('/api/v1/professional-records/records-of-work', d),
  getRecordsOfWork:  (p?: any)   => apiClient.get('/api/v1/professional-records/records-of-work', { params: p }),

  // Learner Progress
  generateProgress:  (d: any)    => apiClient.post('/api/v1/professional-records/learner-progress/generate', d),
  getProgress:       (p?: any)   => apiClient.get('/api/v1/professional-records/learner-progress', { params: p }),

  // Folder + Approvals
  getFolder:         (p?: any)   => apiClient.get('/api/v1/professional-records/folder', { params: p }),
  getPendingApprovals: ()        => apiClient.get('/api/v1/professional-records/pending-approvals'),
};


// ─────────────────────────────────────────────────────────────
// Shared status badge component
// ─────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  draft:              'bg-gray-100 text-gray-600',
  submitted:          'bg-yellow-100 text-yellow-700',
  approved:           'bg-green-100 text-green-700',
  rejected:           'bg-red-100 text-red-700',
  revision_requested: 'bg-orange-100 text-orange-700',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${STATUS_BADGE[status] || 'bg-gray-100 text-gray-500'}`}>
      {status.replace(/_/g,' ')}
    </span>
  );
}


// ─────────────────────────────────────────────────────────────
// app/dashboard/professional-records/page.tsx
// Teacher Professional Records Dashboard
// ─────────────────────────────────────────────────────────────
export default function ProfessionalRecordsDashboard() {
  const { user }      = useAuth();
  const [schemes,     setSchemes]     = useState<any[]>([]);
  const [folder,      setFolder]      = useState<any>(null);
  const [pending,     setPending]     = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const isHoi = ['hoi','dhois','school_admin','tenant_owner'].includes(user?.role || '');

  useEffect(() => {
    Promise.all([
      ProRecordsAPI.listSchemes({ academicYear: '2025/2026' }),
      ProRecordsAPI.getFolder({ academicYear: '2025/2026' }),
      isHoi ? ProRecordsAPI.getPendingApprovals() : Promise.resolve({ data: null }),
    ]).then(([s, f, p]) => {
      setSchemes(s.data);
      setFolder(f.data);
      if (p.data) setPending(p.data);
    }).finally(() => setLoading(false));
  }, []);

  const DOC_TYPE_ICONS: Record<string, string> = {
    scheme_of_work: '📋', lesson_plan: '📝', lesson_notes: '📖',
    record_of_work: '✅', learner_progress_record: '📊',
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Professional Records</h1>
          <p className="text-sm text-gray-500 mt-0.5">KICD CBC-aligned · AI-powered · Downloadable</p>
        </div>
        <a href="/dashboard/professional-records/generate"
          className="px-4 py-2 bg-[#1a2e5a] text-white text-sm font-medium rounded-lg hover:bg-[#142347]">
          + Generate New Record
        </a>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400 text-sm">Loading professional records…</div>
      ) : (
        <>
          {/* HOI: Pending approvals alert */}
          {isHoi && pending?.total > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⏳</span>
                <div>
                  <div className="font-semibold text-yellow-800">{pending.total} records awaiting your approval</div>
                  <div className="text-sm text-yellow-600">
                    {pending.schemesOfWork?.length} schemes · {pending.lessonPlans?.length} lesson plans · {pending.lessonNotes?.length} lesson notes
                  </div>
                </div>
              </div>
              <a href="/dashboard/professional-records/approvals"
                className="px-4 py-2 bg-yellow-700 text-white text-sm rounded-lg hover:bg-yellow-800">
                Review Now →
              </a>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* My Schemes */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800 text-sm">My Schemes of Work</h2>
                <a href="/dashboard/professional-records/schemes" className="text-xs text-[#1a2e5a] hover:underline">View all →</a>
              </div>
              {schemes.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 py-12 text-center">
                  <div className="text-4xl mb-3">📋</div>
                  <p className="text-gray-500 text-sm font-medium">No schemes yet</p>
                  <p className="text-gray-400 text-xs mt-1">Generate your first AI-powered scheme of work</p>
                  <a href="/dashboard/professional-records/generate"
                    className="inline-block mt-4 px-4 py-2 bg-[#1a2e5a] text-white text-xs rounded-lg">
                    Generate Scheme →
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  {schemes.slice(0,6).map(s => (
                    <a key={s.id} href={`/dashboard/professional-records/schemes/${s.id}`}
                      className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-[#1a2e5a]/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl flex-shrink-0">📋</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{s.title}</div>
                          <div className="text-xs text-gray-400">{s.academicYear} · {s.term?.replace('_',' ')}</div>
                        </div>
                      </div>
                      <StatusBadge status={s.status}/>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Teacher Folder */}
            <div>
              <h2 className="font-semibold text-gray-800 text-sm mb-3">My Folder</h2>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                {folder ? (
                  <div className="space-y-3">
                    {Object.entries({
                      'Schemes of Work':          folder.schemesOfWork?.length || 0,
                      'Lesson Plans':             folder.lessonPlans?.length || 0,
                      'Lesson Notes':             folder.lessonNotes?.length || 0,
                      'Records of Work':          folder.recordsOfWork?.length || 0,
                      'Progress Records':         folder.learnerProgressRecords?.length || 0,
                    }).map(([label, count]) => (
                      <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-600">{label}</span>
                        <span className={`text-sm font-bold ${Number(count) > 0 ? 'text-[#1a2e5a]' : 'text-gray-300'}`}>{count}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                      <span className="text-xs text-gray-500 font-medium">Total Documents</span>
                      <span className="text-sm font-bold text-[#d4af37]">{folder.total}</span>
                    </div>
                    <a href="/dashboard/professional-records/folder"
                      className="block w-full text-center py-2 border border-[#1a2e5a] text-[#1a2e5a] text-xs rounded-lg hover:bg-[#f4f6fb] mt-2">
                      📁 Open Folder
                    </a>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400 text-sm">No documents yet</div>
                )}
              </div>

              {/* Quick actions */}
              <div className="mt-4 space-y-2">
                {[
                  { label:'Generate Lesson Plan',  href:'/dashboard/professional-records/lesson-plans/generate', icon:'📝' },
                  { label:'Record Work Covered',   href:'/dashboard/professional-records/records-of-work/new',   icon:'✅' },
                  { label:'Learner Progress',      href:'/dashboard/professional-records/learner-progress',      icon:'📊' },
                ].map(a => (
                  <a key={a.label} href={a.href}
                    className="flex items-center gap-2 px-3 py-2.5 bg-white rounded-lg border border-gray-100 hover:border-[#1a2e5a]/30 text-sm text-gray-700 transition-colors">
                    <span>{a.icon}</span>{a.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// app/dashboard/professional-records/generate/page.tsx
// AI Scheme of Work Generator
// ─────────────────────────────────────────────────────────────
export function GenerateSchemeOfWorkPage() {
  const [step,    setStep]    = useState<'form'|'generating'|'done'>('form');
  const [form,    setForm]    = useState({
    subjectName: '', subjectId: '', streamId: '', gradeLevel: '',
    academicYear: '2025/2026', term: 'term_1',
    totalWeeks: '12', periodsPerWeek: '5',
    schoolContext: '',
  });
  const [result,  setResult]  = useState<any>(null);
  const [error,   setError]   = useState('');
  const set = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));

  const GRADES = [
    { v:'pp1', l:'PP1' }, { v:'pp2', l:'PP2' },
    ...Array.from({length:12}, (_,i) => ({ v:`grade_${i+1}`, l:`Grade ${i+1}` })),
  ];

  const generate = async () => {
    if (!form.subjectName || !form.gradeLevel || !form.streamId) {
      setError('Please fill all required fields.'); return;
    }
    setError(''); setStep('generating');
    try {
      const { data } = await ProRecordsAPI.generateScheme({
        ...form,
        totalWeeks:    parseInt(form.totalWeeks),
        periodsPerWeek: parseInt(form.periodsPerWeek),
      });
      setResult(data);
      setStep('done');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Generation failed. Please try again.');
      setStep('form');
    }
  };

  if (step === 'generating') {
    return (
      <div className="p-6 max-w-lg mx-auto text-center py-24">
        <div className="w-16 h-16 bg-[#1a2e5a] rounded-2xl flex items-center justify-center mx-auto mb-5">
          <svg className="animate-spin w-8 h-8 text-[#d4af37]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Generating Scheme of Work…</h2>
        <p className="text-sm text-gray-500 mb-4">Claude is reading the KICD {form.subjectName} syllabus for {form.gradeLevel.replace('_',' ')} and building your scheme.</p>
        <div className="space-y-2 text-xs text-gray-400">
          {[
            '📚 Reading KICD curriculum structure…',
            '🗓 Planning strand distribution across ' + form.totalWeeks + ' weeks…',
            '✍️ Writing Specific Learning Outcomes…',
            '🔍 Generating Key Inquiry Questions…',
            '📋 Compiling assessment methods…',
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2 justify-center">
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'done' && result) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Scheme Generated!</h2>
          <p className="text-gray-500 text-sm mb-5">{result.message}</p>
          <div className="bg-[#f4f6fb] rounded-xl p-4 text-sm mb-5 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Subject</span>
              <span className="font-medium text-gray-800">{form.subjectName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Grade</span>
              <span className="font-medium text-gray-800">{form.gradeLevel.replace('_',' ').replace(/\b\w/g, c=>c.toUpperCase())}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Weeks</span>
              <span className="font-medium text-gray-800">{result.totalWeeks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <StatusBadge status={result.status}/>
            </div>
          </div>
          <div className="flex gap-3">
            <a href={`/dashboard/professional-records/schemes/${result.schemeId}`}
              className="flex-1 py-2.5 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347]">
              View & Edit Scheme →
            </a>
            <button onClick={() => { setStep('form'); setResult(null); }}
              className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm">
              Generate Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Generate Scheme of Work</h1>
        <p className="text-sm text-gray-500 mt-0.5">AI-powered · KICD CBC-aligned · Covers all strands automatically</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject Name *</label>
            <input value={form.subjectName} onChange={set('subjectName')} placeholder="e.g. Mathematics"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level *</label>
            <select value={form.gradeLevel} onChange={set('gradeLevel')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
              <option value="">Select grade…</option>
              {GRADES.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
            <select value={form.academicYear} onChange={set('academicYear')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
            <select value={form.term} onChange={set('term')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
              <option value="term_1">Term 1</option>
              <option value="term_2">Term 2</option>
              <option value="term_3">Term 3</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Weeks</label>
            <input type="number" value={form.totalWeeks} onChange={set('totalWeeks')} min={8} max={16}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Periods per Week</label>
            <input type="number" value={form.periodsPerWeek} onChange={set('periodsPerWeek')} min={3} max={10}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stream ID *</label>
          <input value={form.streamId} onChange={set('streamId')} placeholder="Stream UUID"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
          <p className="text-xs text-gray-400 mt-1">In production this is a dropdown loaded from your allocated streams</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">School Context <span className="text-xs text-gray-400">optional</span></label>
          <input value={form.schoolContext} onChange={set('schoolContext')}
            placeholder="e.g. Mixed day school, urban, Nairobi County"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
        </div>

        <div className="bg-[#f4f6fb] rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-[#1a2e5a] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-[#d4af37] text-xs font-bold">AI</span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">What Claude generates for you</p>
              <ul className="text-xs text-gray-500 mt-1 space-y-0.5">
                <li>• All strands and sub-strands from the KICD {form.subjectName || '[subject]'} syllabus</li>
                <li>• Specific Learning Outcomes (SLOs) for each week</li>
                <li>• Key Inquiry Questions that stimulate critical thinking</li>
                <li>• Learner-centred learning experiences (CBC approach)</li>
                <li>• Appropriate learning resources and assessment methods</li>
              </ul>
            </div>
          </div>
        </div>

        <button onClick={generate}
          disabled={!form.subjectName || !form.gradeLevel || !form.streamId}
          className="w-full py-3 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347] disabled:opacity-40 transition-colors">
          🤖 Generate Scheme of Work with AI
        </button>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// app/dashboard/professional-records/approvals/page.tsx
// HOI Approval Dashboard
// ─────────────────────────────────────────────────────────────
export function ApprovalsPage() {
  const [pending,  setPending]  = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [reviewing,setReviewing]= useState<string | null>(null);
  const [comment,  setComment]  = useState('');
  const [activeTab,setActiveTab]= useState<'schemes'|'plans'|'notes'>('schemes');

  useEffect(() => {
    ProRecordsAPI.getPendingApprovals()
      .then(r => setPending(r.data))
      .finally(() => setLoading(false));
  }, []);

  const review = async (type: string, id: string, action: string) => {
    const apiMap: Record<string, Function> = {
      scheme_of_work: (id: string, d: any) => ProRecordsAPI.reviewScheme(id, d),
      lesson_plan:    (id: string, d: any) => ProRecordsAPI.reviewPlan(id, d),
    };

    const fn = apiMap[type];
    if (!fn) return;

    await fn(id, { action, comment });
    setReviewing(null); setComment('');
    const r = await ProRecordsAPI.getPendingApprovals();
    setPending(r.data);
  };

  const TABS = [
    { key: 'schemes', label: 'Schemes of Work', data: pending?.schemesOfWork },
    { key: 'plans',   label: 'Lesson Plans',    data: pending?.lessonPlans },
    { key: 'notes',   label: 'Lesson Notes',    data: pending?.lessonNotes },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Pending Approvals</h1>
        <p className="text-sm text-gray-500 mt-0.5">Review and approve teacher professional records</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : (
        <>
          {pending?.total === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-green-800">All records reviewed!</p>
              <p className="text-sm text-green-600 mt-1">No pending approvals at this time.</p>
            </div>
          )}

          {pending?.total > 0 && (
            <>
              <div className="flex gap-2 mb-5">
                {TABS.map(t => (
                  <button key={t.key} onClick={() => setActiveTab(t.key as any)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                      ${activeTab === t.key ? 'bg-[#1a2e5a] text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                    {t.label}
                    {t.data?.length > 0 && (
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full
                        ${activeTab === t.key ? 'bg-[#d4af37] text-[#1a2e5a]' : 'bg-gray-100 text-gray-500'}`}>
                        {t.data.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {TABS.filter(t => t.key === activeTab).map(tab => (
                <div key={tab.key} className="space-y-3">
                  {tab.data?.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">No pending {tab.label.toLowerCase()}</div>
                  )}
                  {tab.data?.map((record: any) => (
                    <div key={record.id} className="bg-white rounded-xl border border-gray-100 p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-semibold text-gray-900">{record.title || `${tab.label} — ${record.academicYear}`}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            Submitted {record.submittedAt && new Date(record.submittedAt).toLocaleDateString('en-KE')}
                          </div>
                        </div>
                        <StatusBadge status={record.status}/>
                      </div>

                      {reviewing === record.id ? (
                        <div className="mt-3 space-y-3">
                          <textarea value={comment} onChange={e => setComment(e.target.value)}
                            placeholder="Add a comment (required for rejection/revision request)…"
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] resize-none"/>
                          <div className="flex gap-2">
                            <button onClick={() => review(tab.key === 'schemes' ? 'scheme_of_work' : 'lesson_plan', record.id, 'approved')}
                              className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                              ✓ Approve
                            </button>
                            <button onClick={() => review(tab.key === 'schemes' ? 'scheme_of_work' : 'lesson_plan', record.id, 'revision_requested')}
                              className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600">
                              ↩ Request Revision
                            </button>
                            <button onClick={() => review(tab.key === 'schemes' ? 'scheme_of_work' : 'lesson_plan', record.id, 'rejected')}
                              className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                              ✕ Reject
                            </button>
                            <button onClick={() => { setReviewing(null); setComment(''); }}
                              className="px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setReviewing(record.id)}
                          className="mt-2 px-4 py-2 border border-[#1a2e5a] text-[#1a2e5a] rounded-lg text-sm font-medium hover:bg-[#f4f6fb]">
                          Review →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
