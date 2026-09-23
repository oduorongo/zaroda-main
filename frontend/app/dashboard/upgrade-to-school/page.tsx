'use client';
// Turn an individual (Professional Records) account into a full school account.
//
// A teacher who signed up individually already owns a one-person tenant keyed to
// their email, so /auth/signup can only tell them the address is taken — they had
// no route into the school product except abandoning the account they had. This
// collects the school details that individual signup never asked for and posts
// them to POST /auth/upgrade-to-school, which converts the tenant in place:
// same login, same password, same Professional Records work.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MapPin, ChevronRight, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';
import { useAuth, isIndividualAccount } from '@/lib/hooks/useAuth';

const API = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/v1`;

// Same 47-county fallback the signup form uses — the location API is tried first,
// but the form must still work if it is unreachable.
const KE_COUNTIES = [
  { id:'1',  name:'Mombasa'         },{ id:'2',  name:'Kwale'           },
  { id:'3',  name:'Kilifi'          },{ id:'4',  name:'Tana River'      },
  { id:'5',  name:'Lamu'            },{ id:'6',  name:'Taita-Taveta'    },
  { id:'7',  name:'Garissa'         },{ id:'8',  name:'Wajir'           },
  { id:'9',  name:'Mandera'         },{ id:'10', name:'Marsabit'        },
  { id:'11', name:'Isiolo'          },{ id:'12', name:'Meru'            },
  { id:'13', name:'Tharaka-Nithi'   },{ id:'14', name:'Embu'            },
  { id:'15', name:'Kitui'           },{ id:'16', name:'Machakos'        },
  { id:'17', name:'Makueni'         },{ id:'18', name:'Nyandarua'       },
  { id:'19', name:'Nyeri'           },{ id:'20', name:'Kirinyaga'       },
  { id:'21', name:"Murang'a"        },{ id:'22', name:'Kiambu'          },
  { id:'23', name:'Turkana'         },{ id:'24', name:'West Pokot'      },
  { id:'25', name:'Samburu'         },{ id:'26', name:'Trans-Nzoia'     },
  { id:'27', name:'Uasin Gishu'     },{ id:'28', name:'Elgeyo-Marakwet' },
  { id:'29', name:'Nandi'           },{ id:'30', name:'Baringo'         },
  { id:'31', name:'Laikipia'        },{ id:'32', name:'Nakuru'          },
  { id:'33', name:'Narok'           },{ id:'34', name:'Kajiado'         },
  { id:'35', name:'Kericho'         },{ id:'36', name:'Bomet'           },
  { id:'37', name:'Kakamega'        },{ id:'38', name:'Vihiga'          },
  { id:'39', name:'Bungoma'         },{ id:'40', name:'Busia'           },
  { id:'41', name:'Siaya'           },{ id:'42', name:'Kisumu'          },
  { id:'43', name:'Homa Bay'        },{ id:'44', name:'Migori'          },
  { id:'45', name:'Kisii'           },{ id:'46', name:'Nyamira'         },
  { id:'47', name:'Nairobi'         },
];

const SUB_COUNTY_FALLBACKS: Record<string, string[]> = {
  'Nairobi':    ['Westlands','Dagoretti North','Dagoretti South','Langata','Kibra','Roysambu','Kasarani','Ruaraka','Embakasi South','Embakasi North','Embakasi Central','Embakasi East','Embakasi West','Makadara','Kamukunji','Starehe','Mathare'],
  'Mombasa':    ['Changamwe','Jomvu','Kisauni','Likoni','Mvita','Nyali'],
  'Kisumu':     ['Kisumu Central','Kisumu East','Kisumu West','Muhoroni','Nyakach','Nyando','Seme'],
  'Nakuru':     ['Bahati','Gilgil','Kuresoi North','Kuresoi South','Molo','Naivasha','Nakuru Town East','Nakuru Town West','Njoro','Rongai','Subukia'],
  'Kiambu':     ['Gatundu North','Gatundu South','Githunguri','Juja','Kabete','Kiambaa','Kiambu','Kikuyu','Lari','Limuru','Ruiru','Thika Town'],
  'Machakos':   ['Kathiani','Machakos Town','Masinga','Matungulu','Mavoko','Mwala','Yatta'],
  'Uasin Gishu':['Ainabkoi','Kapseret','Kesses','Moiben','Soy','Turbo'],
  'Kakamega':   ['Butere','Ikolomani','Khwisero','Likuyani','Lugari','Lurambi','Malava','Matungu','Mumias East','Mumias West','Navakholo','Shinyalu'],
  'Meru':       ['Buuri','Igembe Central','Igembe North','Igembe South','Imenti Central','Imenti North','Imenti South','Tigania East','Tigania West'],
};

export default function UpgradeToSchoolPage() {
  const router = useRouter();
  const { user, hydrated, refreshUser } = useAuth();

  const [step,    setStep]    = useState(1);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ knecCode: '', schoolName: '', phone: '' });
  const [schoolLevels, setSchoolLevels] = useState<string[]>([]);
  const [ownership,    setOwnership]    = useState<'public'|'private'|''>('');
  const [knecStatus,   setKnecStatus]   = useState<'idle'|'searching'|'found'|'notfound'>('idle');
  const [schoolAutoFilled, setSchoolAutoFilled] = useState(false);

  const [counties,    setCounties]    = useState<{id:string;name:string}[]>(KE_COUNTIES);
  const [subCounties, setSubCounties] = useState<string[]>([]);
  const [location,    setLocation]    = useState({ countyId:'', county:'', subCountyId:'', subCounty:'', zone:'' });

  // Prefill the phone already on record rather than asking for it again.
  useEffect(() => {
    if (user) setForm(f => (f.phone ? f : { ...f, phone: (user as any).phone || '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Only an individual account has anything to upgrade. Wait for the persisted
  // store to hydrate first, or this bounces on every hard refresh.
  useEffect(() => {
    if (!hydrated) return;
    if (!user) { router.replace('/auth/login'); return; }
    if (!isIndividualAccount(user.accountType)) router.replace('/dashboard');
  }, [hydrated, user, router]);

  useEffect(() => {
    fetch(`${API}/location/counties`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setCounties(data.map((c: any) => ({ id: String(c.id), name: c.name })));
        }
      })
      .catch(() => {/* keep fallback */});
  }, []);

  const toggleLevel = (lvl: string) =>
    setSchoolLevels(cur => cur.includes(lvl) ? cur.filter(x => x !== lvl) : [...cur, lvl]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const onCountyChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id   = e.target.value;
    const name = e.target.selectedOptions[0]?.text || '';
    setLocation(l => ({ ...l, countyId: id, county: name, subCountyId: '', subCounty: '', zone: '' }));
    setSubCounties([]);
    if (!id) return;
    try {
      const res = await fetch(`${API}/location/counties/${id}/sub-counties`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) { setSubCounties(data.map((s: any) => s.name)); return; }
      }
    } catch {}
    setSubCounties(SUB_COUNTY_FALLBACKS[name] || []);
  };

  const lookupKnec = async (code: string) => {
    const c = code.trim();
    if (c.length < 4) { setKnecStatus('idle'); return; }
    setKnecStatus('searching');
    try {
      const res  = await fetch(`${API}/location/schools/${encodeURIComponent(c)}`);
      const data = res.ok ? await res.json() : null;
      if (data && data.found) {
        setForm(f => ({ ...f, schoolName: data.name || f.schoolName }));
        setLocation(l => ({
          ...l,
          county:    data.county    || l.county,
          subCounty: data.subCounty || l.subCounty,
          zone:      data.zone      || l.zone,
        }));
        const matched = counties.find(c2 => c2.name === data.county);
        if (matched) {
          setLocation(l => ({ ...l, countyId: matched.id, county: data.county }));
          if (data.subCounty) setSubCounties([data.subCounty]);
        }
        setSchoolAutoFilled(true);
        setKnecStatus('found');
      } else {
        setSchoolAutoFilled(false);
        setKnecStatus('notfound');
      }
    } catch {
      setKnecStatus('notfound');
    }
  };

  const nextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (schoolLevels.length === 0) { toast.error('Select which school level(s) you run'); return; }
    if (!ownership) { toast.error('Select whether the school is public or private'); return; }
    setStep(2);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.county) { toast.error('Please select your county'); return; }

    setLoading(true);
    try {
      const { data } = await apiClient.post('/auth/upgrade-to-school', {
        ...form, ...location, schoolLevels, ownership,
      });
      // The upgrade changes the user's role, which is baked into the JWT — swap in
      // the re-issued pair before navigating, or the school UI stays locked.
      localStorage.setItem('zaroda_token',   data.accessToken);
      localStorage.setItem('zaroda_refresh', data.refreshToken);
      await refreshUser();
      toast.success('School account created! Welcome to ZARODA.');
      router.replace('/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not set up your school account');
      setLoading(false);
    }
  };

  if (!hydrated || !user) return null;

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-black text-theme-heading">Set up a school account</h1>
        <p className="text-sm text-theme-muted mt-1">
          Add your school to the account you already use. You keep the same login, and all of
          your Professional Records work stays exactly where it is.
        </p>
      </div>

      <div className="flex items-start gap-2 p-3 bg-[#f4f6fb] rounded-xl mb-5">
        <ShieldCheck size={16} className="text-[#1a2e5a] flex-shrink-0 mt-0.5"/>
        <p className="text-xs text-[#1a2e5a]">
          Signed in as <b>{user.email}</b> — this address stays your login. The school’s free
          period starts once the school is set up.
        </p>
      </div>

      <div className="card p-6">
        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-6">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all
                ${step >= s ? 'bg-[#1a2e5a] text-white' : 'bg-[#f4f6fb] text-[#7a82a8]'}`}>
                {s}
              </div>
              {s < 2 && <div className={`flex-1 h-0.5 transition-all ${step > s ? 'bg-[#1a2e5a]' : 'bg-[#e2e6f0]'}`}/>}
              <span className={`text-xs font-medium flex-shrink-0 ${step === s ? 'text-[#1a2e5a]' : 'text-[#7a82a8]'}`}>
                {s === 1 ? 'School Details' : 'Location'}
              </span>
            </div>
          ))}
        </div>

        {/* ── STEP 1: School details ── */}
        {step === 1 && (
          <form onSubmit={nextStep} className="space-y-3">
            <div>
              <label className="label">School KNEC Code *</label>
              <div className="relative">
                <input required value={form.knecCode}
                  onChange={e => { setForm(f => ({ ...f, knecCode: e.target.value })); setKnecStatus('idle'); setSchoolAutoFilled(false); }}
                  onBlur={e => lookupKnec(e.target.value)}
                  placeholder="e.g. 44736226" className="input pr-24"/>
                <button type="button" onClick={() => lookupKnec(form.knecCode)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-white bg-[#1a2e5a] px-2.5 py-1.5 rounded-lg hover:bg-[#142347]">
                  {knecStatus === 'searching' ? 'Checking…' : 'Look up'}
                </button>
              </div>
              {knecStatus === 'found' && (
                <p className="text-xs text-green-600 mt-1">✓ School found — details filled in below</p>
              )}
              {knecStatus === 'notfound' && (
                <p className="text-xs text-amber-600 mt-1">Code not in registry — you can still enter the school name manually</p>
              )}
            </div>
            <div>
              <label className="label">School Name *</label>
              <input required value={form.schoolName} onChange={set('schoolName')}
                placeholder="Starlight Primary School"
                className={`input ${schoolAutoFilled ? 'bg-green-50 border-green-200 text-[#1a2e5a]' : ''}`}/>
            </div>
            <div>
              <label className="label">School Level(s) *</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'primary_js', label: 'Primary / Junior School' },
                  { key: 'senior',     label: 'Senior School' },
                ].map(l => (
                  <button key={l.key} type="button" onClick={() => toggleLevel(l.key)}
                    className={`text-left text-xs px-3 py-2.5 rounded-xl border transition-all
                      ${schoolLevels.includes(l.key)
                        ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]'
                        : 'bg-white text-[#1a2e5a] border-[#e2e6f0] hover:border-[#1a2e5a]'}`}>
                    {schoolLevels.includes(l.key) && <span className="mr-1">✓</span>}{l.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#7a82a8] mt-1">Select both if your school runs both bands.</p>
            </div>
            <div>
              <label className="label">School Type *</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'public',  label: 'Public School' },
                  { key: 'private', label: 'Private School' },
                ].map(o => (
                  <button key={o.key} type="button" onClick={() => setOwnership(o.key as 'public'|'private')}
                    className={`text-left text-xs px-3 py-2.5 rounded-xl border transition-all
                      ${ownership === o.key
                        ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]'
                        : 'bg-white text-[#1a2e5a] border-[#e2e6f0] hover:border-[#1a2e5a]'}`}>
                    {ownership === o.key && <span className="mr-1">✓</span>}{o.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#7a82a8] mt-1">Private schools can later add a non-teaching School Owner account.</p>
            </div>
            <div>
              <label className="label">School Phone</label>
              <input type="tel" value={form.phone} onChange={set('phone')}
                placeholder="+254 700 000 000" className="input"/>
            </div>
            <button type="submit" className="btn-primary w-full justify-center mt-2">
              Next: Location <ChevronRight size={16}/>
            </button>
          </form>
        )}

        {/* ── STEP 2: Location ── */}
        {step === 2 && (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-[#f4f6fb] rounded-xl mb-2">
              <MapPin size={16} className="text-[#1a2e5a] flex-shrink-0"/>
              <div>
                <p className="text-sm font-semibold text-[#1a2e5a]">School Location</p>
                <p className="text-xs text-[#7a82a8]">Helps us serve you better in your area</p>
              </div>
            </div>

            <div>
              <label className="label">County *</label>
              <select required value={location.countyId} onChange={onCountyChange} className="input">
                <option value="">— Select county —</option>
                {counties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Sub-County *</label>
              {subCounties.length > 0 ? (
                <select required value={location.subCounty}
                  onChange={e => setLocation(l => ({ ...l, subCounty: e.target.value, subCountyId: e.target.value }))}
                  className="input">
                  <option value="">— Select sub-county —</option>
                  {subCounties.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <input value={location.subCounty}
                  onChange={e => setLocation(l => ({ ...l, subCounty: e.target.value }))}
                  placeholder={location.countyId ? 'Type your sub-county' : 'Select county first'}
                  disabled={!location.countyId} className="input" required/>
              )}
            </div>

            <div>
              <label className="label">Zone / School Zone</label>
              <input value={location.zone}
                onChange={e => setLocation(l => ({ ...l, zone: e.target.value }))}
                placeholder="e.g. Westlands Zone A (optional)" className="input"/>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setStep(1)} className="btn-ghost flex-1 justify-center">
                ← Back
              </button>
              <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
                {loading
                  ? <><Loader2 size={15} className="animate-spin"/> Setting up…</>
                  : 'Set up school account →'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
