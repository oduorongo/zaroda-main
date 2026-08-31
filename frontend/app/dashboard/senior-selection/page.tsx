'use client';
import { useState, useEffect } from 'react';
import { GraduationCap, Loader2, X, CheckCircle2, FileText, Send, Printer } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isParent } from '@/lib/hooks/useAuth';
import { usePdfDownload } from '@/components/pdf/pdf-buttons';
import toast from 'react-hot-toast';

const PATHWAYS = [
  { group: 'STEM', options: [
    { value: 'pure_sciences', label: 'Pure Sciences' },
    { value: 'applied_sciences', label: 'Applied Sciences' },
    { value: 'technical_studies', label: 'Technical Studies' },
  ]},
  { group: 'Social Sciences', options: [
    { value: 'languages_and_literature', label: 'Languages and Literature' },
    { value: 'humanities_and_business_studies', label: 'Humanities and Business Studies' },
  ]},
  { group: 'Arts and Sports Science', options: [
    { value: 'fine_arts_theatre_film', label: 'Fine Arts, Theatre and Film' },
    { value: 'sports_and_recreation', label: 'Sports and Recreation' },
  ]},
];

const SCHOOL_ROWS = [
  { n: 1, cat: 'C1' }, { n: 2, cat: 'C1' }, { n: 3, cat: 'C1' },
  { n: 4, cat: 'C2' }, { n: 5, cat: 'C2' },
  { n: 6, cat: 'C3' }, { n: 7, cat: 'C3' },
  { n: 8, cat: 'C4' },
];

const STATUS_BADGE: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  draft:       'bg-amber-100 text-amber-700',
  submitted:   'bg-blue-100 text-blue-700',
  keyed_in:    'bg-green-100 text-green-700',
};
const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started', draft: 'Draft', submitted: 'Submitted', keyed_in: 'Keyed in',
};

function emptySchool(cat: string) {
  return { category: cat, name: '', schoolCode: '', subcounty: '', boardingDay: '', gender: '', combination: '1st' };
}

function blankForm() {
  return {
    guardianName: '', guardianIdNumber: '', relationship: '', phonePrimary: '', phoneAlternative: '', address: '',
    careerInterest: '', pathway: '',
    combination1: ['', '', ''], combination2: ['', '', ''],
    schools: SCHOOL_ROWS.map(r => emptySchool(r.cat)),
    consentConfirmed: false,
  };
}

