import React, { useState, useMemo, useEffect } from 'react';
import { useAccessRole } from '@/components/AccessGate';
import { listUsers } from '@/lib/access';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, ComposedChart
} from 'recharts';
import { LayoutDashboard, Table, Plus, Search, CheckCircle2, TrendingUp, AlertCircle, BarChart2, Activity, Trash2, Save, X, Database, Loader2 } from 'lucide-react';
import { usePipelineProjects } from '@/lib/pipeline';

// ============================================================================
// TYPES
// ============================================================================
type Project = {
  id: string;
  name: string;
  contractDate?: string;
  product?: string;
  brand: string;
  units: number;
  floors?: number;
  contractDuration?: number;
  location?: string;
  currency?: string;
  kleemannValue?: number;
  hitachiValue?: number;
  value: number;
  revenue?: number;
  tranche1?: number;
  deliveryMonth?: string;
  probability?: number;
  comment?: string;
  quarter: string;
  manager: string;
  statusDetail?: string;
  status: string;
  registrationDate?: string;
  statusHistory?: {status: string, date: string}[];
};

// ============================================================================
// MOCK DATA (Forma 505 / Database)
// ============================================================================

// მენეჯერის შესაბამისობა: სახელის ნებისმიერი სიტყვა (≥3 ასო) — „კვარაცხელია თ." ემთხვევა
// „თემურ კვარაცხელია"-ს. ადრე მხოლოდ პირველი სიტყვით მოწმდებოდა და ახალი ფორმატი ცდებოდა.
function managerMatches(manager: string | undefined, rep: string): boolean {
  if (!manager) return false;
  const tokens = rep.replace(/\./g, ' ').split(/\s+/).filter((t) => t.length >= 3);
  return tokens.some((t) => manager.includes(t));
}

