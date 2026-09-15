'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Bus, Truck, Users, Plus, X, Trash2, Save, MapPin } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { LearnerSearch, matchesLearner } from '@/components/LearnerSearch';
import toast from 'react-hot-toast';

const ksh = (n: number) => 'KES ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 });

export default function TransportPage() {
  const [tab, setTab] = useState<'routes' | 'vehicles' | 'assignments'>('routes');

  // ── Vehicles ──
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ registrationNumber: '', makeModel: '', capacity: '', driverName: '', driverPhone: '' });
  const [savingVehicle, setSavingVehicle] = useState(false);

  const loadVehicles = () => {
    setLoadingVehicles(true);
    apiClient.get('/transport/vehicles').then(r => setVehicles(r.data || [])).catch(() => setVehicles([])).finally(() => setLoadingVehicles(false));
  };
  useEffect(() => { loadVehicles(); }, []);

  const saveVehicle = async () => {
    if (!vehicleForm.registrationNumber.trim()) { toast.error('Registration number is required'); return; }
    setSavingVehicle(true);
    try {
      await apiClient.post('/transport/vehicles', vehicleForm);
      toast.success('Vehicle added');
      setShowVehicleForm(false);
      setVehicleForm({ registrationNumber: '', makeModel: '', capacity: '', driverName: '', driverPhone: '' });
      loadVehicles();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save vehicle'); }
    finally { setSavingVehicle(false); }
  };

  const deleteVehicle = async (id: string) => {
    if (!confirm('Remove this vehicle?')) return;
    try { await apiClient.delete(`/transport/vehicles/${id}`); toast.success('Removed'); loadVehicles(); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Could not remove vehicle'); }
  };

  const toggleVehicleStatus = async (v: any) => {
    try {
      await apiClient.patch(`/transport/vehicles/${v.id}`, { status: v.status === 'active' ? 'inactive' : 'active' });
      loadVehicles();
    } catch { toast.error('Could not update'); }
  };

  // ── Routes ──
  const [routes, setRoutes] = useState<any[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [routeForm, setRouteForm] = useState({ name: '', description: '', vehicleId: '', feeAmount: '' });
  const [savingRoute, setSavingRoute] = useState(false);
  const [openRoute, setOpenRoute] = useState<any>(null);

  const loadRoutes = () => {
    setLoadingRoutes(true);
    apiClient.get('/transport/routes').then(r => setRoutes(r.data || [])).catch(() => setRoutes([])).finally(() => setLoadingRoutes(false));
  };
  useEffect(() => { loadRoutes(); }, []);

  const saveRoute = async () => {
    if (!routeForm.name.trim()) { toast.error('Route name is required'); return; }
    setSavingRoute(true);
    try {
      await apiClient.post('/transport/routes', routeForm);
      toast.success('Route created');
      setShowRouteForm(false);
      setRouteForm({ name: '', description: '', vehicleId: '', feeAmount: '' });
      loadRoutes();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save route'); }
    finally { setSavingRoute(false); }
  };

  const deleteRoute = async (id: string) => {
    if (!confirm('Delete this route? Its stops and learner assignments will be removed too.')) return;
    try { await apiClient.delete(`/transport/routes/${id}`); toast.success('Deleted'); loadRoutes(); if (openRoute?.id === id) setOpenRoute(null); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Could not delete route'); }
  };

  // ── Stops (within an open route) ──
  const [stops, setStops] = useState<any[]>([]);
  const [loadingStops, setLoadingStops] = useState(false);
  const [stopForm, setStopForm] = useState({ name: '', pickupTime: '', dropoffTime: '' });
  const [savingStop, setSavingStop] = useState(false);

  const openRouteDetail = async (r: any) => {
    setOpenRoute(r);
    setLoadingStops(true);
    try { const { data } = await apiClient.get(`/transport/routes/${r.id}/stops`); setStops(data || []); }
    catch { setStops([]); }
    finally { setLoadingStops(false); }
  };

  const addStop = async () => {
    if (!stopForm.name.trim()) { toast.error('Stop name is required'); return; }
    setSavingStop(true);
    try {
      await apiClient.post('/transport/stops', { routeId: openRoute.id, orderIndex: stops.length, ...stopForm });
      setStopForm({ name: '', pickupTime: '', dropoffTime: '' });
      const { data } = await apiClient.get(`/transport/routes/${openRoute.id}/stops`);
      setStops(data || []);
      loadRoutes();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not add stop'); }
    finally { setSavingStop(false); }
  };

  const deleteStop = async (id: string) => {
    try {
      await apiClient.delete(`/transport/stops/${id}`);
      setStops(s => s.filter(x => x.id !== id));
    } catch { toast.error('Could not remove stop'); }
  };

  // ── Learner assignments ──
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [allLearners, setAllLearners] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignForm, setAssignForm] = useState({ learnerId: '', routeId: '', stopId: '' });
  const [assignRouteStops, setAssignRouteStops] = useState<any[]>([]);
  const [savingAssignment, setSavingAssignment] = useState(false);

  const loadAssignments = () => {
    setLoadingAssignments(true);
    apiClient.get('/transport/assignments').then(r => setAssignments(r.data || [])).catch(() => setAssignments([])).finally(() => setLoadingAssignments(false));
  };
  useEffect(() => { loadAssignments(); apiClient.get('/academic/learners').then(r => setAllLearners(r.data || [])).catch(() => setAllLearners([])); }, []);

  const assignedLearnerIds = new Set(assignments.map((a: any) => a.learnerId));
  const unassignedLearners = allLearners.filter((l: any) => !assignedLearnerIds.has(l.id));

  useEffect(() => {
    if (!assignForm.routeId) { setAssignRouteStops([]); return; }
    apiClient.get(`/transport/routes/${assignForm.routeId}/stops`).then(r => setAssignRouteStops(r.data || [])).catch(() => setAssignRouteStops([]));
  }, [assignForm.routeId]);

  const saveAssignment = async () => {
    if (!assignForm.learnerId || !assignForm.routeId) { toast.error('Select a learner and a route'); return; }
    setSavingAssignment(true);
    try {
      await apiClient.post('/transport/assignments', assignForm);
      toast.success('Learner assigned to route — the route fee will apply on the next invoice run.');
      setShowAssignForm(false);
      setAssignForm({ learnerId: '', routeId: '', stopId: '' });
      loadAssignments();
      loadRoutes();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save assignment'); }
    finally { setSavingAssignment(false); }
  };

  const removeAssignment = async (learnerId: string) => {
    if (!confirm('Remove this learner from their transport route?')) return;
    try { await apiClient.delete(`/transport/assignments/${learnerId}`); toast.success('Removed'); loadAssignments(); loadRoutes(); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Could not remove'); }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Student Transport</h1>
          <p className="text-sm text-theme-muted">Routes, vehicles, drivers and which learner rides where</p>
        </div>
      </div>

      <p className="text-xs text-theme-muted bg-surface-2/60 rounded-lg px-3 py-2">
        A learner actively assigned to a route is billed that route's fee automatically the next time invoices are generated for their stream, alongside their other fees.
      </p>

      <div className="flex border-b border-theme gap-1">
        {[{ key: 'routes', label: 'Routes' }, { key: 'vehicles', label: 'Vehicles' }, { key: 'assignments', label: 'Learner Assignments' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab===t.key ? 'border-[#1a2e5a] text-theme-heading' : 'border-transparent text-theme-muted hover:text-theme-heading'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'routes' && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bus size={16} className="text-[#1a2e5a]"/>
              <h2 className="font-bold text-theme-heading">Routes</h2>
            </div>
            <button onClick={() => setShowRouteForm(true)} className="btn-primary text-sm"><Plus size={14}/> New Route</button>
          </div>
          {loadingRoutes ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={22}/></div>
          ) : routes.length === 0 ? (
            <p className="text-sm text-theme-muted text-center py-8">No routes yet.</p>
          ) : (
            <div className="divide-y divide-theme">
              {routes.map((r: any) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold text-theme-heading text-sm flex items-center gap-2">
                      {r.name}
                      {r.status === 'inactive' && <span className="badge bg-gray-100 text-gray-600 text-[10px]">inactive</span>}
                    </div>
                    <div className="text-xs text-theme-muted">
                      {ksh(r.feeAmount)}/term · {r.stopCount} stop{r.stopCount === 1 ? '' : 's'} · {r.learnerCount} learner{r.learnerCount === 1 ? '' : 's'}
                      {r.vehicleReg ? ` · ${r.vehicleReg}${r.driverName ? ` (${r.driverName})` : ''}` : ' · No vehicle assigned'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openRouteDetail(r)} className="btn-ghost text-xs py-1.5 px-3"><MapPin size={12}/> Stops</button>
                    <button onClick={() => deleteRoute(r.id)} className="btn-ghost text-xs py-1.5 px-3 text-red-600"><Trash2 size={12}/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'vehicles' && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Truck size={16} className="text-[#1a2e5a]"/>
              <h2 className="font-bold text-theme-heading">Vehicles</h2>
            </div>
            <button onClick={() => setShowVehicleForm(true)} className="btn-primary text-sm"><Plus size={14}/> New Vehicle</button>
          </div>
          {loadingVehicles ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={22}/></div>
          ) : vehicles.length === 0 ? (
            <p className="text-sm text-theme-muted text-center py-8">No vehicles yet.</p>
          ) : (
            <div className="divide-y divide-theme">
              {vehicles.map((v: any) => (
                <div key={v.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold text-theme-heading text-sm">{v.registrationNumber} {v.makeModel ? `· ${v.makeModel}` : ''}</div>
                    <div className="text-xs text-theme-muted">
                      {v.capacity ? `${v.capacity} seats · ` : ''}{v.driverName ? `Driver: ${v.driverName}${v.driverPhone ? ` (${v.driverPhone})` : ''}` : 'No driver set'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge text-[10px] ${v.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{v.status}</span>
                    <button onClick={() => toggleVehicleStatus(v)} className="btn-ghost text-xs py-1.5 px-3">{v.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                    <button onClick={() => deleteVehicle(v.id)} className="btn-ghost text-xs py-1.5 px-3 text-red-600"><Trash2 size={12}/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'assignments' && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-[#1a2e5a]"/>
              <h2 className="font-bold text-theme-heading">Learner Assignments</h2>
            </div>
            <button onClick={() => setShowAssignForm(true)} className="btn-primary text-sm"><Plus size={14}/> Assign Learner</button>
          </div>
          <LearnerSearch value={search} onChange={setSearch} className="mb-3"/>
          {loadingAssignments ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={22}/></div>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-theme-muted text-center py-8">No learners assigned to a route yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-theme-muted border-b border-theme">
                  <th className="px-2 py-2">Learner</th><th className="px-2 py-2">Route</th><th className="px-2 py-2">Stop</th><th></th>
                </tr></thead>
                <tbody>
                  {assignments.filter((a: any) => matchesLearner(a, search)).map((a: any) => (
                    <tr key={a.id} className="border-b border-theme/40">
                      <td className="px-2 py-2">
                        <div className="font-semibold text-theme-heading">{a.firstName} {a.lastName}</div>
                        <div className="text-[10px] text-theme-muted">{a.admissionNumber}</div>
                      </td>
                      <td className="px-2 py-2">{a.routeName || '—'}</td>
                      <td className="px-2 py-2">{a.stopName || '—'}</td>
                      <td className="px-2 py-2 text-right"><button onClick={() => removeAssignment(a.learnerId)} className="btn-ghost text-xs text-red-600"><Trash2 size={12}/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showVehicleForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">New Vehicle</h3>
              <button onClick={() => setShowVehicleForm(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="label">Registration Number *</label><input value={vehicleForm.registrationNumber} onChange={e => setVehicleForm(f => ({...f, registrationNumber: e.target.value}))} className="input" placeholder="KDA 123A"/></div>
              <div><label className="label">Make / Model</label><input value={vehicleForm.makeModel} onChange={e => setVehicleForm(f => ({...f, makeModel: e.target.value}))} className="input" placeholder="Toyota Hiace"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Capacity</label><input type="number" min={0} value={vehicleForm.capacity} onChange={e => setVehicleForm(f => ({...f, capacity: e.target.value}))} className="input"/></div>
                <div><label className="label">Driver Phone</label><input value={vehicleForm.driverPhone} onChange={e => setVehicleForm(f => ({...f, driverPhone: e.target.value}))} className="input"/></div>
              </div>
              <div><label className="label">Driver Name</label><input value={vehicleForm.driverName} onChange={e => setVehicleForm(f => ({...f, driverName: e.target.value}))} className="input"/></div>
              <div className="flex gap-3 pt-2 border-t border-theme">
                <button onClick={() => setShowVehicleForm(false)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={saveVehicle} disabled={savingVehicle} className="btn-primary flex-1">{savingVehicle ? <Loader2 size={14} className="animate-spin"/> : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRouteForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">New Route</h3>
              <button onClick={() => setShowRouteForm(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="label">Route Name *</label><input value={routeForm.name} onChange={e => setRouteForm(f => ({...f, name: e.target.value}))} className="input" placeholder="e.g. Kikuyu Route"/></div>
              <div><label className="label">Description</label><input value={routeForm.description} onChange={e => setRouteForm(f => ({...f, description: e.target.value}))} className="input" placeholder="Optional"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Vehicle</label>
                  <select value={routeForm.vehicleId} onChange={e => setRouteForm(f => ({...f, vehicleId: e.target.value}))} className="input">
                    <option value="">None yet</option>
                    {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.registrationNumber}</option>)}
                  </select>
                </div>
                <div><label className="label">Fee (KES/term)</label><input type="number" min={0} value={routeForm.feeAmount} onChange={e => setRouteForm(f => ({...f, feeAmount: e.target.value}))} className="input"/></div>
              </div>
              <div className="flex gap-3 pt-2 border-t border-theme">
                <button onClick={() => setShowRouteForm(false)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={saveRoute} disabled={savingRoute} className="btn-primary flex-1">{savingRoute ? <Loader2 size={14} className="animate-spin"/> : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAssignForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">Assign Learner to Route</h3>
              <button onClick={() => setShowAssignForm(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="label">Learner *</label>
                <select value={assignForm.learnerId} onChange={e => setAssignForm(f => ({...f, learnerId: e.target.value}))} className="input">
                  <option value="">Select…</option>
                  {unassignedLearners.map((l: any) => <option key={l.id} value={l.id}>{l.firstName} {l.lastName} ({l.admissionNumber})</option>)}
                </select>
                <p className="text-xs text-theme-muted mt-1">Only learners without an active route are listed — one route at a time per learner.</p>
              </div>
              <div>
                <label className="label">Route *</label>
                <select value={assignForm.routeId} onChange={e => setAssignForm(f => ({...f, routeId: e.target.value, stopId: ''}))} className="input">
                  <option value="">Select…</option>
                  {routes.map((r: any) => <option key={r.id} value={r.id}>{r.name} — {ksh(r.feeAmount)}/term</option>)}
                </select>
              </div>
              {assignRouteStops.length > 0 && (
                <div>
                  <label className="label">Stop</label>
                  <select value={assignForm.stopId} onChange={e => setAssignForm(f => ({...f, stopId: e.target.value}))} className="input">
                    <option value="">None</option>
                    {assignRouteStops.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-2 border-t border-theme">
                <button onClick={() => setShowAssignForm(false)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={saveAssignment} disabled={savingAssignment} className="btn-primary flex-1">{savingAssignment ? <Loader2 size={14} className="animate-spin"/> : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {openRoute && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg my-8 mt-16" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">Stops — {openRoute.name}</h3>
              <button onClick={() => setOpenRoute(null)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-3">
              {loadingStops ? (
                <div className="flex justify-center py-6"><Loader2 className="animate-spin text-theme-muted" size={20}/></div>
              ) : stops.length === 0 ? (
                <p className="text-sm text-theme-muted text-center py-4">No stops added yet.</p>
              ) : (
                <div className="divide-y divide-theme">
                  {stops.map((s: any) => (
                    <div key={s.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="text-sm">
                        <div className="font-semibold text-theme-heading">{s.name}</div>
                        <div className="text-xs text-theme-muted">
                          {s.pickupTime ? `Pickup ${s.pickupTime}` : ''}{s.pickupTime && s.dropoffTime ? ' · ' : ''}{s.dropoffTime ? `Drop-off ${s.dropoffTime}` : ''}
                        </div>
                      </div>
                      <button onClick={() => deleteStop(s.id)} className="btn-ghost text-xs text-red-600"><Trash2 size={12}/></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-theme">
                <input value={stopForm.name} onChange={e => setStopForm(f => ({...f, name: e.target.value}))} className="input" placeholder="Stop name"/>
                <input value={stopForm.pickupTime} onChange={e => setStopForm(f => ({...f, pickupTime: e.target.value}))} className="input" placeholder="Pickup e.g. 6:30am"/>
                <input value={stopForm.dropoffTime} onChange={e => setStopForm(f => ({...f, dropoffTime: e.target.value}))} className="input" placeholder="Drop-off e.g. 4:30pm"/>
              </div>
              <button onClick={addStop} disabled={savingStop} className="btn-primary w-full justify-center">
                {savingStop ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Add Stop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
