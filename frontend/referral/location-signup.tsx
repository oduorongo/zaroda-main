// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// LOCATION-AWARE SIGNUP + SUPER ADMIN MARKETING DASHBOARD
// Components:
//   LocationSelector  — cascading county→sub-county→zone dropdowns
//   SignupFormWithLocation — updated invite accept page
//   SuperAdminMarketingDashboard — filterable school pipeline
// ============================================================

'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';

// ─────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────
export const LocationAPI = {
  getCounties:     ()               => apiClient.get('/api/v1/location/counties'),
  getSubCounties:  (countyId: number)  => apiClient.get(`/api/v1/location/counties/${countyId}/sub-counties`),
  getZones:        (subCountyId: number)=> apiClient.get(`/api/v1/location/sub-counties/${subCountyId}/zones`),
};

export const SuperAdminAPI = {
  getPipeline:   (p?: any) => apiClient.get('/api/v1/super-admin/marketing/pipeline', { params: p }),
  getGeographic: ()        => apiClient.get('/api/v1/super-admin/marketing/geographic'),
  getTenants:    (p?: any) => apiClient.get('/api/v1/super-admin/tenants', { params: p }),
};


// ─────────────────────────────────────────────────────────────
// LocationSelector — reusable cascading dropdown component
// Works in signup form and super admin filters
// ─────────────────────────────────────────────────────────────
export function LocationSelector({
  value,
  onChange,
  required = false,
  showZone = true,
  className = '',
}: {
  value: { countyId?: number; subCountyId?: number; zoneId?: number;
           county?: string; subCounty?: string; zone?: string };
  onChange: (v: typeof value) => void;
  required?:  boolean;
  showZone?:  boolean;
  className?: string;
}) {
  const [counties,    setCounties]    = useState<any[]>([]);
  const [subCounties, setSubCounties] = useState<any[]>([]);
  const [zones,       setZones]       = useState<any[]>([]);
  const [loadingSub,  setLoadingSub]  = useState(false);
  const [loadingZone, setLoadingZone] = useState(false);

  // Load counties once on mount
  useEffect(() => {
    LocationAPI.getCounties().then(r => setCounties(r.data)).catch(() => {});
  }, []);

  // Load sub-counties when county changes
  useEffect(() => {
    if (!value.countyId) { setSubCounties([]); setZones([]); return; }
    setLoadingSub(true);
    LocationAPI.getSubCounties(value.countyId)
      .then(r => setSubCounties(r.data))
      .catch(() => setSubCounties([]))
      .finally(() => setLoadingSub(false));
  }, [value.countyId]);

  // Load zones when sub-county changes
  useEffect(() => {
    if (!value.subCountyId || !showZone) { setZones([]); return; }
    setLoadingZone(true);
    LocationAPI.getZones(value.subCountyId)
      .then(r => setZones(r.data))
      .catch(() => setZones([]))
      .finally(() => setLoadingZone(false));
  }, [value.subCountyId, showZone]);

  const handleCounty = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const opt     = e.target.selectedOptions[0];
    const id      = parseInt(e.target.value) || undefined;
    const name    = opt?.text || '';
    onChange({ countyId: id, county: id ? name : '', subCountyId: undefined, subCounty: '', zoneId: undefined, zone: '' });
  };

  const handleSubCounty = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const opt     = e.target.selectedOptions[0];
    const id      = parseInt(e.target.value) || undefined;
    const name    = opt?.text || '';
    onChange({ ...value, subCountyId: id, subCounty: id ? name : '', zoneId: undefined, zone: '' });
  };

  const handleZone = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const opt  = e.target.selectedOptions[0];
    const id   = parseInt(e.target.value) || undefined;
    const name = opt?.text || '';
    onChange({ ...value, zoneId: id, zone: id ? name : '' });
  };

  const baseClass = `w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm
    focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] focus:border-transparent
    disabled:bg-gray-50 disabled:text-gray-400 transition-colors ${className}`;

  return (
    <div className="space-y-3">
      {/* County */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          County {required && <span className="text-red-500">*</span>}
        </label>
        <select value={value.countyId || ''} onChange={handleCounty} className={baseClass}>
          <option value="">Select county…</option>
          {counties.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Sub-county */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Sub-County {required && <span className="text-red-500">*</span>}
        </label>
        <select
          value={value.subCountyId || ''}
          onChange={handleSubCounty}
          disabled={!value.countyId || loadingSub}
          className={baseClass}
        >
          <option value="">
            {loadingSub ? 'Loading…' : !value.countyId ? 'Select county first' : 'Select sub-county…'}
          </option>
          {subCounties.map(sc => (
            <option key={sc.id} value={sc.id}>{sc.name}</option>
          ))}
        </select>
      </div>

      {/* Zone */}
      {showZone && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Zone {required && <span className="text-red-500">*</span>}
          </label>
          <select
            value={value.zoneId || ''}
            onChange={handleZone}
            disabled={!value.subCountyId || loadingZone}
            className={baseClass}
          >
            <option value="">
              {loadingZone ? 'Loading…' : !value.subCountyId ? 'Select sub-county first' : 'Select zone…'}
            </option>
            {zones.map(z => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
            {!loadingZone && value.subCountyId && zones.length === 0 && (
              <option value="" disabled>No zones listed — type below</option>
            )}
          </select>
          {/* Fallback text input if zone not in list */}
          {value.subCountyId && zones.length === 0 && (
            <input
              type="text"
              value={value.zone || ''}
              onChange={e => onChange({ ...value, zone: e.target.value })}
              placeholder="Type your zone name (e.g. Westlands Zone B)"
              className={`${baseClass} mt-2`}
            />
          )}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Updated InviteAcceptPage with location capture
// Replaces the version in share-invite.tsx
// ─────────────────────────────────────────────────────────────
export function InviteAcceptPageWithLocation({ token }: { token: string }) {
  const [state,    setState]    = useState<'loading'|'valid'|'invalid'|'submitting'|'done'>('loading');
  const [invite,   setInvite]   = useState<any>(null);
  const [clickId,  setClickId]  = useState<string | null>(null);
  const [error,    setError]    = useState('');
  const [form,     setForm]     = useState({
    schoolName: '', adminName: '', adminEmail: '',
  });
  const [location, setLocation] = useState<{
    countyId?: number; subCountyId?: number; zoneId?: number;
    county?: string;   subCounty?: string;   zone?: string;
  }>({});

  useEffect(() => {
    apiClient.get(`/api/v1/invites/validate/${token}`)
      .then(r => {
        if (r.data.valid) { setInvite(r.data); setClickId(r.data.clickId); setState('valid'); }
        else { setError(r.data.error); setState('invalid'); }
      })
      .catch(() => { setError('Could not verify invite link.'); setState('invalid'); });
  }, [token]);

  const submit = async () => {
    if (!form.schoolName || !form.adminName || !form.adminEmail) {
      setError('Please fill all required fields.'); return;
    }
    if (!location.countyId || !location.subCountyId || !location.zoneId) {
      setError('Please select your county, sub-county and zone.'); return;
    }

    setState('submitting');
    try {
      await apiClient.post('/api/v1/invites/accept', {
        token, clickId,
        schoolName:     form.schoolName,
        adminName:      form.adminName,
        adminEmail:     form.adminEmail,
        streamName:     invite?.invite?.className,
        county:         location.county,
        subCounty:      location.subCounty,
        zone:           location.zone,
        keCountyId:     location.countyId,
        keSubCountyId:  location.subCountyId,
        keZoneId:       location.zoneId,
      });
      setState('done');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Signup failed. Please try again.');
      setState('valid');
    }
  };

  if (state === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6fb]">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#1a2e5a] border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <p className="text-gray-500 text-sm">Verifying invite…</p>
      </div>
    </div>
  );

  if (state === 'invalid') return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6fb] p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm">
        <div className="text-5xl mb-4">😕</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Invite Link Issue</h2>
        <p className="text-sm text-gray-500 mb-6">{error}</p>
        <a href="https://app.zarodasolutions.app"
          className="inline-block px-6 py-3 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium">
          Go to ZARODA →
        </a>
      </div>
    </div>
  );

  if (state === 'done') return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6fb] p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">You're In!</h2>
        <p className="text-sm text-gray-500 mb-1">Welcome to ZARODA School Management System.</p>
        <p className="text-sm text-gray-500 mb-2">
          Check <strong>{form.adminEmail}</strong> for your login details.
        </p>
        {location.zone && (
          <p className="text-xs text-gray-400 mb-6">
            📍 {location.zone} · {location.subCounty} · {location.county}
          </p>
        )}
        <div className="bg-[#f4f6fb] rounded-xl p-4 text-xs text-gray-500 text-left mb-5">
          <p className="font-semibold text-[#1a2e5a] mb-0.5">ZARODA Solutions</p>
          <p>Empowering Schools with Technology</p>
          <p className="mt-1">+254781230805 · www.zarodasolutions.app</p>
        </div>
        <a href="https://app.zarodasolutions.app"
          className="block w-full py-3 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347]">
          Go to Dashboard →
        </a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f4f6fb] flex items-start justify-center p-4 py-8">
      <div className="bg-white rounded-2xl shadow-sm w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-[#1a2e5a] px-6 py-5 text-center">
          <div className="text-2xl mb-1">🎓</div>
          <h1 className="text-white font-bold text-lg">ZARODA School Management</h1>
          <p className="text-white/70 text-xs mt-0.5">Empowering Schools with Technology</p>
        </div>

        <div className="px-6 py-5">
          {/* Invite context */}
          <div className="bg-[#f4f6fb] rounded-xl p-4 mb-5">
            <p className="text-xs text-gray-500 mb-0.5">You've been invited by</p>
            <p className="font-semibold text-gray-900">{invite?.invite?.teacherName}</p>
            <p className="text-sm text-gray-600">{invite?.invite?.className} Class Teacher</p>
            <div className="flex gap-3 mt-2 text-xs text-gray-400">
              <span>⏱ {invite?.daysRemaining}d left</span>
              <span>👥 {invite?.spotsRemaining} spots</span>
            </div>
          </div>

          <h2 className="font-semibold text-gray-900 mb-1">Create Your School Account</h2>
          <p className="text-xs text-gray-500 mb-4">
            Start with your class today — the whole school can join later.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          <div className="space-y-3 mb-4">
            {/* School details */}
            {[
              { key:'schoolName', label:'School Name *',    placeholder:'e.g. Starlight Primary School', type:'text' },
              { key:'adminName',  label:'Your Name *',      placeholder:'Principal / Head Teacher', type:'text' },
              { key:'adminEmail', label:'Email Address *',  placeholder:'you@school.ac.ke', type:'email' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                <input
                  type={f.type}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({...p, [f.key]: e.target.value}))}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm
                    focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"
                />
              </div>
            ))}
          </div>

          {/* Location — the new section */}
          <div className="border-t border-gray-100 pt-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">📍</span>
              <div>
                <p className="text-xs font-semibold text-gray-700">School Location</p>
                <p className="text-xs text-gray-400">Helps us serve you better in your area</p>
              </div>
            </div>
            <LocationSelector
              value={location}
              onChange={setLocation}
              required={true}
              showZone={true}
            />
          </div>

          <button
            onClick={submit}
            disabled={state === 'submitting'}
            className="w-full py-3.5 bg-[#1a2e5a] text-white rounded-xl text-sm font-semibold
              hover:bg-[#142347] active:scale-95 transition-all disabled:opacity-60"
          >
            {state === 'submitting' ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Creating account…
              </span>
            ) : 'Create My School Account →'}
          </button>
          <p className="text-xs text-center text-gray-400 mt-3">
            By signing up you agree to ZARODA's terms of service
          </p>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// SuperAdminMarketingDashboard — filterable pipeline