export default function SeniorSelectionPage() {
  const { user } = useAuth();
  const parent = isParent(user?.role || '');

  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<any[]>([]);   // parent view
  const [rows, setRows] = useState<any[]>([]);            // staff view
  const [activeChild, setActiveChild] = useState<any>(null);
  const [form, setForm] = useState<any>(blankForm());
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { printHtml, downloading: printing } = usePdfDownload();

  const load = () => {
    setLoading(true);
    const url = parent ? '/senior-selection/my-children' : '/senior-selection';
    apiClient.get(url)
      .then(r => parent ? setChildren(r.data || []) : setRows(r.data || []))
      .catch(() => toast.error('Could not load Grade 10 selection data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [parent]);

  const openChild = (child: any) => {
    setActiveChild(child);
    const f = child.form;
    setForm(f ? {
      guardianName: f.guardianName || child.guardianName || '',
      guardianIdNumber: f.guardianIdNumber || child.guardianIdNo || '',
      relationship: f.relationship || child.guardianRelation || '',
      phonePrimary: f.phonePrimary || child.guardianPhone || '',
      phoneAlternative: f.phoneAlternative || '',
      address: f.address || child.residence || '',
      careerInterest: f.careerInterest || '',
      pathway: f.pathway || '',
      combination1: (f.combination1 && f.combination1.length === 3) ? f.combination1 : ['', '', ''],
      combination2: (f.combination2 && f.combination2.length === 3) ? f.combination2 : ['', '', ''],
      schools: (f.schools && f.schools.length === 8) ? f.schools : SCHOOL_ROWS.map(r => emptySchool(r.cat)),
      consentConfirmed: !!f.consentConfirmed,
      status: f.status,
    } : {
      ...blankForm(),
      guardianName: child.guardianName || '',
      guardianIdNumber: child.guardianIdNo || '',
      relationship: child.guardianRelation || '',
      phonePrimary: child.guardianPhone || '',
      address: child.residence || '',
    });
  };

  const locked = form.status && form.status !== 'draft';

  const setCombo = (key: 'combination1' | 'combination2', idx: number, val: string) => {
    setForm((f: any) => {
      const arr = [...f[key]]; arr[idx] = val; return { ...f, [key]: arr };
    });
  };
  const setSchoolField = (idx: number, key: string, val: string) => {
    setForm((f: any) => {
      const arr = [...f.schools]; arr[idx] = { ...arr[idx], [key]: val }; return { ...f, schools: arr };
    });
  };

  const save = async (submit: boolean) => {
    if (!activeChild) return;
    setSaving(true);
    try {
      const { data } = await apiClient.post(`/senior-selection/${activeChild.id}`, { ...form, submit });
      toast.success(submit ? 'Selection submitted!' : 'Draft saved');
      setActiveChild(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not save form');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (row: any) => {
    if (!row.formId) { toast.error('This learner has not started the form yet.'); return; }
    setDetailLoading(true);
    setDetail({ loading: true });
    try {
      const { data } = await apiClient.get(`/senior-selection/${row.formId}`);
      setDetail(data);
    } catch (err: any) {
      toast.error('Could not load form');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const markReceived = async (id: string) => {
    try {
      await apiClient.patch(`/senior-selection/${id}/receive`);
      toast.success('Marked as received / keyed in');
      setDetail(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not update');
    }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Grade 10 Senior School Selection</h1>
          <p className="text-sm text-theme-muted">
            {parent ? 'Career interest, pathway and senior school choices for your Grade 9 learner(s)'
                    : 'Grade 9 parent/guardian submissions'}
          </p>
        </div>
        {!parent && (
          <button
            onClick={() => printHtml('/senior-selection/bulk-print/html', 'bulk-print')}
            disabled={printing === 'bulk-print'}
            className="btn-primary"
          >
            {printing === 'bulk-print' ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            Print blank forms (all G9)
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 shimmer rounded-xl" />)}</div>
      ) : parent ? (
        children.length === 0 ? (
          <div className="card p-10 text-center">
            <GraduationCap size={36} className="mx-auto text-[#e2e6f0] mb-2" />
            <p className="text-theme-muted">No Grade 9 learner linked to your account.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {children.map((c: any) => {
              const status = c.form?.status || 'not_started';
              return (
                <div key={c.id} className="card p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-theme-heading text-sm">{c.firstName} {c.lastName}</span>
                      <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
                    </div>
                    <p className="text-xs text-theme-muted mt-1">
                      Assessment No: {c.upiNumber || '—'} · Adm: {c.admissionNumber || '—'} · {c.schoolName}
                    </p>
                  </div>
                  <button onClick={() => openChild(c)} className="btn-primary">
                    <FileText size={14} /> {status === 'not_started' || status === 'draft' ? 'Fill form' : 'View'}
                  </button>
                </div>
              );
            })}
          </div>
        )
      ) : (
        rows.length === 0 ? (
          <div className="card p-10 text-center">
            <GraduationCap size={36} className="mx-auto text-[#e2e6f0] mb-2" />
            <p className="text-theme-muted">No Grade 9 learners found.</p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-theme-muted border-b border-theme">
                  <th className="p-3">Learner</th>
                  <th className="p-3">Assessment No</th>
                  <th className="p-3">Stream</th>
                  <th className="p-3">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.learnerId} className="border-b border-theme last:border-0">
                    <td className="p-3 font-semibold text-theme-heading">{r.firstName} {r.lastName}</td>
                    <td className="p-3 text-theme-muted">{r.upiNumber || '—'}</td>
                    <td className="p-3 text-theme-muted">{r.streamName || '—'}</td>
                    <td className="p-3"><span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td className="p-3 text-right">
                      {r.formId ? (
                        <button onClick={() => openDetail(r)} className="btn-ghost text-xs">View</button>
                      ) : (
                        <span className="text-xs text-theme-muted">Not started</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Parent form modal */}
      {activeChild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-theme flex-shrink-0">
              <h3 className="text-lg font-bold text-theme-heading">
                {activeChild.firstName} {activeChild.lastName} — Senior School Selection
              </h3>
              <button onClick={() => setActiveChild(null)}><X size={20} className="text-theme-muted" /></button>
            </div>

            <div className="p-5 space-y-6 overflow-y-auto flex-1">
              {locked && (
                <div className="p-3 rounded-lg bg-blue-50 text-blue-700 text-sm flex items-center gap-2">
                  <CheckCircle2 size={16} /> This form has been submitted and can no longer be changed.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-theme-muted">Learner</span><br /><b>{activeChild.firstName} {activeChild.lastName}</b></div>
                <div><span className="text-theme-muted">Assessment No.</span><br /><b>{activeChild.upiNumber || '—'}</b></div>
                <div><span className="text-theme-muted">School</span><br /><b>{activeChild.schoolName}</b></div>
              </div>

              <section className="space-y-3">
                <h4 className="font-bold text-theme-heading text-sm">Parent / Guardian Details</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Full name *</label>
                    <input disabled={locked} className="input" value={form.guardianName}
                      onChange={e => setForm({ ...form, guardianName: e.target.value })} /></div>
                  <div><label className="label">National ID number</label>
                    <input disabled={locked} className="input" value={form.guardianIdNumber}
                      onChange={e => setForm({ ...form, guardianIdNumber: e.target.value })} /></div>
                  <div><label className="label">Relationship to learner</label>
                    <input disabled={locked} className="input" value={form.relationship}
                      onChange={e => setForm({ ...form, relationship: e.target.value })} /></div>
                  <div><label className="label">Phone (primary) *</label>
                    <input disabled={locked} className="input" value={form.phonePrimary}
                      onChange={e => setForm({ ...form, phonePrimary: e.target.value })} /></div>
                  <div><label className="label">Phone (alternative)</label>
                    <input disabled={locked} className="input" value={form.phoneAlternative}
                      onChange={e => setForm({ ...form, phoneAlternative: e.target.value })} /></div>
                  <div><label className="label">Village / Location / Address</label>
                    <input disabled={locked} className="input" value={form.address}
                      onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="font-bold text-theme-heading text-sm">Career Interest and Pathway</h4>
                <div>
                  <label className="label">Learner's career interest / aspiration</label>
                  <input disabled={locked} className="input" value={form.careerInterest}
                    onChange={e => setForm({ ...form, careerInterest: e.target.value })} />
                </div>
                <div>
                  <label className="label">Pathway (choose one)</label>
                  <div className="grid grid-cols-1 gap-2">
                    {PATHWAYS.map(g => (
                      <div key={g.group}>
                        <p className="text-xs font-bold text-theme-muted mt-1">{g.group}</p>
                        {g.options.map(o => (
                          <label key={o.value} className="flex items-center gap-2 text-sm py-0.5">
                            <input type="radio" disabled={locked} name="pathway" checked={form.pathway === o.value}
                              onChange={() => setForm({ ...form, pathway: o.value })} />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="font-bold text-theme-heading text-sm">Subject Combination</h4>
                <p className="text-xs text-theme-muted">Four core subjects (English; Kiswahili/KSL; Community Service Learning; PE) apply automatically, plus three from the chosen pathway.</p>
                <div>
                  <label className="label">First choice combination</label>
                  <div className="grid grid-cols-3 gap-2">
                    {form.combination1.map((v: string, i: number) => (
                      <input key={i} disabled={locked} className="input" placeholder={`Subject ${i + 1}`} value={v}
                        onChange={e => setCombo('combination1', i, e.target.value)} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Second choice combination (same pathway)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {form.combination2.map((v: string, i: number) => (
                      <input key={i} disabled={locked} className="input" placeholder={`Subject ${i + 1}`} value={v}
                        onChange={e => setCombo('combination2', i, e.target.value)} />
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="font-bold text-theme-heading text-sm">Senior School Choices — 8 schools</h4>
                <p className="text-xs text-theme-muted">3× C1, 2× C2, 2× C3, 1× C4 (day school, within reasonable travel distance).</p>
                {form.schools.map((s: any, i: number) => (
                  <div key={i} className="border border-theme rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="badge bg-surface-2 text-theme-muted">#{i + 1} · {s.category}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input disabled={locked} className="input" placeholder="School name" value={s.name}
                        onChange={e => setSchoolField(i, 'name', e.target.value)} />
                      <input disabled={locked} className="input" placeholder="School code" value={s.schoolCode}
                        onChange={e => setSchoolField(i, 'schoolCode', e.target.value)} />
                      <input disabled={locked} className="input" placeholder="Sub-county / County" value={s.subcounty}
                        onChange={e => setSchoolField(i, 'subcounty', e.target.value)} />
                      <select disabled={locked} className="input" value={s.boardingDay}
                        onChange={e => setSchoolField(i, 'boardingDay', e.target.value)}>
                        <option value="">Boarding / Day</option>
                        <option value="boarding">Boarding</option>
                        <option value="day">Day</option>
                      </select>
                      <select disabled={locked} className="input" value={s.gender}
                        onChange={e => setSchoolField(i, 'gender', e.target.value)}>
                        <option value="">Boys / Girls / Mixed</option>
                        <option value="boys">Boys</option>
                        <option value="girls">Girls</option>
                        <option value="mixed">Mixed</option>
                      </select>
                      <select disabled={locked} className="input" value={s.combination}
                        onChange={e => setSchoolField(i, 'combination', e.target.value)}>
                        <option value="1st">Combination: 1st choice</option>
                        <option value="2nd">Combination: 2nd choice</option>
                      </select>
                    </div>
                  </div>
                ))}
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-theme-heading text-sm">Declaration and Consent</h4>
                <ul className="text-xs text-theme-muted list-disc pl-4 space-y-1">
                  <li>I have discussed the career interest, pathway, subject combination and the eight school choices with my child and the class teacher.</li>
                  <li>I have confirmed each school listed offers my child's chosen pathway and subject combination.</li>
                  <li>The C4 day school chosen is within reasonable daily travelling distance of our home.</li>
                  <li>I understand the pathway and subject combination cannot be changed once submitted, and placement is automated and merit-based.</li>
                  <li>All the details given above are correct.</li>
                </ul>
                <label className="flex items-center gap-2 text-sm pt-2">
                  <input type="checkbox" disabled={locked} checked={form.consentConfirmed}
                    onChange={e => setForm({ ...form, consentConfirmed: e.target.checked })} />
                  I confirm the above as {form.guardianName || 'the parent/guardian'} (digital signature)
                </label>
              </section>
            </div>

            {!locked && (
              <div className="flex gap-3 p-5 border-t border-theme flex-shrink-0">
                <button type="button" onClick={() => save(false)} disabled={saving} className="btn-ghost flex-1">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save draft'}
                </button>
                <button type="button" onClick={() => save(true)} disabled={saving} className="btn-primary flex-1">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <><Send size={14} /> Submit</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Staff read-only detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-theme flex-shrink-0">
              <h3 className="text-lg font-bold text-theme-heading">
                {detail.learnerFirstName} {detail.learnerLastName} — Senior School Selection
              </h3>
              <button onClick={() => setDetail(null)}><X size={20} className="text-theme-muted" /></button>
            </div>
            {detailLoading ? (
              <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto" /></div>
            ) : (
              <div className="p-5 space-y-4 text-sm overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-theme-muted">Assessment No.</span><br /><b>{detail.upiNumber || '—'}</b></div>
                  <div><span className="text-theme-muted">Status</span><br />
                    <span className={`badge ${STATUS_BADGE[detail.status]}`}>{STATUS_LABEL[detail.status]}</span></div>
                  <div><span className="text-theme-muted">Guardian</span><br /><b>{detail.guardianName}</b> ({detail.relationship || '—'})</div>
                  <div><span className="text-theme-muted">Phone</span><br /><b>{detail.phonePrimary}</b></div>
                  <div className="col-span-2"><span className="text-theme-muted">Career interest</span><br />{detail.careerInterest || '—'}</div>
                  <div className="col-span-2"><span className="text-theme-muted">Pathway</span><br />{detail.pathway || '—'}</div>
                  <div><span className="text-theme-muted">1st combination</span><br />{(detail.combination1 || []).filter(Boolean).join(', ') || '—'}</div>
                  <div><span className="text-theme-muted">2nd combination</span><br />{(detail.combination2 || []).filter(Boolean).join(', ') || '—'}</div>
                </div>
                <div>
                  <p className="font-bold text-theme-heading mb-1">School choices</p>
                  <div className="space-y-1">
                    {(detail.schools || []).map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs border-b border-theme py-1">
                        <span className="badge bg-surface-2 text-theme-muted">{s.category}</span>
                        <span className="font-semibold">{s.name || '—'}</span>
                        <span className="text-theme-muted">{s.schoolCode} · {s.subcounty} · {s.boardingDay} · {s.gender}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {detail.status === 'submitted' && (
                  <button onClick={() => markReceived(detail.id)} className="btn-primary w-full">
                    <CheckCircle2 size={14} /> Mark received / keyed in
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