function enrichProjectsWithHistory(projects: Project[]) {
  return projects.map((p, i) => {
    if (p.statusHistory) return p;
    const history = [];
    const now = new Date();
    // Use index 'i' to seed a deterministic pseudo-random so it doesn't jump on every render
    const pseudoRand = (seed: number) => {
      let x = Math.sin(seed + 1) * 10000;
      return x - Math.floor(x);
    };
    
    const randDays = (step: number) => Math.floor(pseudoRand(i * 10 + step) * 50) + 5;
    
    let currDate = new Date(now);
    currDate.setDate(currDate.getDate() - (randDays(1) + randDays(2) + randDays(3)));
    
    history.push({ status: "რეგისტრირებული", date: new Date(currDate).toISOString() });
    
    if (p.status === "დაკონტრაქტებული") {
      currDate.setDate(currDate.getDate() + randDays(1));
      history.push({ status: "პროექტის დამუშავება", date: new Date(currDate).toISOString() });
      currDate.setDate(currDate.getDate() + randDays(2));
      history.push({ status: "მოლაპარაკება", date: new Date(currDate).toISOString() });
      currDate.setDate(currDate.getDate() + randDays(3));
      history.push({ status: "დაკონტრაქტებული", date: new Date(currDate).toISOString() });
    } else if (p.status.includes("60%+")) {
      currDate.setDate(currDate.getDate() + randDays(1));
      history.push({ status: "პროექტის დამუშავება", date: new Date(currDate).toISOString() });
      currDate.setDate(currDate.getDate() + randDays(2));
      history.push({ status: p.status, date: new Date(currDate).toISOString() });
    } else {
      currDate.setDate(currDate.getDate() + randDays(1));
      history.push({ status: p.status, date: new Date(currDate).toISOString() });
    }
    
    return { ...p, statusHistory: history, registrationDate: history[0].date };
  });
}
// ============================================================================
// FORMATTERS
// ============================================================================
const formatUsd = (num: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
const formatPct = (val: number, total?: number) => {
  const ratio = total === undefined ? val : (total > 0 ? val / total : 0);
  if (!isFinite(ratio)) return '0.0%';
  return (ratio * 100).toFixed(1) + '%';
};

// ============================================================================
// MODAL COMPONENT
// ============================================================================
function ProjectModal({ isOpen, onClose, onSave, initialData, managerOptions = [] }: any) {
  const [formData, setFormData] = useState<any>(initialData || {});

  if (!isOpen) return null;

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    const updatedForm = { ...formData, [name]: value };
    // Simple logic for brand total
    if (updatedForm.brand === 'KLEEMANN') {
      updatedForm.kleemannValue = updatedForm.value;
      updatedForm.hitachiValue = 0;
    } else if (updatedForm.brand === 'HITACHI') {
      updatedForm.hitachiValue = updatedForm.value;
      updatedForm.kleemannValue = 0;
    }
    setFormData(updatedForm);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-xl font-semibold text-gray-800">
            {initialData?.id ? 'რედაქტირება' : 'ახალი პროექტი'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <form className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">დასახელება</label>
              <input type="text" className="w-full border p-2 rounded text-sm" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">სტატუსი</label>
              <select className="w-full border p-2 rounded text-sm" value={formData.status || ''} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option value="დაკონტრაქტებული">დაკონტრაქტებული</option>
                <option value="პოტ. 60%+">პოტ. 60%+</option>
                <option value="პოტ. 60%-">პოტ. 60%-</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">კვარტალი</label>
              <select className="w-full border p-2 rounded text-sm" value={formData.quarter || ''} onChange={e => setFormData({...formData, quarter: e.target.value})}>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">მენეჯერი</label>
              <select className="w-full border p-2 rounded text-sm" value={formData.manager || ''} onChange={e => setFormData({...formData, manager: e.target.value})}>
                {(managerOptions as string[]).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">ბრენდი</label>
              <input type="text" className="w-full border p-2 rounded text-sm" value={formData.brand || ''} onChange={e => setFormData({...formData, brand: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">ღირებულება (USD)</label>
              <input type="number" className="w-full border p-2 rounded text-sm" value={formData.value || 0} onChange={e => setFormData({...formData, value: Number(e.target.value)})} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">შემოსავალი (USD)</label>
              <input type="number" className="w-full border p-2 rounded text-sm" value={formData.revenue || 0} onChange={e => setFormData({...formData, revenue: Number(e.target.value)})} />
            </div>
          </form>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            გაუქმება
          </button>
          <button onClick={() => onSave(formData)} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-2">
            <Save className="w-4 h-4" /> შენახვა
          </button>
        </div>
      </div>
    </div>
  );
}

export function PipelineSheet() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'dashboard2' | 'forma505'>('dashboard');
  const [filterYear, setFilterYear] = useState<string>('2026');
  const [filterQuarter, setFilterQuarter] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const { projects: rawProjects, setProjects, loading } = usePipelineProjects();
  const { isFull } = useAccessRole();
  // მენეჯერები: არსებული ჩანაწერებიდან + „გაყიდვები" როლის მომხმარებლები (app_users)
  const [salesNames, setSalesNames] = useState<string[]>([]);
  useEffect(() => {
    listUsers().then((us) => setSalesNames(us.filter((u) => u.role === 'sales').map((u) => u.name))).catch(() => {});
  }, []);
  const managerOptions = useMemo(() => {
    const fromData = (rawProjects as any[]).map((p) => p.manager).filter(Boolean) as string[];
    const extra = salesNames.filter((n) => !fromData.some((m) => managerMatches(m, n)));
    return Array.from(new Set([...fromData, ...extra])).sort((a, b) => a.localeCompare(b));
  }, [rawProjects, salesNames]);
  const projects = useMemo(() => enrichProjectsWithHistory(rawProjects as Project[]), [rawProjects]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [formaSearch, setFormaSearch] = useState('');
  const [formaFilterManager, setFormaFilterManager] = useState('all');
  const [formaFilterQuarter, setFormaFilterQuarter] = useState('all');
  const [formaFilterStatus, setFormaFilterStatus] = useState('all');

  const filteredFormaProjects = useMemo(() => {
    return projects.filter(proj => {
      let match = true;
      if (formaFilterManager !== 'all' && proj.manager !== formaFilterManager) match = false;
      if (formaFilterQuarter !== 'all' && proj.quarter !== formaFilterQuarter) match = false;
      if (formaFilterStatus !== 'all' && proj.status !== formaFilterStatus) match = false;
      if (formaSearch.trim() !== '') {
        const lowerSearch = formaSearch.toLowerCase();
        const searchString = `${proj.name} ${proj.location} ${proj.comment} ${proj.brand} ${proj.product}`.toLowerCase();
        if (!searchString.includes(lowerSearch)) match = false;
      }
      return match;
    });
  }, [projects, formaSearch, formaFilterManager, formaFilterQuarter, formaFilterStatus]);

  const removeRow = (id: string) => {
    if(window.confirm('ნამდვილად გსურთ წაშლა?')) {
      setProjects(projects.filter(p => p.id !== id));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> იტვირთება…
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-[#f8f9fc] text-slate-900 flex flex-col font-sans rounded-xl border border-slate-200 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-blue-700 font-bold text-lg tracking-tight">
            <Activity className="w-5 h-5" />
            <span>ApexStats</span>
          </div>
          <div className="h-8 flex bg-slate-100/80 rounded-lg p-1 border border-slate-200/60">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md flex items-center gap-2 transition-all ${activeTab === 'dashboard' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> დაშბორდი 1
            </button>
            <button 
              onClick={() => setActiveTab('dashboard2')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md flex items-center gap-2 transition-all ${activeTab === 'dashboard2' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <BarChart2 className="w-3.5 h-3.5" /> დაშბორდი 2 (Funnel)
            </button>
            <button 
              onClick={() => setActiveTab('forma505')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md flex items-center gap-2 transition-all ${activeTab === 'forma505' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Table className="w-3.5 h-3.5" /> ფორმა 505 (ბაზა)
            </button>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-200 px-3 py-1 text-[10px] uppercase font-bold tracking-wide text-emerald-700 shadow-sm">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            {projects.length} Records Loaded
          </div>
        </div>
      </header>

      {/* DYNAMIC CONTENT AREA */}
      {activeTab === 'dashboard' ? (
        <main className="flex-1 overflow-auto bg-[#f8f9fc] p-6 lg:p-8 text-gray-800">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* FILTERS */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-wrap gap-4 items-end justify-between">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">წელი</label>
                <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 hover:bg-white focus:border-slate-300 transition-colors outline-none cursor-pointer text-slate-700 font-medium">
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">კვარტალი</label>
                <select value={filterQuarter} onChange={e => setFilterQuarter(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 hover:bg-white focus:border-slate-300 transition-colors outline-none cursor-pointer text-slate-700 font-medium">
                  <option value="all">ყველა</option>
                  <option value="Q1">Q1</option>
                  <option value="Q2">Q2</option>
                  <option value="Q3">Q3</option>
                  <option value="Q4">Q4</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">თვე</label>
                <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 hover:bg-white focus:border-slate-300 transition-colors outline-none cursor-pointer text-slate-700 font-medium">
                  <option value="all">ყველა</option>
                  <option value="01">იანვარი</option>
                  <option value="02">თებერვალი</option>
                  <option value="03">მარტი</option>
                  <option value="04">აპრილი</option>
                  <option value="05">მაისი</option>
                  <option value="06">ივნისი</option>
                  <option value="07">ივლისი</option>
                  <option value="08">აგვისტო</option>
                  <option value="09">სექტემბერი</option>
                  <option value="10">ოქტომბერი</option>
                  <option value="11">ნოემბერი</option>
                  <option value="12">დეკემბერი</option>
                </select>
              </div>
            </div>

            {(() => {
              // Filtering Logic
              let dashProjects = projects.filter(p => {
                let match = true;
                // Basic year logic: if no contractDate, assume 2024 for mock data
                let y = '2024';
                let m = 'all';
                if(p.contractDate) {
                  y = p.contractDate.substring(0, 4);
                  m = p.contractDate.substring(5, 7);
                }
                
                if (filterYear !== 'all' && y !== filterYear) match = false;
                if (filterMonth !== 'all' && m !== filterMonth) match = false;
                if (filterQuarter !== 'all' && p.quarter !== filterQuarter) match = false;
                
                return match;
              });

              // Also we need annual projects for the tables which are mostly YTD/Quarterly static
              // For demonstration, we use all projects as the annual dataset
              const annualProjects = projects;

              // Top KPIs
              const totalRevenue = dashProjects.filter(p => p.status === 'დაკონტრაქტებული').reduce((sum, p) => sum + (p.revenue || 0), 0);
              const targetRevenue = 560000;
              const revenuePct = totalRevenue / targetRevenue;

              const totalKleemann = dashProjects.filter(p => p.status === 'დაკონტრაქტებული').reduce((sum, p) => sum + (p.kleemannValue || 0), 0);
              const targetKleemann = 1040000;
              const kleemannPct = totalKleemann / targetKleemann;

              const totalPot60Plus = dashProjects.filter(p => p.status === 'პოტ. 60%+').reduce((sum, p) => sum + (p.revenue || 0), 0);
              
              const formatDol = (num: number) => num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
              const formatCol = (val: number) => <span className={val >= 0 ? "text-emerald-600 font-medium" : "text-rose-500 font-medium"}>{val > 0 ? '+' : ''}{formatDol(val)}</span>;
              const formatColPct = (val: number) => <span className={val >= 1 ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>{formatPct(val)}</span>;

              // Trend data for charts
              const trendData = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
                 let fact = Math.round(annualProjects.filter(p => p.quarter === q && p.status === 'დაკონტრაქტებული').reduce((s, p) => s + (p.revenue || 0), 0));
                 let kleeFact = Math.round(annualProjects.filter(p => p.quarter === q && p.status === 'დაკონტრაქტებული').reduce((s, p) => s + (p.kleemannValue || 0), 0));
                 return { name: q, 'საერთო ფაქტი': fact, 'კლემანი ფაქტი': kleeFact, 'საერთო გეგმა': 140000, 'კლემანი გეგმა': 260000 };
              });
              
              // Accumulate trend data
              let cFact = 0, cKlee = 0, cPlan = 0, cPlanKlee = 0;
              const cumulTrendData = trendData.map(d => {
                cFact += d['საერთო ფაქტი'];
                cKlee += d['კლემანი ფაქტი'];
                cPlan += d['საერთო გეგმა'];
                cPlanKlee += d['კლემანი გეგმა'];
                return {
                  name: d.name,
                  'YTD ფაქტი (საერთო)': cFact,
                  'YTD გეგმა (საერთო)': cPlan,
                  'YTD ფაქტი (კლემანი)': cKlee,
                  'YTD გეგმა (კლემანი)': cPlanKlee
                }
              });

              const reps = managerOptions;
              const repAnnualTotal = 140000;
              const repKleemannTotal = 260000;
              
              const isQActive = (qIndex: number) => {
                if (filterQuarter !== 'all') return filterQuarter === `Q${qIndex}`;
                return true;
              }

              return (
                <div className="space-y-6">
                  {/* KPI CARDS */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-6 flex flex-col relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp className="w-16 h-16 text-slate-500" /></div>
                      <h3 className="text-slate-500 font-medium mb-1">ჯამური ფაქტი (საერთო)</h3>
                      <div className="text-3xl font-bold text-slate-800 tracking-tight mb-2">{formatUsd(totalRevenue)}</div>
                      <div className="flex items-center gap-2 mt-auto">
                        <span className="text-sm font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-600">{formatPct(revenuePct, 1)}</span>
                        <span className="text-xs text-slate-400">გეგმა: {formatUsd(targetRevenue)}</span>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-6 flex flex-col relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10"><Activity className="w-16 h-16 text-slate-500" /></div>
                      <h3 className="text-slate-500 font-medium mb-1">KLEEMANN ფაქტი</h3>
                      <div className="text-3xl font-bold text-slate-800 tracking-tight mb-2">{formatUsd(totalKleemann)}</div>
                      <div className="flex items-center gap-2 mt-auto">
                        <span className="text-sm font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-600">{formatPct(kleemannPct, 1)}</span>
                        <span className="text-xs text-slate-400">გეგმა: {formatUsd(targetKleemann)}</span>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-6 flex flex-col relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10"><AlertCircle className="w-16 h-16 text-amber-500" /></div>
                      <h3 className="text-slate-500 font-medium mb-1">პოტ. 60%+ (საერთო)</h3>
                      <div className="text-3xl font-bold text-amber-500 tracking-tight mb-2">{formatUsd(totalPot60Plus)}</div>
                      <div className="mt-auto flex items-center gap-2">
                        <span className="text-xs text-slate-400">მოსალოდნელი კონტრაქტები</span>
                      </div>
                    </div>
                  </div>

                  {/* CHARTS SECTION */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-sm">
                      <h3 className="text-slate-900 font-bold mb-6 tracking-tight">შესრულების დინამიკა (საერთო)</h3>
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                            <YAxis tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(v) => `$${v/1000}k`} tickLine={false} axisLine={false} />
                            <Tooltip formatter={(value: any) => formatDol(value as number)} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                            <Legend wrapperStyle={{fontSize: '12px'}} />
                            <Bar dataKey="საერთო ფაქტი" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                            <Line type="monotone" dataKey="საერთო გეგმა" stroke="#94a3b8" strokeWidth={3} dot={{r: 4, fill: '#94a3b8'}} strokeDasharray="5 5" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-sm">
                      <h3 className="text-slate-900 font-bold mb-6 tracking-tight">ნაზარდი შესრულება (YTD - საერთო)</h3>
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={cumulTrendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                            <YAxis tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(v) => `$${v/1000}k`} tickLine={false} axisLine={false} />
                            <Tooltip formatter={(value: any) => formatDol(value as number)} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                            <Legend wrapperStyle={{fontSize: '12px'}} />
                            <Line type="monotone" dataKey="YTD გეგმა (საერთო)" stroke="#94a3b8" strokeWidth={3} strokeDasharray="5 5" dot={false} />
                            <Line type="monotone" dataKey="YTD ფაქტი (საერთო)" stroke="#0ea5e9" strokeWidth={4} dot={{r: 6, fill: '#0ea5e9', strokeWidth: 2, stroke: '#fff'}} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* TABLES SECTION */}
                  <div className="space-y-6">
                    
                    {/* Reps Quarterly/YTD Breakdown */}
                    <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-sm">
                      <h3 className="bg-white px-6 py-5 font-bold text-base border-b border-slate-100 text-slate-800 tracking-tight">აგენტების დეტალური შესრულება (კვარტალური და YTD)</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead className="bg-slate-50/80 text-slate-500 text-xs tracking-wider border-b border-slate-200 uppercase font-semibold">
                            <tr>
                              <th className="px-4 py-3 font-medium">აგენტი</th>
                              <th className="px-4 py-3 font-medium text-center " colSpan={3}>Q1 (საერთო)</th>
                              <th className="px-4 py-3 font-medium text-center " colSpan={3}>Q2 (საერთო)</th>
                              <th className="px-4 py-3 font-medium text-center " colSpan={3}>Q3 (საერთო)</th>
                              <th className="px-4 py-3 font-medium text-center " colSpan={3}>Q4 (საერთო)</th>
                              <th className="px-4 py-3 font-medium text-center " colSpan={3}>YTD ნაზარდი (საერთო)</th>
                            </tr>
                            <tr className="text-xs text-slate-500">
                              <th className="px-4 py-1 "></th>
                              {/* Q1 */}
                              <th className="px-2 py-1 ">გეგმა</th><th className="px-2 py-1 ">ფაქტი</th><th className="px-2 py-1  ">%</th>
                              {/* Q2 */}
                              <th className="px-2 py-1">გეგმა</th><th className="px-2 py-1">ფაქტი</th><th className="px-2 py-1 ">%</th>
                              {/* Q3 */}
                              <th className="px-2 py-1 ">გეგმა</th><th className="px-2 py-1 ">ფაქტი</th><th className="px-2 py-1  ">%</th>
                              {/* Q4 */}
                              <th className="px-2 py-1">გეგმა</th><th className="px-2 py-1">ფაქტი</th><th className="px-2 py-1 ">%</th>
                              {/* YTD */}
                              <th className="px-2 py-1 ">გეგმა</th><th className="px-2 py-1 ">ფაქტი</th><th className="px-2 py-1 ">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reps.map(rep => {
                              const qPlan = repAnnualTotal / 4;
                              let cPlan = 0;
                              let cFact = 0;
                              return (
                                <tr key={rep} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-xs">
                                  <td className="px-4 py-2 font-medium text-slate-800 border-r">{rep}</td>
                                  {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => {
                                    const fact = Math.round(annualProjects.filter(p => p.quarter === q && p.status === 'დაკონტრაქტებული' && managerMatches(p.manager, rep)).reduce((s,p) => s+(p.revenue||0), 0));
                                    if (isQActive(i + 1)) {
                                      cPlan += qPlan;
                                    }
                                    cFact += fact;
                                    const bg = i % 2 === 0 ? 'bg-slate-50/50' : '';
                                    return (
                                      <React.Fragment key={q}>
                                        <td className={`px-2 py-2 text-right text-slate-600 ${bg}`}>{formatDol(qPlan)}</td>
                                        <td className={`px-2 py-2 text-right font-mono text-emerald-600 ${bg}`}>{formatDol(fact)}</td>
                                        <td className={`px-2 py-2 text-right font-mono border-r border-slate-200/50 ${bg}`}>{formatColPct(fact/qPlan)}</td>
                                      </React.Fragment>
                                    );
                                  })}
                                  <td className="px-2 py-2 text-right text-slate-500 ">{formatDol(cPlan)}</td>
                                  <td className="px-2 py-2 text-right font-mono text-slate-500 font-bold ">{formatDol(cFact)}</td>
                                  <td className="px-2 py-2 text-right font-mono ">{formatColPct(cFact/cPlan)}</td>
                                </tr>
                              );
                            })}
                            <tr className="border-b-2 border-slate-200 bg-blue-100/50 transition-colors text-xs font-bold text-slate-900">
                                  <td className="px-4 py-2 border-r border-slate-200/50">ჯამი:</td>
                                  {(() => {
                                     let cPlanTot = 0;
                                     let cFactTot = 0;
                                     return (
                                       <React.Fragment>
                                         {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => {
                                           const qPlanSum = (repAnnualTotal / 4) * reps.length;
                                           const factSum = Math.round(annualProjects.filter(p => p.quarter === q && p.status === 'დაკონტრაქტებული' && reps.some(r => managerMatches(p.manager, r))).reduce((s,p) => s+(p.revenue||0), 0));
                                           if (isQActive(i + 1)) {
                                             cPlanTot += qPlanSum;
                                           }
                                           cFactTot += factSum;
                                           const bg = i % 2 === 0 ? 'bg-slate-50/50' : '';
                                           return (
                                             <React.Fragment key={q}>
                                               <td className={`px-2 py-2 text-right text-slate-600 ${bg}`}>{formatDol(qPlanSum)}</td>
                                               <td className={`px-2 py-2 text-right font-mono text-emerald-600 ${bg}`}>{formatDol(factSum)}</td>
                                               <td className={`px-2 py-2 text-right font-mono border-r border-slate-200/50 ${bg}`}>{formatColPct(factSum/qPlanSum)}</td>
                                             </React.Fragment>
                                           );
                                         })}
                                         <td className="px-2 py-2 text-right text-slate-800 ">{formatDol(cPlanTot)}</td>
                                         <td className="px-2 py-2 text-right font-mono text-slate-600 ">{formatDol(cFactTot)}</td>
                                         <td className="px-2 py-2 text-right font-mono ">{formatColPct(cFactTot/cPlanTot)}</td>
                                       </React.Fragment>
                                     )
                                  })()}
                                </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Quarterly Overalls */}
                    {(() => {
                      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
                      const qData = quarters.map((q) => {
                        const planTotal = 140000;
                        const planKleemann = 260000;
                        const factTotal = Math.round(annualProjects.filter(p => p.quarter === q && p.status === 'დაკონტრაქტებული').reduce((s, p) => s + (p.revenue || 0), 0));
                        const factKleemann = Math.round(annualProjects.filter(p => p.quarter === q && p.status === 'დაკონტრაქტებული').reduce((s, p) => s + (p.kleemannValue || 0), 0));
                        return { 
                          q, planTotal, planKleemann, factTotal, factKleemann,
                          devTotal: factTotal - planTotal, 
                          devKleemann: factKleemann - planKleemann, 
                          execTotal: planTotal ? factTotal/planTotal : 0, 
                          execKleemann: planKleemann ? factKleemann/planKleemann : 0 
                        };
                      });

                      let cumulPlanTotal = 0, cumulPlanKleemann = 0, cumulFactTotal = 0, cumulFactKleemann = 0;
                      const cumulData = qData.map((d, i) => {
                        if (isQActive(i + 1)) {
                          cumulPlanTotal += d.planTotal;
                          cumulPlanKleemann += d.planKleemann;
                        }
                        cumulFactTotal += d.factTotal;
                        cumulFactKleemann += d.factKleemann;
                        return {
                          q: d.q,
                          cumulPlanTotal, cumulPlanKleemann, cumulFactTotal, cumulFactKleemann,
                          devTotal: cumulFactTotal - cumulPlanTotal,
                          devKleemann: cumulFactKleemann - cumulPlanKleemann,
                          execTotal: cumulPlanTotal ? cumulFactTotal/cumulPlanTotal : 0,
                          execKleemann: cumulPlanKleemann ? cumulFactKleemann/cumulPlanKleemann : 0
                        };
                      });

                      return (
                        <>
                          <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-sm">
                            <h3 className="bg-white px-6 py-5 font-bold text-base border-b border-slate-100 text-slate-800 tracking-tight">ჯამური კვარტალური მონაცემები (გეგმა, ფაქტი, გადახრა)</h3>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50/80 text-slate-500 text-xs tracking-wider border-b border-slate-200 uppercase font-semibold">
                                  <tr>
                                    <th className="px-4 py-3 font-medium">კვარტალი</th>
                                    <th className="px-4 py-3 font-medium text-right">გეგმა (საერთო)</th>
                                    <th className="px-4 py-3 font-medium text-right">ხელმ. (საერთო)</th>
                                    <th className="px-4 py-3 font-medium text-right">გადახრა (საერთო)</th>
                                    <th className="px-4 py-3 font-medium text-right">შესრულება</th>
                                    
                                    <th className="px-4 py-3 font-medium text-right ">გეგმა (კლემანი)</th>
                                    <th className="px-4 py-3 font-medium text-right ">ხელმ. (კლემანი)</th>
                                    <th className="px-4 py-3 font-medium text-right ">გადახრა (კლემანი)</th>
                                    <th className="px-4 py-3 font-medium text-right ">შესრულება</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {qData.map((d) => (
                                    <tr key={d.q} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
                                      <td className="px-4 py-3 font-bold text-slate-800">{d.q}</td>
                                      <td className="px-4 py-3 text-right text-slate-500">{formatDol(d.planTotal)}</td>
                                      <td className="px-4 py-3 text-right font-mono text-emerald-600 font-medium">{formatDol(d.factTotal)}</td>
                                      <td className="px-4 py-3 text-right font-mono">{formatCol(d.devTotal)}</td>
                                      <td className="px-4 py-3 text-right font-mono">{formatColPct(d.execTotal)}</td>
                                      
                                      <td className="px-4 py-3 text-right text-slate-500 bg-slate-50/50">{formatDol(d.planKleemann)}</td>
                                      <td className="px-4 py-3 text-right font-mono text-emerald-600 font-medium bg-slate-50/50">{formatDol(d.factKleemann)}</td>
                                      <td className="px-4 py-3 text-right font-mono bg-slate-50/50">{formatCol(d.devKleemann)}</td>
                                      <td className="px-4 py-3 text-right font-mono bg-slate-50/50">{formatColPct(d.execKleemann)}</td>
                                    </tr>
                                  ))}
                                  {(() => {
                                      const totPlanT = qData.reduce((s, d) => s + d.planTotal, 0);
                                      const totFactT = qData.reduce((s, d) => s + d.factTotal, 0);
                                      const totPlanK = qData.reduce((s, d) => s + d.planKleemann, 0);
                                      const totFactK = qData.reduce((s, d) => s + d.factKleemann, 0);
                                      return (
                                        <tr className="bg-blue-100/50 border-t-2 border-slate-200 font-bold">
                                          <td className="px-4 py-3 text-slate-900">წლიური ჯამი</td>
                                          <td className="px-4 py-3 text-right text-slate-800">{formatDol(totPlanT)}</td>
                                          <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatDol(totFactT)}</td>
                                          <td className="px-4 py-3 text-right font-mono">{formatCol(totFactT - totPlanT)}</td>
                                          <td className="px-4 py-3 text-right font-mono">{formatColPct(totPlanT ? totFactT/totPlanT : 0)}</td>
                                          <td className="px-4 py-3 text-right text-slate-800 bg-slate-50/50">{formatDol(totPlanK)}</td>
                                          <td className="px-4 py-3 text-right font-mono text-emerald-600 bg-slate-50/50">{formatDol(totFactK)}</td>
                                          <td className="px-4 py-3 text-right font-mono bg-slate-50/50">{formatCol(totFactK - totPlanK)}</td>
                                          <td className="px-4 py-3 text-right font-mono bg-slate-50/50">{formatColPct(totPlanK ? totFactK/totPlanK : 0)}</td>
                                        </tr>
                                      )
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-sm">
                            <h3 className="bg-white px-6 py-5 font-bold text-base border-b border-slate-100 text-slate-800 tracking-tight">ნაზარდი ჯამები (YTD შესრულება და გადახრები)</h3>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50/80 text-slate-500 text-xs tracking-wider border-b border-slate-200 uppercase font-semibold">
                                  <tr>
                                    <th className="px-4 py-3 font-medium">YTD</th>
                                    <th className="px-4 py-3 font-medium text-right">YTD გეგმა (საერთო)</th>
                                    <th className="px-4 py-3 font-medium text-right">YTD ფაქტი (საერთო)</th>
                                    <th className="px-4 py-3 font-medium text-right">YTD გადახრა</th>
                                    <th className="px-4 py-3 font-medium text-right">YTD შესრულება</th>
                                    
                                    <th className="px-4 py-3 font-medium text-right ">YTD გეგმა (კლემანი)</th>
                                    <th className="px-4 py-3 font-medium text-right ">YTD ფაქტი (კლემანი)</th>
                                    <th className="px-4 py-3 font-medium text-right ">YTD გადახრა</th>
                                    <th className="px-4 py-3 font-medium text-right ">YTD შესრულება</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cumulData.map((d) => (
                                    <tr key={d.q} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
                                      <td className="px-4 py-3 font-bold text-slate-800">{d.q}</td>
                                      <td className="px-4 py-3 text-right text-slate-500">{formatDol(d.cumulPlanTotal)}</td>
                                      <td className="px-4 py-3 text-right font-mono text-emerald-600 font-medium">{formatDol(d.cumulFactTotal)}</td>
                                      <td className="px-4 py-3 text-right font-mono">{formatCol(d.devTotal)}</td>
                                      <td className="px-4 py-3 text-right font-mono">{formatColPct(d.execTotal)}</td>
                                      
                                      <td className="px-4 py-3 text-right text-slate-500 bg-slate-50/50">{formatDol(d.cumulPlanKleemann)}</td>
                                      <td className="px-4 py-3 text-right font-mono text-emerald-600 font-medium bg-slate-50/50">{formatDol(d.cumulFactKleemann)}</td>
                                      <td className="px-4 py-3 text-right font-mono bg-slate-50/50">{formatCol(d.devKleemann)}</td>
                                      <td className="px-4 py-3 text-right font-mono bg-slate-50/50">{formatColPct(d.execKleemann)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                </div>
              );
            })()}
          </div>
        </main>
      ) : activeTab === 'dashboard2' ? (
        <main className="flex-1 overflow-auto bg-[#f8f9fc] p-6 lg:p-8 text-gray-800">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Dashboard 2 Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-emerald-600" />
                მომხმარებელთა ძაბრი & ლოჯისტიკა (Sales Funnel & Bottlenecks)
              </h2>
            </div>
            
            {(() => {
              // DATA PREP FOR FUNNEL
              const reps = managerOptions;
              
              const funnelData = reps.map(rep => {
                const repProj = projects.filter(p => managerMatches(p.manager, rep));
                
                // Funnel counts
                const registered = repProj.length;
                const inProgress = repProj.filter(p => p.status.includes('60') || p.statusDetail === 'წარმოება').length;
                const contracted = repProj.filter(p => p.status === 'დაკონტრაქტებული').length;
                
                // Average days to contract for this rep
                let totalDays = 0;
                let count = 0;
                repProj.forEach(p => {
                  if (p.status === 'დაკონტრაქტებული' && p.statusHistory && p.statusHistory.length > 1) {
                    const firstDate = p.statusHistory[0].date;
                    const lastDate = p.statusHistory[p.statusHistory.length - 1].date;
                    totalDays += calcDays(firstDate, lastDate);
                    count++;
                  }
                });
                const avgDaysToContract = count > 0 ? Math.round(totalDays / count) : 0;

                return {
                  name: rep,
                  'რეგისტრირებული': registered,
                  'მიმდინარე (პოტენციური)': inProgress,
                  'დაკონტრაქტებული': contracted,
                  'საშ. დღე კონტრაქტამდე': avgDaysToContract
                };
              });

              // Status Distribution Data
              const statusCounts: Record<string, number> = {};
              projects.forEach(p => {
                statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
              });
              const pieData = Object.keys(statusCounts).map(k => ({ name: k, value: statusCounts[k] }));
              const COLORS = ['#10b981', '#f59e0b', '#64748b', '#3b82f6'];

              // Time between statuses (Bottlenecks)
              // To calculate this, we look at the gap between historical statuses
              const stageTimeSum: Record<string, number> = {};
              const stageTimeCount: Record<string, number> = {};
              
              projects.forEach(p => {
                if(p.statusHistory && p.statusHistory.length > 1) {
                  for(let i=0; i<p.statusHistory.length - 1; i++) {
                    const stage = p.statusHistory[i].status;
                    const nextDate = p.statusHistory[i+1].date;
                    const currDate = p.statusHistory[i].date;
                    const days = calcDays(currDate, nextDate);
                    
                    if(!stageTimeSum[stage]) {
                      stageTimeSum[stage] = 0;
                      stageTimeCount[stage] = 0;
                    }
                    stageTimeSum[stage] += days;
                    stageTimeCount[stage]++;
                  }
                }
              });

              const stageTimeData = Object.keys(stageTimeSum).map(stage => ({
                name: stage,
                'საშ. დღე (გაჩერდა)': Math.round(stageTimeSum[stage] / stageTimeCount[stage])
              }));

              // Helper for days
              function calcDays(d1: string, d2: string) {
                const diffTime = Math.abs(new Date(d2).getTime() - new Date(d1).getTime());
                return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
              }

              return (
                <div className="space-y-6">
                  {/* FUNNEL CHARTS */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-6">
                      <h3 className="text-slate-900 font-bold mb-6 tracking-tight">კლიენტების ძაბრი აგენტების მიხედვით (რაოდენობა)</h3>
                      <div className="h-80">
                         <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={funnelData} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                            <XAxis type="number" tick={{fontSize: 12, fill: '#64748b'}} />
                            <YAxis dataKey="name" type="category" tick={{fontSize: 12, fill: '#334155'}} width={100} />
                            <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                            <Legend wrapperStyle={{fontSize: '12px'}} />
                            <Bar dataKey="რეგისტრირებული" stackId="a" fill="#cbd5e1" barSize={30} />
                            <Bar dataKey="მიმდინარე (პოტენციური)" stackId="a" fill="#fbbf24" />
                            <Bar dataKey="დაკონტრაქტებული" stackId="a" fill="#34d399" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-6">
                      <h3 className="text-slate-900 font-bold mb-6 tracking-tight">მიმდინარე სტატუსების განაწილება</h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={110}
                              innerRadius={60}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* BOTTLENECK ANALYSIS */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 overflow-hidden">
                    <h3 className="bg-slate-50/80 p-4 font-semibold text-sm border-b border-slate-200 text-slate-800">
                      რა დროით ჩერდება კლიენტი სტატუსიდან სტატუსამდე (Bottleneck Analysis)
                    </h3>
                    <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                      <div className="h-64">
                         <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={stageTimeData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                            <XAxis type="number" tick={{fontSize: 12, fill: '#64748b'}} />
                            <YAxis dataKey="name" type="category" tick={{fontSize: 11, fill: '#334155'}} width={120} />
                            <Tooltip formatter={(value: any) => [`${value} დღე`, 'საშ. გაჩერების დრო']} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                            <Bar dataKey="საშ. დღე (გაჩერდა)" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={25}>
                              {stageTimeData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry['საშ. დღე (გაჩერდა)'] > 30 ? '#ef4444' : '#f59e0b'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead className="bg-slate-50/80 text-slate-500 text-xs tracking-wider border-b border-slate-200 uppercase font-semibold">
                            <tr>
                              <th className="px-4 py-3 font-medium">სტატუსის დასახელება (ეტაპი)</th>
                              <th className="px-4 py-3 font-medium text-right">საშუალო გაჩერების დრო</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stageTimeData.map((d, i) => (
                              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/80">
                                <td className="px-4 py-3 font-medium text-slate-600">{d.name}</td>
                                <td className="px-4 py-3 text-right font-bold text-amber-600">{d['საშ. დღე (გაჩერდა)']} დღე</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                </div>
              );
            })()}
          </div>
        </main>
      ) : (
        <main className="flex-1 p-6 lg:p-8 bg-[#f8f9fc] overflow-hidden flex flex-col">
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl flex-1 flex flex-col overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-slate-200/80 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center shrink-0 gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 tracking-tight">
                  <Database className="w-4 h-4 text-emerald-600" />
                  ფორმა 505 (Raw Data Editor)
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {/* Search */}
                <div className="relative flex-1 sm:flex-none">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="ძიება..." 
                    value={formaSearch}
                    onChange={(e) => setFormaSearch(e.target.value)}
                    className="w-full sm:w-48  border border-slate-200 bg-slate-50 hover:bg-white text-slate-700 text-xs rounded-md shadow-sm pl-9 pr-3 py-1.5 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-all"
                  />
                </div>
                {/* Filters */}
                <select 
                  value={formaFilterManager} 
                  onChange={(e) => setFormaFilterManager(e.target.value)}
                  className=" border border-slate-200 bg-slate-50 hover:bg-white text-slate-700 text-xs rounded-md shadow-sm px-2 py-1.5 focus:outline-none focus:border-slate-400 appearance-none"
                >
                  <option value="all">ყველა მენეჯერი</option>
                  {managerOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select 
                  value={formaFilterQuarter} 
                  onChange={(e) => setFormaFilterQuarter(e.target.value)}
                  className=" border border-slate-200 bg-slate-50 hover:bg-white text-slate-700 text-xs rounded-md shadow-sm px-2 py-1.5 focus:outline-none focus:border-slate-400 appearance-none"
                >
                  <option value="all">ყველა კვარტალი</option>
                  <option value="Q1">Q1</option>
                  <option value="Q2">Q2</option>
                  <option value="Q3">Q3</option>
                  <option value="Q4">Q4</option>
                </select>
                <select 
                  value={formaFilterStatus} 
                  onChange={(e) => setFormaFilterStatus(e.target.value)}
                  className=" border border-slate-200 bg-slate-50 hover:bg-white text-slate-700 text-xs rounded-md shadow-sm px-2 py-1.5 focus:outline-none focus:border-slate-400 appearance-none"
                >
                  <option value="all">ყველა სტატუსი</option>
                  <option value="დაკონტრაქტებული">დაკონტრაქტებული</option>
                  <option value="პოტ. 60%+">პოტ. 60%+</option>
                  <option value="პოტ. 60%-">პოტ. 60%-</option>
                </select>
                <button 
                  onClick={() => {
                    setIsModalOpen(true);
                    setEditingId(null);
                    setFormData({
                      name: '', product: 'ლიფტი', brand: 'KLEEMANN', units: 1, floors: 0, contractDuration: 0,
                      location: 'თბილისი', currency: 'USD', kleemannValue: 0, hitachiValue: 0, value: 0, revenue: 0,
                      tranche1: 35, deliveryMonth: '', probability: 50, comment: '', quarter: 'Q1', manager: managerOptions[0] ?? '',
                      statusDetail: 'აქტიური', status: 'პოტ. 60%-'
                    });
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded text-xs flex items-center gap-1 transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> დამატება
                </button>
              </div>
            </div>
            
            <div className="overflow-auto flex-1">
              <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
                <thead className="bg-slate-50/95 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200 sticky top-0 backdrop-blur-md z-10">
                  <tr>
                    <th className="px-3 py-2 font-medium">პროექტის დასახელება</th>
                    <th className="px-3 py-2 font-medium">პროდუქტი</th>
                    <th className="px-3 py-2 font-medium">მწარმოებელი</th>
                    <th className="px-3 py-2 font-medium text-center" title="დანადგარის რაოდენობა">რაოდ.</th>
                    <th className="px-3 py-2 font-medium text-center" title="სართულების საერთო რაოდენობა">სართ.</th>
                    <th className="px-3 py-2 font-medium text-center" title="კონტრაქტის ხანგრძლივობა (კვირა)">ხანგრძლ. (კვ)</th>
                    <th className="px-3 py-2 font-medium">ადგილმდებარეობა</th>
                    <th className="px-3 py-2 font-medium">ვალუტა</th>
                    <th className="px-3 py-2 font-medium text-right">კლემანი (EUR)</th>
                    <th className="px-3 py-2 font-medium text-right">ჰიტაჩი</th>
                    <th className="px-3 py-2 font-medium text-right">სრული ღირებულება (USD)</th>
                    <th className="px-3 py-2 font-medium text-right">შემოსავალი (USD)</th>
                    <th className="px-3 py-2 font-medium text-center">I ტრანში (%)</th>
                    <th className="px-3 py-2 font-medium">მოწოდების პერიოდი</th>
                    <th className="px-3 py-2 font-medium text-center">ალბათობა (%)</th>
                    <th className="px-3 py-2 font-medium">კომენტარი</th>
                    <th className="px-3 py-2 font-medium">კვარტალი</th>
                    <th className="px-3 py-2 font-medium">მენეჯერი</th>
                    <th className="px-3 py-2 font-medium">მიმდინარე სტატუსი</th>
                    <th className="px-3 py-2 font-medium">საბოლოო სტატუსი</th>
                    <th className="px-3 py-2 font-medium">დაკონტრაქტების თარიღი</th>
                    <th className="px-3 py-2 font-medium text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {filteredFormaProjects.map((proj) => (
                    <tr key={proj.id} className="border-b border-slate-100 bg-white hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-1.5 truncate max-w-[200px]" title={proj.name}>{proj.name}</td>
                      <td className="px-3 py-1.5">{proj.product || ''}</td>
                      <td className="px-3 py-1.5">{proj.brand}</td>
                      <td className="px-3 py-1.5 text-center">{proj.units}</td>
                      <td className="px-3 py-1.5 text-center">{proj.floors || ''}</td>
                      <td className="px-3 py-1.5 text-center">{proj.contractDuration || ''}</td>
                      <td className="px-3 py-1.5">{proj.location || ''}</td>
                      <td className="px-3 py-1.5">{proj.currency || ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-500">{proj.kleemannValue ? proj.kleemannValue.toLocaleString() : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-500">{proj.hitachiValue ? proj.hitachiValue.toLocaleString() : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-emerald-600">{proj.value.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-emerald-600">{proj.revenue ? proj.revenue.toLocaleString() : ''}</td>
                      <td className="px-3 py-1.5 text-center">{proj.tranche1 ? proj.tranche1 + '%' : ''}</td>
                      <td className="px-3 py-1.5">{proj.deliveryMonth || ''}</td>
                      <td className="px-3 py-1.5 text-center">{proj.probability ? proj.probability + '%' : ''}</td>
                      <td className="px-3 py-1.5 truncate max-w-[150px]" title={proj.comment}>{proj.comment || ''}</td>
                      <td className="px-3 py-1.5">{proj.quarter}</td>
                      <td className="px-3 py-1.5">{proj.manager}</td>
                      <td className="px-3 py-1.5">{proj.statusDetail || ''}</td>
                      <td className="px-3 py-1.5">{proj.status}</td>
                      <td className="px-3 py-1.5">{proj.contractDate || ''}</td>
                      <td className="px-3 py-1.5 text-center flex gap-1 justify-center">
                        <button 
                          onClick={() => {
                            setFormData(proj);
                            setEditingId(proj.id);
                            setIsModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-400 hover:bg-blue-400/10 rounded transition-colors"
                          title="რედაქტირება"
                        >
                          <Table className="w-3.5 h-3.5" />
                        </button>
                        {isFull && <button 
                          onClick={() => removeRow(proj.id)}
                          className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                          title="წაშლა"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {isModalOpen && (
        <ProjectModal 
          managerOptions={managerOptions}
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onSave={(data: any) => {
            if (editingId) {
              setProjects(projects.map(p => p.id === editingId ? { ...data, id: editingId } : p));
            } else {
              setProjects([{ ...data, id: Math.random().toString(36).substr(2, 9) }, ...projects]);
            }
            setIsModalOpen(false);
          }}
          initialData={formData}
        />
      )}
    </div>
  );
}