// ─────────────────────────────────────────────────────────────
export function SuperAdminMarketingDashboard() {
  const [geo,       setGeo]       = useState<any[]>([]);
  const [pipeline,  setPipeline]  = useState<any[]>([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<'pipeline'|'map'>('pipeline');
  const [filters,   setFilters]   = useState<{
    countyId?: number; subCountyId?: number; zoneId?: number;
    status?: string; search?: string; page: number;
  }>({ page: 1 });
  const [filterLoc, setFilterLoc] = useState<{
    countyId?: number; subCountyId?: number; zoneId?: number;
    county?: string; subCounty?: string; zone?: string;
  }>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'pipeline') {        const { data } = await SuperAdminAPI.getPipeline({
          ...filters,
          countyId:    filterLoc.countyId,
          subCountyId: filterLoc.subCountyId,
          zoneId:      filterLoc.zoneId,
        });
        setPipeline(data.data);
        setTotal(data.total);
      } else if (tab === 'map') {
        const { data } = await SuperAdminAPI.getGeographic();
        setGeo(data);
      }
    } finally { setLoading(false); }
  }, [tab, filters, filterLoc]);

  useEffect(() => { load(); }, [load]);

  const STATUS_COLORS: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    trial:     'bg-blue-100 text-blue-700',
    suspended: 'bg-orange-100 text-orange-700',
    cancelled: 'bg-red-100 text-red-700',
    null:      'bg-gray-100 text-gray-500',
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Marketing Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            School signups · Location analytics · Pipeline — Kenya-wide
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-[#1a2e5a]">{total.toLocaleString()}</div>
          <div className="text-xs text-gray-400">total records</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { k:'pipeline', label:'📋 Pipeline' },
          { k:'map',      label:'🗺 By County' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all
              ${tab === t.k ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]' : 'bg-white text-gray-600 border-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Location filter — appears on all tabs */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Filter by Location</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <LocationSelector
            value={filterLoc}
            onChange={v => { setFilterLoc(v); setFilters(f => ({...f, page: 1})); }}
            required={false}
            showZone={true}
          />
        </div>
        {(filterLoc.countyId || filterLoc.subCountyId || filterLoc.zoneId) && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-gray-500">Active filters:</span>
            {filterLoc.county    && <FilterChip label={filterLoc.county}    onRemove={() => setFilterLoc({})} />}
            {filterLoc.subCounty && <FilterChip label={filterLoc.subCounty} onRemove={() => setFilterLoc(v => ({...v, subCountyId:undefined, subCounty:'', zoneId:undefined, zone:''}))} />}
            {filterLoc.zone      && <FilterChip label={filterLoc.zone}      onRemove={() => setFilterLoc(v => ({...v, zoneId:undefined, zone:''}))} />}
          </div>
        )}
      </div>

      {/* PIPELINE TAB */}
      {tab === 'pipeline' && (
        <>
          {/* Status filter */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {[
              { v:'',          label:'All Statuses' },
              { v:'active',    label:'Paying' },
              { v:'trial',     label:'On Trial' },
              { v:'cancelled', label:'Churned' },
            ].map(s => (
              <button key={s.v} onClick={() => setFilters(f => ({...f, status: s.v, page: 1}))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                  ${filters.status === s.v ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {s.label}
              </button>
            ))}
            <div className="ml-auto">
              <input
                value={filters.search || ''}
                onChange={e => setFilters(f => ({...f, search: e.target.value, page: 1}))}
                placeholder="Search school name…"
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Loading pipeline…</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#f4f6fb] border-b border-gray-100">
                  <tr>
                    {['School','Admin','Location','Zone','Status','Signed Up','Invite'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pipeline.map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 text-sm">{r.school_name}</div>
                        <div className="text-xs text-gray-400">{r.admin_email}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.admin_name}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-gray-800">
                          {r.ke_county_name || r.county || '—'}
                        </div>
                        <div className="text-xs text-gray-400">
                          {r.ke_sub_county_name || r.sub_county || ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {r.ke_zone_name || r.zone || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded capitalize
                          ${STATUS_COLORS[r.tenant_status] || STATUS_COLORS.null}`}>
                          {r.tenant_status || 'Not onboarded'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {r.signed_up_at && new Date(r.signed_up_at).toLocaleDateString('en-KE',{
                          day:'numeric', month:'short', year:'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {r.invite_id ? '✓ Via invite' : 'Direct'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pipeline.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">
                  No records match your filters
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* BY COUNTY TAB */}
      {tab === 'map' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f4f6fb] border-b border-gray-100">
              <tr>
                {['County','Region','Total Signups','Paying','On Trial','Not Onboarded','Conversion'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">Loading…</td></tr>
              ) : geo.filter(r => parseInt(r.total_signups) > 0).map((r: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.county_name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.region}</td>
                  <td className="px-4 py-3 font-bold text-[#1a2e5a]">{r.total_signups}</td>
                  <td className="px-4 py-3 font-semibold text-green-700">{r.paying_schools}</td>
                  <td className="px-4 py-3 text-blue-600">{r.on_trial}</td>
                  <td className="px-4 py-3 text-gray-500">{r.not_yet_onboarded}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full"
                          style={{ width: `${Math.min(parseFloat(r.conversion_pct) || 0, 100)}%` }}/>
                      </div>
                      <span className="text-xs font-medium text-gray-600 w-10 text-right">
                        {r.conversion_pct || 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && geo.filter(r => parseInt(r.total_signups) > 0).length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No signup data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

// Filter chip
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#1a2e5a] text-white text-xs rounded-lg">
      {label}
      <button onClick={onRemove} className="hover:text-white/70 ml-0.5">×</button>
    </span>
  );
}
