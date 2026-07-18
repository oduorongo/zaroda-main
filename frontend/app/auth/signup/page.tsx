'use client';
import { useState, useEffect } from 'react';
import { useRouter }           from 'next/navigation';
import Link                    from 'next/link';
import { Loader2, MapPin, ChevronRight, Eye, EyeOff } from 'lucide-react';
import toast                   from 'react-hot-toast';

// Backend API base — signup runs before login so it can't use the authed client,
// but it MUST hit the backend origin (not the frontend), so use the same base URL.
const API = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/v1`;

// ── All 47 Kenya counties hardcoded as fallback ─────────────
// API is always tried first; this ensures the form ALWAYS works
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

// Sub-counties for most-common selection (Nairobi) as fallback
const NAIROBI_SUB_COUNTIES = [
  'Westlands','Dagoretti North','Dagoretti South','Langata','Kibra',
  'Roysambu','Kasarani','Ruaraka','Embakasi South','Embakasi North',
  'Embakasi Central','Embakasi East','Embakasi West','Makadara','Kamukunji',
  'Starehe','Mathare',
];

export default function SignupPage() {
  const router  = useRouter();
  const [step,     setStep]    = useState(1);
  const [loading,  setLoading] = useState(false);
  const [show,     setShow]    = useState(false);

  // Form state
  const [form, setForm] = useState({
    knecCode: '', schoolName: '', adminFirstName: '', adminLastName: '',
    email: '', password: '', confirmPassword: '', phone: '',
  });

  // Which bands this school runs — drives whether senior-school pathway/elective
  // features (and the reverse: primary/JS learning areas) show up later, so schools
  // running only one band don't see the other's setup screens.
  const [schoolLevels, setSchoolLevels] = useState<string[]>([]);
  const toggleLevel = (lvl: string) =>
    setSchoolLevels(cur => cur.includes(lvl) ? cur.filter(x => x !== lvl) : [...cur, lvl]);

  // KNEC lookup state
  const [knecStatus, setKnecStatus] = useState<'idle'|'searching'|'found'|'notfound'>('idle');
  const [schoolAutoFilled, setSchoolAutoFilled] = useState(false);

  // Location state
  const [counties,    setCounties]    = useState<{id:string;name:string}[]>(KE_COUNTIES);
  const [subCounties, setSubCounties] = useState<string[]>([]);
  const [location,    setLocation]    = useState({
    countyId: '', county: '', subCountyId: '', subCounty: '', zone: '',
  });

  // Try loading counties from API — fallback to hardcoded list if API fails
  useEffect(() => {
    fetch(`${API}/location/counties`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setCounties(data.map((c: any) => ({ id: String(c.id), name: c.name })));
        }
        // If API fails or returns empty, KE_COUNTIES fallback stays active
      })
      .catch(() => {/* keep fallback */});
  }, []);

  // Load sub-counties when county changes
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
        if (Array.isArray(data) && data.length > 0) {
          setSubCounties(data.map((s: any) => s.name));
          return;
        }
      }
    } catch {}

    // Fallback — basic sub-counties for common counties
    const FALLBACKS: Record<string, string[]> = {
      'Nairobi':    NAIROBI_SUB_COUNTIES,
      'Mombasa':    ['Changamwe','Jomvu','Kisauni','Likoni','Mvita','Nyali'],
      'Kisumu':     ['Kisumu Central','Kisumu East','Kisumu West','Muhoroni','Nyakach','Nyando','Seme'],
      'Nakuru':     ['Bahati','Gilgil','Kuresoi North','Kuresoi South','Molo','Naivasha','Nakuru Town East','Nakuru Town West','Njoro','Rongai','Subukia'],
      'Kiambu':     ['Gatundu North','Gatundu South','Githunguri','Juja','Kabete','Kiambaa','Kiambu','Kikuyu','Lari','Limuru','Ruiru','Thika Town'],
      'Machakos':   ['Kathiani','Machakos Town','Masinga','Matungulu','Mavoko','Mwala','Yatta'],
      'Uasin Gishu':['Ainabkoi','Kapseret','Kesses','Moiben','Soy','Turbo'],
      'Kakamega':   ['Butere','Ikolomani','Khwisero','Likuyani','Lugari','Lurambi','Malava','Matungu','Mumias East','Mumias West','Navakholo','Shinyalu'],
      'Meru':       ['Buuri','Igembe Central','Igembe North','Igembe South','Imenti Central','Imenti North','Imenti South','Tigania East','Tigania West'],
    };
    setSubCounties(FALLBACKS[name] || []);
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Look up the school by KNEC code and auto-fill details
  const lookupKnec = async (code: string) => {
    const c = code.trim();
    if (c.length < 4) { setKnecStatus('idle'); return; }
    setKnecStatus('searching');
    try {
      const res = await fetch(`${API}/location/schools/${encodeURIComponent(c)}`);
      const data = res.ok ? await res.json() : null;
      if (data && data.found) {
        // Auto-fill school name and location
        setForm(f => ({ ...f, schoolName: data.name || f.schoolName }));
        setLocation(l => ({
          ...l,
          county:    data.county    || l.county,
          subCounty: data.subCounty || l.subCounty,
          zone:      data.zone      || l.zone,
        }));
        // Match county into the dropdown if present
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
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match'); return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters'); return;
    }
    if (schoolLevels.length === 0) {
      toast.error('Select which school level(s) you run'); return;
    }
    setStep(2);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.county) { toast.error('Please select your county'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/signup`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, ...location, schoolLevels }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || 'Signup failed');
        setLoading(false);
        return;
      }

      // Save tokens
      localStorage.setItem('zaroda_token',   data.accessToken);
      localStorage.setItem('zaroda_refresh', data.refreshToken);
      localStorage.setItem('zaroda_user',    JSON.stringify(data.user));

      toast.success('School account created! Welcome to ZARODA.');
      router.push('/dashboard');
    } catch (err) {
      toast.error('Could not connect to server. Make sure the backend is running.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="text-center mb-6">
        <img src="/zaroda-logo.png" alt="ZARODA" className="inline-block w-14 h-14 rounded-xl object-cover mb-3"/>
        <div className="text-white font-black text-sm leading-tight">ZARODA SCHOOL</div>
        <div className="text-[#fdba74] font-black text-sm leading-tight mb-2">MANAGEMENT SYSTEM</div>
        <h1 className="text-xl font-black text-white">Free for all of 2026 🎉</h1>
        <p className="text-white/40 text-xs mt-1">No card required · Subscription begins 15 January 2027</p>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-modal">

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
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">✓ School found — details filled in below</p>
              )}
              {knecStatus === 'notfound' && (
                <p className="text-xs text-amber-600 mt-1">Code not in registry — you can still enter the school name manually</p>
              )}
              <p className="text-xs text-[#7a82a8] mt-1">Your unique school identifier. Enter it to auto-fill your school details.</p>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First Name *</label>
                <input required value={form.adminFirstName} onChange={set('adminFirstName')}
                  placeholder="John" className="input"/>
              </div>
              <div>
                <label className="label">Last Name *</label>
                <input required value={form.adminLastName} onChange={set('adminLastName')}
                  placeholder="Kamau" className="input"/>
              </div>
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" required value={form.email} onChange={set('email')}
                placeholder="principal@school.ac.ke" className="input"/>
            </div>
            <div>
              <label className="label">Phone</label>
              <input type="tel" value={form.phone} onChange={set('phone')}
                placeholder="+254 700 000 000" className="input"/>
            </div>
            <div>
              <label className="label">Password *</label>
              <div className="relative">
                <input type={show ? 'text' : 'password'} required value={form.password}
                  onChange={set('password')} placeholder="At least 8 characters" className="input pr-10"/>
                <button type="button" onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a82a8] hover:text-[#1a2e5a]">
                  {show ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Confirm Password *</label>
              <input type="password" required value={form.confirmPassword}
                onChange={set('confirmPassword')} placeholder="Repeat password" className="input"/>
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

            {/* County */}
            <div>
              <label className="label">County *</label>
              <select required value={location.countyId} onChange={onCountyChange} className="input">
                <option value="">— Select county —</option>
                {counties.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Sub-county */}
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
                  disabled={!location.countyId}
                  className="input" required/>
              )}
            </div>

            {/* Zone */}
            <div>
              <label className="label">Zone / School Zone</label>
              <input value={location.zone}
                onChange={e => setLocation(l => ({ ...l, zone: e.target.value }))}
                placeholder="e.g. Westlands Zone A (optional)"
                className="input"/>
              <p className="text-xs text-[#7a82a8] mt-1">Your school's zonal area for inter-school activities</p>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setStep(1)} className="btn-ghost flex-1 justify-center">
                ← Back
              </button>
              <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
                {loading
                  ? <><Loader2 size={15} className="animate-spin"/> Creating…</>
                  : 'Create Account →'}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-xs text-[#7a82a8] mt-4">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-[#1a2e5a] font-semibold hover:underline">Sign in</Link>
        </p>
      </div>

      <p className="text-center mt-4 text-white/30 text-xs">
        Need help?{' '}
        <a href="https://wa.me/254781230805" target="_blank" rel="noopener noreferrer"
          className="text-[#d4af37] hover:underline">
          WhatsApp +254 781 230 805
        </a>
      </p>
    </div>
  );
}
