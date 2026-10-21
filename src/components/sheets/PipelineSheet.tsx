import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAccessRole } from '@/components/AccessGate';
import { listUsers } from '@/lib/access';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, ComposedChart
} from 'recharts';
import { LayoutDashboard, Table, Plus, Search, CheckCircle2, TrendingUp, AlertCircle, BarChart2, Activity, Trash2, Save, X, Database, Loader2 } from 'lucide-react';
import { usePipelineProjects } from '@/lib/pipeline';
import { listSalesPlans, PLAN_SCOPE_LABEL, type SalesPlan, type PlanScope } from '@/lib/salesPlans';
import { usePipelineNorms, PROJECT_SIZES, type PipelineNorms } from '@/lib/pipelineNorms';

// ============================================================================
// TYPES
// ============================================================================
type Project = {
  id: string;
  name: string;
  contractDate?: string;
  product?: string;
  size?: string;
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
  source?: string;
  planShare?: number;
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
    } else if (PLUS_STATUSES.includes(p.status)) {
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
const MONTHS = ['იანვარი','თებერვალი','მარტი','აპრილი','მაისი','ივნისი','ივლისი','აგვისტო','სექტემბერი','ოქტომბერი','ნოემბერი','დეკემბერი'];
// პროექტის წყარო — ბონუსების დასათვლელად: ვინ მოიძია პროექტი.
const SOURCES = ['საკუთარი მოძიება', 'მენეჯმენტის გადაცემული'];
// გეგმაში გათვალისწინების % — რა წილი ეთვლება წარმომადგენელს შესრულებაში
// (მაგ. სხვისი მოტანილი პროექტი — 50%). ცარიელი = 100%.
const PLAN_SHARES = ['100', '50', '30', '10'];
const shareOf = (p: { planShare?: number | string }) => {
  const v = Number(p.planShare);
  return Number.isFinite(v) && v > 0 ? v / 100 : 1;
};
const STATUS_DETAILS = ['აქტიური','დიდი ინტერესი','სიტყვიერი დასტური','დადასტურებული','ხელმოწერილი','წაგებული'];

// საბოლოო სტატუსი — ალბათობის საფეხურებით. 60%-ზე მეტი/ტოლი = „პოტ. 60%+" ჯგუფი,
// 50% და <50% = „პოტ. 60%-" ჯგუფი (ძველი მნიშვნელობებიც ამავე ჯგუფებში ითვლება).
const FINAL_STATUSES = ['დაკონტრაქტებული', '90%', '80%', '70%', '60%', '50%', '<50%'];
const PLUS_STATUSES = ['90%', '80%', '70%', '60%', 'პოტ. 60%+'];
const MINUS_STATUSES = ['50%', '<50%', 'პოტ. 60%-'];
const isLost = (p: { statusDetail?: string }) => p.statusDetail === 'წაგებული';
const isPlus = (p: { status: string; statusDetail?: string }) => PLUS_STATUSES.includes(p.status) && !isLost(p);
const isMinus = (p: { status: string; statusDetail?: string }) => MINUS_STATUSES.includes(p.status) && !isLost(p);

// ფორმის ველები — ფორმა 505-ის სვეტების თანმიმდევრობით. ყველა ველი სავალდებულოა,
// გარდა: კლემანი/ჰიტაჩი (მხოლოდ შესაბამისი მწარმოებლისას) და დაკონტრაქტების
// თარიღი (მხოლოდ სტატუსი „დაკონტრაქტებული"-სას).
type FieldDef = { key: string; label: string; type: 'text' | 'number' | 'select' | 'date' | 'textarea'; options?: string[]; list?: string; wide?: boolean };
const FIELDS: FieldDef[] = [
  { key: 'name', label: 'პროექტის დასახელება', type: 'text', wide: true },
  { key: 'product', label: 'პროდუქტი', type: 'select', options: ['ლიფტი', 'ესკალატორი', 'ტრაველატორი', 'პლატფორმა', 'საპარკინგე სისტემა'] },
  { key: 'size', label: 'პროექტის ზომა', type: 'select', options: [...PROJECT_SIZES] },
  { key: 'brand', label: 'მწარმოებელი', type: 'text', list: 'pl-brands' },
  { key: 'units', label: 'რაოდენობა (ც.)', type: 'number' },
  { key: 'floors', label: 'სართულები (ჯამი)', type: 'number' },
  { key: 'contractDuration', label: 'ხანგრძლივობა (კვირა)', type: 'number' },
  { key: 'location', label: 'ადგილმდებარეობა', type: 'text', list: 'pl-locations' },
  { key: 'currency', label: 'ვალუტა', type: 'select', options: ['USD', 'EUR', 'GEL'] },
  { key: 'kleemannValue', label: 'კლემანი (EUR)', type: 'number' },
  { key: 'hitachiValue', label: 'ჰიტაჩი', type: 'number' },
  { key: 'value', label: 'სრული ღირებულება (USD)', type: 'number' },
  { key: 'revenue', label: 'შემოსავალი (USD)', type: 'number' },
  { key: 'tranche1', label: 'I ტრანში (%)', type: 'number' },
  { key: 'deliveryMonth', label: 'მოწოდების პერიოდი', type: 'select', options: MONTHS },
  { key: 'probability', label: 'ალბათობა (%)', type: 'number' },
  { key: 'quarter', label: 'კვარტალი', type: 'select', options: ['Q1', 'Q2', 'Q3', 'Q4'] },
  { key: 'manager', label: 'მენეჯერი', type: 'select' },
  { key: 'source', label: 'წყარო', type: 'select', options: SOURCES },
  { key: 'planShare', label: 'გეგმაში გათვალისწინება (%)', type: 'select', options: PLAN_SHARES },
  { key: 'statusDetail', label: 'მიმდინარე სტატუსი', type: 'select', options: STATUS_DETAILS },
  { key: 'status', label: 'საბოლოო სტატუსი', type: 'select', options: FINAL_STATUSES },
  { key: 'contractDate', label: 'დაკონტრაქტების თარიღი', type: 'date' },
  { key: 'comment', label: 'კომენტარი', type: 'textarea', wide: true },
];

function isRequired(key: string, d: any, isNew = true): boolean {
  const brand = String(d.brand || '').toUpperCase();
  if (key === 'kleemannValue') return brand.includes('KLEEMANN');
  if (key === 'hitachiValue') return brand.includes('HITACHI');
  // არსებულ ჩანაწერებს თარიღი შეიძლება არ ჰქონდეს — რედაქტირებას არ ვბლოკავთ
  if (key === 'contractDate') return isNew && d.status === 'დაკონტრაქტებული';
  // წყაროს მენეჯმენტი/ფინანსები ავსებს — სავალდებულო არ არის
  if (key === 'source' || key === 'planShare') return false;
  // ზომა სავალდებულოა ახალ ჩანაწერზე; არსებულებს რედაქტირებისას არ ვბლოკავთ
  if (key === 'size') return isNew;
  return true;
}
function isEmpty(v: any) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && !isFinite(v));
}

function ProjectModal({ isOpen, onClose, onSave, initialData, managerOptions = [], brandOptions = [], locationOptions = [], lockedKeys = [] }: any) {
  const [formData, setFormData] = useState<any>(initialData || {});
  const [tried, setTried] = useState(false);

  if (!isOpen) return null;

  const isNew = !initialData?.id;
  const missing = FIELDS.filter((f) => isRequired(f.key, formData, isNew) && isEmpty(formData[f.key])).map((f) => f.key);
  const set = (key: string, raw: string, type: FieldDef['type']) => {
    const v = type === 'number' || key === 'planShare' ? (raw === '' ? '' : Number(raw)) : raw;
    setFormData({ ...formData, [key]: v });
  };
  const save = () => {
    setTried(true);
    if (missing.length) return;
    // ცარიელი არასავალდებულო რიცხვები → 0, რომ ცხრილი/ჯამები სწორად დაითვალოს
    const out: any = { ...formData };
    FIELDS.forEach((f) => { if (f.type === 'number' && isEmpty(out[f.key])) out[f.key] = 0; });
    onSave(out);
  };
  const inputCls = (key: string) =>
    'w-full border p-2 rounded text-sm ' + (tried && missing.includes(key) ? 'border-red-500 bg-red-50' : '');

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
          <p className="text-xs text-gray-500 mb-4">
            <span className="text-red-600">*</span> — სავალდებულო. კლემანი/ჰიტაჩი სავალდებულოა შესაბამისი მწარმოებლისას,
            დაკონტრაქტების თარიღი — სტატუსი „დაკონტრაქტებული"-სას.
          </p>
          <datalist id="pl-brands">{(brandOptions as string[]).map((b) => <option key={b} value={b} />)}</datalist>
          <datalist id="pl-locations">{(locationOptions as string[]).map((b) => <option key={b} value={b} />)}</datalist>
          <form className="grid grid-cols-1 md:grid-cols-3 gap-4" onSubmit={(e) => e.preventDefault()}>
            {FIELDS.map((f) => {
              const req = isRequired(f.key, formData, isNew);
              const val = formData[f.key] ?? '';
              const options = f.key === 'manager' ? (managerOptions as string[]) : f.options;
              const locked = (lockedKeys as string[]).includes(f.key);
              return (
                <div key={f.key} className={'space-y-1 ' + (f.wide ? 'md:col-span-3' : '')}>
                  <label className="text-xs font-semibold text-gray-600">
                    {f.label}{req && <span className="text-red-600"> *</span>}
                  </label>
                  {locked ? (
                    <div className="w-full border p-2 rounded text-sm bg-slate-50 text-slate-500" title="ამ ველს ავსებს მენეჯმენტი">{val || '—'}</div>
                  ) : f.type === 'select' ? (
                    <select className={inputCls(f.key)} value={val} onChange={(e) => set(f.key, e.target.value, f.type)}>
                      <option value="">— აირჩიეთ —</option>
                      {(options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea rows={3} className={inputCls(f.key)} value={val} onChange={(e) => set(f.key, e.target.value, f.type)} />
                  ) : (
                    <input
                      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                      list={f.list}
                      className={inputCls(f.key)}
                      value={val}
                      onChange={(e) => set(f.key, e.target.value, f.type)}
                    />
                  )}
                </div>
              );
            })}
          </form>
          {tried && missing.length > 0 && (
            <p className="mt-4 text-sm text-red-600">
              შეავსეთ სავალდებულო ველები: {FIELDS.filter((f) => missing.includes(f.key)).map((f) => f.label).join(', ')}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            გაუქმება
          </button>
          <button onClick={save} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-2">
            <Save className="w-4 h-4" /> შენახვა
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// წარმომადგენლების გეგმა / შესრულება (კვარტალური + ნაზარდი) — sales_plans-იდან
// ============================================================================
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const isContracted = (p: Project) => p.status === 'დაკონტრაქტებული' && !isLost(p);
const projYear = (p: Project) => (p.contractDate ? p.contractDate.substring(0, 4) : String(new Date().getFullYear()));
const factOf = (p: Project, scope: PlanScope) =>
  scope === 'overall' ? (p.revenue || 0) : scope === 'kleemann' ? (p.kleemannValue || 0) : (p.hitachiValue || 0);
const usd0 = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const devCell = (v: number) => (
  <span className={v >= 0 ? 'text-emerald-600 font-medium' : 'text-rose-500 font-medium'}>{v > 0 ? '+' : ''}{usd0(v)}</span>
);
const pctCell = (fact: number, plan: number) =>
  plan > 0
    ? <span className={fact >= plan ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{((fact / plan) * 100).toFixed(1)}%</span>
    : <span className="text-slate-300">—</span>;

type RepRef = { id: string; name: string };

function RepPlanTable({ projects, plans, plansError, reps, year }: {
  projects: Project[]; plans: SalesPlan[]; plansError: boolean; reps: RepRef[]; year: number;
}) {
  const [scope, setScope] = useState<PlanScope>('overall');
  const yearProjects = projects.filter((p) => isContracted(p) && projYear(p) === String(year));

  const planFor = (repIds: string[], qi: number) =>
    plans.filter((pl) => pl.year === year && pl.quarter === qi && pl.scope === scope && repIds.includes(pl.salesPersonId))
      .reduce((a, pl) => a + pl.planUsd, 0);
  const factFor = (names: string[], q: string) =>
    yearProjects.filter((p) => p.quarter === q && names.some((n) => managerMatches(p.manager, n)))
      .reduce((a, p) => a + factOf(p, scope) * shareOf(p), 0);

  const unmatched = yearProjects.filter((p) => !reps.some((r) => managerMatches(p.manager, r.name)));
  const unmatchedSum = unmatched.reduce((a, p) => a + factOf(p, scope) * shareOf(p), 0);
  const unmatchedNames = Array.from(new Set(unmatched.map((p) => p.manager).filter(Boolean)));

  const groups: { key: string; label: string; ids: string[]; names: string[]; total?: boolean }[] =
    reps.map((r) => ({ key: r.id, label: r.name, ids: [r.id], names: [r.name] }));
  if (reps.length > 1) groups.push({ key: '__total', label: 'ჯამი', ids: reps.map((r) => r.id), names: reps.map((r) => r.name), total: true });

  const th = 'px-2 py-2 font-medium text-right';
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-slate-800 tracking-tight">წარმომადგენლების გეგმა და შესრულება — {year}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            გეგმა — „გეგმა და შესრულებები" ტაბიდან; ფაქტი — ფორმა 505-ის დაკონტრაქტებული პროექტები
            ({scope === 'overall' ? 'შემოსავალი / მარჟა' : scope === 'kleemann' ? 'სვეტი „კლემანი"' : 'სვეტი „ჰიტაჩი"'}),
            გამრავლებული „გეგმაში გათვალისწინების %"-ზე (ცარიელი = 100%).
          </p>
        </div>
        <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200 text-xs">
          {(['overall', 'kleemann', 'hitachi'] as PlanScope[]).map((sc) => (
            <button key={sc} onClick={() => setScope(sc)}
              className={'px-3 py-1 rounded-md ' + (scope === sc ? 'bg-white shadow-sm font-semibold text-slate-800' : 'text-slate-500')}>
              {PLAN_SCOPE_LABEL[sc]}
            </button>
          ))}
        </div>
      </div>
      {plansError && (
        <p className="px-6 py-2 text-xs text-rose-600 bg-rose-50">გეგმების ჩატვირთვა ვერ მოხერხდა — ნაჩვენებია მხოლოდ ფაქტი.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200 font-semibold">
            <tr>
              <th className="px-4 py-2 font-medium" rowSpan={2}>წარმომადგენელი</th>
              <th className="px-3 py-2 font-medium" rowSpan={2}>პერიოდი</th>
              <th className="px-2 py-2 font-medium text-center border-l border-slate-200" colSpan={4}>კვარტალი</th>
              <th className="px-2 py-2 font-medium text-center border-l border-slate-200 bg-blue-50/60" colSpan={4}>ნაზარდი ჯამი</th>
            </tr>
            <tr>
              <th className={th + ' border-l border-slate-200'}>გეგმა</th><th className={th}>ფაქტი</th><th className={th}>გადახრა</th><th className={th}>%</th>
              <th className={th + ' border-l border-slate-200 bg-blue-50/60'}>გეგმა</th><th className={th + ' bg-blue-50/60'}>ფაქტი</th>
              <th className={th + ' bg-blue-50/60'}>გადახრა</th><th className={th + ' bg-blue-50/60'}>%</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              let cPlan = 0, cFact = 0;
              const rows = QUARTERS.map((q, i) => {
                const plan = planFor(g.ids, i + 1);
                const fact = factFor(g.names, q);
                cPlan += plan; cFact += fact;
                return { q, plan, fact, cPlan, cFact };
              });
              const rowCls = g.total ? 'bg-slate-100/70 font-semibold text-slate-900' : 'text-slate-700';
              return (
                <React.Fragment key={g.key}>
                  {rows.map((r, i) => (
                    <tr key={r.q} className={'border-b border-slate-100 ' + rowCls}>
                      {i === 0 && (
                        <td rowSpan={5} className={'px-4 py-2 align-top border-r border-slate-200 font-semibold ' + (g.total ? 'text-slate-900' : 'text-slate-800')}>
                          {g.label}
                        </td>
                      )}
                      <td className="px-3 py-1.5">{r.q}</td>
                      <td className="px-2 py-1.5 text-right border-l border-slate-200 text-slate-500">{usd0(r.plan)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{usd0(r.fact)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{devCell(r.fact - r.plan)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{pctCell(r.fact, r.plan)}</td>
                      <td className="px-2 py-1.5 text-right border-l border-slate-200 bg-blue-50/40 text-slate-500">{usd0(r.cPlan)}</td>
                      <td className="px-2 py-1.5 text-right font-mono bg-blue-50/40">{usd0(r.cFact)}</td>
                      <td className="px-2 py-1.5 text-right font-mono bg-blue-50/40">{devCell(r.cFact - r.cPlan)}</td>
                      <td className="px-2 py-1.5 text-right font-mono bg-blue-50/40">{pctCell(r.cFact, r.cPlan)}</td>
                    </tr>
                  ))}
                  <tr className={'border-b-2 border-slate-200 font-bold ' + (g.total ? 'bg-blue-100/60 text-slate-900' : 'bg-slate-50 text-slate-800')}>
                    <td className="px-3 py-1.5">წელი</td>
                    <td className="px-2 py-1.5 text-right border-l border-slate-200">{usd0(cPlan)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{usd0(cFact)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{devCell(cFact - cPlan)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{pctCell(cFact, cPlan)}</td>
                    <td className="px-2 py-1.5 border-l border-slate-200" colSpan={4}></td>
                  </tr>
                </React.Fragment>
              );
            })}
            {groups.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-400">წარმომადგენლები ვერ მოიძებნა.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {unmatchedSum > 0 && (
        <p className="px-6 py-2 text-xs text-slate-500 border-t border-slate-100">
          გეგმის გარეშე მენეჯერების დაკონტრაქტებული ფაქტი (ჯამში არ შედის): {usd0(unmatchedSum)}
          {unmatchedNames.length > 0 && ` — ${unmatchedNames.join(', ')}`}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// მუშა პროექტები ზომის მიხედვით — რაოდენობა vs ნორმატივი, ჯამური ღირებულება
// ============================================================================
function WorkingBySizeTable({ projects, reps, norms }: { projects: Project[]; reps: string[]; norms: PipelineNorms }) {
  const active = projects.filter((p) => !isContracted(p) && !isLost(p));
  const sizes = [...PROJECT_SIZES];
  const cellsFor = (list: Project[]) => {
    const by = (sz?: string) => list.filter((p) => (sz ? p.size === sz : !sizes.includes(p.size as any)));
    return {
      sizes: sizes.map((sz) => { const l = by(sz); return { n: l.length, sum: l.reduce((a, p) => a + (p.value || 0), 0) }; }),
      none: (() => { const l = by(); return { n: l.length, sum: l.reduce((a, p) => a + (p.value || 0), 0) }; })(),
      total: { n: list.length, sum: list.reduce((a, p) => a + (p.value || 0), 0) },
    };
  };
  const rows = reps.map((r) => ({ rep: r, c: cellsFor(active.filter((p) => p.manager === r)) }));
  const totalNorm = (sz: (typeof PROJECT_SIZES)[number]) => norms.sizeCounts[sz] * reps.length;
  const tot = cellsFor(active.filter((p) => reps.includes(p.manager)));
  const devBadge = (n: number, norm: number) => {
    const d = n - norm;
    return <span className={'font-mono ' + (d >= 0 ? 'text-emerald-600' : 'text-rose-500')}>{d > 0 ? '+' : ''}{d}</span>;
  };
  const th = 'px-2 py-2 font-medium text-right';
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="font-bold text-base text-slate-800 tracking-tight">მუშა პროექტები ზომის მიხედვით</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          მუშა = არც დაკონტრაქტებული, არც წაგებული (ფილტრები არ მოქმედებს). ნორმატივი ერთ წარმომადგენელზე:
          {' '}{sizes.map((sz) => `${sz} ${norms.sizeCounts[sz]}`).join(' · ')}. თანხა — სრული ღირებულება (USD).
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200 font-semibold">
            <tr>
              <th className="px-4 py-2 font-medium" rowSpan={2}>წარმომადგენელი</th>
              {sizes.map((sz) => (
                <th key={sz} className="px-2 py-2 font-medium text-center border-l border-slate-200" colSpan={4}>{sz}</th>
              ))}
              <th className="px-2 py-2 font-medium text-center border-l border-slate-200" colSpan={2}>ზომა მიუთითებელი</th>
              <th className="px-2 py-2 font-medium text-center border-l border-slate-200 bg-blue-50/60" colSpan={2}>სულ</th>
            </tr>
            <tr>
              {sizes.map((sz) => (
                <React.Fragment key={sz}>
                  <th className={th + ' border-l border-slate-200'}>ფაქტი</th><th className={th}>ნორმა</th>
                  <th className={th}>გადახრა</th><th className={th}>თანხა</th>
                </React.Fragment>
              ))}
              <th className={th + ' border-l border-slate-200'}>რაოდ.</th><th className={th}>თანხა</th>
              <th className={th + ' border-l border-slate-200 bg-blue-50/60'}>რაოდ.</th><th className={th + ' bg-blue-50/60'}>თანხა</th>
            </tr>
          </thead>
          <tbody>
            {[...rows, ...(reps.length > 1 ? [{ rep: '__total', c: tot }] : [])].map(({ rep, c }) => {
              const isTot = rep === '__total';
              return (
                <tr key={rep} className={'border-b border-slate-100 ' + (isTot ? 'bg-blue-100/50 font-bold text-slate-900' : 'text-slate-700 hover:bg-slate-50/80')}>
                  <td className="px-4 py-2 font-medium border-r border-slate-200">{isTot ? 'ჯამი' : rep}</td>
                  {sizes.map((sz, i) => {
                    const norm = isTot ? totalNorm(sz) : norms.sizeCounts[sz];
                    return (
                      <React.Fragment key={sz}>
                        <td className="px-2 py-2 text-right border-l border-slate-200 font-semibold">{c.sizes[i].n}</td>
                        <td className="px-2 py-2 text-right text-slate-400">{norm}</td>
                        <td className="px-2 py-2 text-right">{devBadge(c.sizes[i].n, norm)}</td>
                        <td className="px-2 py-2 text-right font-mono">{usd0(c.sizes[i].sum)}</td>
                      </React.Fragment>
                    );
                  })}
                  <td className={'px-2 py-2 text-right border-l border-slate-200 ' + (c.none.n ? 'text-amber-600 font-semibold' : 'text-slate-300')}>{c.none.n}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-500">{usd0(c.none.sum)}</td>
                  <td className="px-2 py-2 text-right border-l border-slate-200 bg-blue-50/40 font-semibold">{c.total.n}</td>
                  <td className="px-2 py-2 text-right font-mono bg-blue-50/40">{usd0(c.total.sum)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ============================================================================
// დაშბორდი 2 — წარმომადგენლების პაიპლაინი: ზომა, ბრენდი, თანხა, ალბათობა vs გეგმა
// ============================================================================
const PROB_BUCKETS = ['დაკონტრაქტებული', '90%', '80%', '70%', '60%', '50%', '<50%'] as const;
type ProbBucket = (typeof PROB_BUCKETS)[number];
const BUCKET_COLOR: Record<ProbBucket, string> = {
  'დაკონტრაქტებული': '#047857', '90%': '#16a34a', '80%': '#65a30d', '70%': '#ca8a04',
  '60%': '#ea580c', '50%': '#dc2626', '<50%': '#94a3b8',
};
const BUCKET_WEIGHT: Record<ProbBucket, number> = {
  'დაკონტრაქტებული': 1, '90%': 0.9, '80%': 0.8, '70%': 0.7, '60%': 0.6, '50%': 0.5, '<50%': 0.3,
};
const bucketOf = (p: Project): ProbBucket => {
  if ((PROB_BUCKETS as readonly string[]).includes(p.status)) return p.status as ProbBucket;
  if (p.status === 'პოტ. 60%+') return '60%';
  if (p.status === 'პოტ. 60%-') return '50%';
  return '<50%';
};
// ალბათობა: ჯერ ფორმის „ალბათობა (%)" ველი, თუ შევსებულია; თორემ საბოლოო სტატუსის საფეხური
const probOf = (p: Project) => {
  if (bucketOf(p) === 'დაკონტრაქტებული') return 1;
  const v = Number(p.probability);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 100) / 100 : BUCKET_WEIGHT[bucketOf(p)];
};
const BRAND_GROUPS = ['Kleemann', 'Hitachi', 'Fuji', 'სხვა'] as const;
const brandGroupOf = (b?: string) => {
  const x = String(b || '').toLowerCase();
  if (x.includes('kleemann')) return 'Kleemann';
  if (x.includes('hitach')) return 'Hitachi';
  if (x.includes('fuji')) return 'Fuji';
  return 'სხვა';
};
type Metric = 'overall' | 'kleemann' | 'hitachi';
const METRIC_LABEL: Record<Metric, string> = {
  overall: 'შემოსავალი (მარჟა) ↔ საერთო გეგმა',
  kleemann: 'კლემანი ↔ კლემანის გეგმა',
  hitachi: 'ჰიტაჩი ↔ ჰიტაჩის გეგმა',
};

function RepPipelineDashboard({ projects, managers, planUsers, plans, year }: {
  projects: Project[]; managers: string[]; planUsers: RepRef[]; plans: SalesPlan[]; year: number;
}) {
  const [selected, setSelected] = useState<Set<ProbBucket>>(new Set(PROB_BUCKETS));
  const [metric, setMetric] = useState<Metric>('overall');
  const [weighted, setWeighted] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const toggle = (b: ProbBucket) => {
    const n = new Set(selected);
    if (n.has(b)) n.delete(b); else n.add(b);
    setSelected(n);
  };
  const live = projects.filter((p) => !isLost(p));
  const inScope = live.filter((p) => selected.has(bucketOf(p)));
  // შედარების თანხა: არჩეული მეტრიკა × გეგმაში გათვალისწინების % × (შეწონვისას) ალბათობა
  const amountOf = (p: Project) => factOf(p, metric) * shareOf(p) * (weighted ? probOf(p) : 1);
  const revOf = (p: Project) => (p.revenue || 0) * (weighted ? probOf(p) : 1);

  const planOf = (manager: string) => {
    const ids = planUsers.filter((u) => managerMatches(manager, u.name)).map((u) => u.id);
    return plans.filter((pl) => pl.year === year && pl.scope === metric && ids.includes(pl.salesPersonId))
      .reduce((a, pl) => a + pl.planUsd, 0);
  };

  const rows = managers.map((m) => {
    const list = inScope.filter((p) => p.manager === m);
    const bySize = [...PROJECT_SIZES, '—'].map((sz) => list.filter((p) => (sz === '—' ? !PROJECT_SIZES.includes(p.size as any) : p.size === sz)).length);
    const byBrand = BRAND_GROUPS.map((g) => list.filter((p) => brandGroupOf(p.brand) === g).reduce((a, p) => a + revOf(p), 0));
    const byBucket = Object.fromEntries(PROB_BUCKETS.map((b) => [b, list.filter((p) => bucketOf(p) === b).reduce((a, p) => a + amountOf(p), 0)]));
    const potential = list.reduce((a, p) => a + amountOf(p), 0);
    const plan = planOf(m);
    return { m, list, n: list.length, bySize, byBrand, byBucket, value: list.reduce((a, p) => a + (p.value || 0), 0), potential, plan };
  }).filter((r) => r.n > 0 || r.plan > 0);

  const tot = {
    n: rows.reduce((a, r) => a + r.n, 0),
    bySize: [0, 1, 2, 3].map((i) => rows.reduce((a, r) => a + r.bySize[i], 0)),
    byBrand: BRAND_GROUPS.map((_, i) => rows.reduce((a, r) => a + r.byBrand[i], 0)),
    value: rows.reduce((a, r) => a + r.value, 0),
    potential: rows.reduce((a, r) => a + r.potential, 0),
    plan: rows.reduce((a, r) => a + r.plan, 0),
  };
  const chartData = rows.map((r) => ({ name: r.m, 'გეგმა': Math.round(r.plan), ...Object.fromEntries(PROB_BUCKETS.map((b) => [b, Math.round(r.byBucket[b] as number)])) }));
  const th = 'px-2 py-2 font-medium text-right';
  const cov = (pot: number, plan: number) => plan > 0
    ? <span className={pot >= plan ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>{((pot / plan) * 100).toFixed(0)}%</span>
    : <span className="text-slate-300">—</span>;

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 space-y-3">
        <div>
          <h3 className="font-bold text-base text-slate-800 tracking-tight">წარმომადგენლების პაიპლაინი — პროექტები, ბრენდები, ალბათობა და გეგმა ({year})</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            წაგებული პროექტები არ ითვლება. გეგმასთან შედარება იყენებს „გეგმაში გათვალისწინების %"-ს. ალბათობა — ველი „ალბათობა (%)",
            ცარიელის შემთხვევაში საბოლოო სტატუსის საფეხური (&lt;50% = 30%).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-1">ალბათობა:</span>
          {PROB_BUCKETS.map((b) => (
            <button key={b} onClick={() => toggle(b)}
              className={'px-2.5 py-1 rounded-full text-xs border transition-colors ' + (selected.has(b) ? 'text-white border-transparent' : 'bg-white text-slate-400 border-slate-200')}
              style={selected.has(b) ? { backgroundColor: BUCKET_COLOR[b] } : undefined}>
              {b}
            </button>
          ))}
          <button onClick={() => setSelected(new Set(PROB_BUCKETS))} className="text-xs text-blue-600 hover:underline ml-1">ყველა</button>
          <button onClick={() => setSelected(new Set(['დაკონტრაქტებული', '90%', '80%', '70%', '60%'] as ProbBucket[]))} className="text-xs text-blue-600 hover:underline">60%+</button>
          <button onClick={() => setSelected(new Set(['90%', '80%', '70%', '60%', '50%', '<50%'] as ProbBucket[]))} className="text-xs text-blue-600 hover:underline">მხოლოდ პაიპლაინი</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-slate-500">შედარება გეგმასთან:</span>
          <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
            {(['overall', 'kleemann', 'hitachi'] as Metric[]).map((mt) => (
              <button key={mt} onClick={() => setMetric(mt)}
                className={'px-3 py-1 rounded-md ' + (metric === mt ? 'bg-white shadow-sm font-semibold text-slate-800' : 'text-slate-500')}>{METRIC_LABEL[mt]}</button>
            ))}
          </div>
          <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button onClick={() => setWeighted(false)} className={'px-3 py-1 rounded-md ' + (!weighted ? 'bg-white shadow-sm font-semibold text-slate-800' : 'text-slate-500')}>სრული თანხა</button>
            <button onClick={() => setWeighted(true)} className={'px-3 py-1 rounded-md ' + (weighted ? 'bg-white shadow-sm font-semibold text-slate-800' : 'text-slate-500')}>ალბათობით შეწონილი</button>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-4 border-b border-slate-100">
        <div><div className="text-xs text-slate-500">პროექტები</div><div className="text-2xl font-bold text-slate-800">{tot.n}</div></div>
        <div><div className="text-xs text-slate-500">სრული ღირებულება</div><div className="text-2xl font-bold text-slate-800">{usd0(tot.value)}</div></div>
        <div><div className="text-xs text-slate-500">პოტენციალი ({weighted ? 'შეწონილი' : 'სრული'})</div><div className="text-2xl font-bold text-amber-600">{usd0(tot.potential)}</div></div>
        <div><div className="text-xs text-slate-500">წლიური გეგმა · დაფარვა</div><div className="text-2xl font-bold text-slate-800">{usd0(tot.plan)} <span className="text-base">{cov(tot.potential, tot.plan)}</span></div></div>
      </div>

      {/* CHART */}
      <div className="px-6 pt-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: any) => usd0(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="გეგმა" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
            {PROB_BUCKETS.filter((b) => selected.has(b)).map((b) => (
              <Bar key={b} dataKey={b} stackId="pot" fill={BUCKET_COLOR[b]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-slate-50/80 text-slate-500 border-y border-slate-200 font-semibold">
            <tr>
              <th className="px-4 py-2 font-medium" rowSpan={2}>წარმომადგენელი</th>
              <th className="px-2 py-2 font-medium text-center border-l border-slate-200" colSpan={5}>პროექტები (ც.)</th>
              <th className="px-2 py-2 font-medium text-center border-l border-slate-200" colSpan={4}>შემოსავალი (მარჟა) ბრენდებით{weighted ? ' — შეწონილი' : ''}</th>
              <th className={th + ' border-l border-slate-200'} rowSpan={2}>სრული ღირებულება</th>
              <th className="px-2 py-2 font-medium text-center border-l border-slate-200 bg-blue-50/60" colSpan={4}>გეგმასთან შედარება</th>
            </tr>
            <tr>
              <th className={th + ' border-l border-slate-200'}>სულ</th>
              {PROJECT_SIZES.map((sz) => <th key={sz} className={th}>{sz}</th>)}
              <th className={th}>—</th>
              {BRAND_GROUPS.map((g, i) => <th key={g} className={th + (i === 0 ? ' border-l border-slate-200' : '')}>{g}</th>)}
              <th className={th + ' border-l border-slate-200 bg-blue-50/60'}>პოტენციალი</th>
              <th className={th + ' bg-blue-50/60'}>წლიური გეგმა</th>
              <th className={th + ' bg-blue-50/60'}>სხვაობა</th>
              <th className={th + ' bg-blue-50/60'}>დაფარვა</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <React.Fragment key={r.m}>
                <tr className="border-b border-slate-100 hover:bg-slate-50/80 cursor-pointer" onClick={() => setOpen(open === r.m ? null : r.m)}>
                  <td className="px-4 py-2 font-medium text-slate-800 border-r border-slate-200">
                    <span className="inline-block w-3 text-slate-400">{open === r.m ? '▾' : '▸'}</span> {r.m}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold">{r.n}</td>
                  {r.bySize.map((c, i) => <td key={i} className={'px-2 py-2 text-right ' + (i === 3 && c ? 'text-amber-600' : '')}>{c}</td>)}
                  {r.byBrand.map((v, i) => <td key={i} className={'px-2 py-2 text-right font-mono' + (i === 0 ? ' border-l border-slate-200' : '')}>{v ? usd0(v) : <span className="text-slate-300">—</span>}</td>)}
                  <td className="px-2 py-2 text-right font-mono border-l border-slate-200">{usd0(r.value)}</td>
                  <td className="px-2 py-2 text-right font-mono border-l border-slate-200 bg-blue-50/40 font-semibold">{usd0(r.potential)}</td>
                  <td className="px-2 py-2 text-right font-mono bg-blue-50/40 text-slate-500">{r.plan ? usd0(r.plan) : '—'}</td>
                  <td className="px-2 py-2 text-right font-mono bg-blue-50/40">{r.plan ? devCell(r.potential - r.plan) : '—'}</td>
                  <td className="px-2 py-2 text-right font-mono bg-blue-50/40">{cov(r.potential, r.plan)}</td>
                </tr>
                {open === r.m && (
                  <tr className="bg-slate-50/60">
                    <td colSpan={15} className="px-6 py-3">
                      <table className="w-full text-xs">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="text-left py-1 pr-3 font-medium">პროექტი</th>
                            <th className="text-left py-1 pr-3 font-medium">ზომა</th>
                            <th className="text-left py-1 pr-3 font-medium">ბრენდი</th>
                            <th className="text-left py-1 pr-3 font-medium">სტატუსი</th>
                            <th className="text-right py-1 pr-3 font-medium">ალბათობა</th>
                            <th className="text-right py-1 pr-3 font-medium">სრული ღირებულება</th>
                            <th className="text-right py-1 pr-3 font-medium">შემოსავალი</th>
                            <th className="text-right py-1 pr-3 font-medium">გეგმაში %</th>
                            <th className="text-right py-1 pr-3 font-medium">გეგმასთან შედარების თანხა</th>
                            <th className="text-left py-1 font-medium">კვ.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...r.list].sort((a, b) => amountOf(b) - amountOf(a)).map((p) => (
                            <tr key={p.id} className="border-t border-slate-200/60">
                              <td className="py-1 pr-3 font-medium text-slate-800 max-w-[260px] truncate" title={p.name}>{p.name}</td>
                              <td className="py-1 pr-3">{p.size || <span className="text-amber-500">—</span>}</td>
                              <td className="py-1 pr-3">{p.brand}</td>
                              <td className="py-1 pr-3">
                                <span className="px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: BUCKET_COLOR[bucketOf(p)] }}>{bucketOf(p)}</span>
                              </td>
                              <td className="py-1 pr-3 text-right">{Math.round(probOf(p) * 100)}%</td>
                              <td className="py-1 pr-3 text-right font-mono">{usd0(p.value || 0)}</td>
                              <td className="py-1 pr-3 text-right font-mono">{usd0(p.revenue || 0)}</td>
                              <td className="py-1 pr-3 text-right">{Math.round(shareOf(p) * 100)}%</td>
                              <td className="py-1 pr-3 text-right font-mono font-semibold">{usd0(amountOf(p))}</td>
                              <td className="py-1">{p.quarter}</td>
                            </tr>
                          ))}
                          {r.list.length === 0 && <tr><td colSpan={10} className="py-2 text-slate-400">არჩეული ალბათობებით პროექტი არ არის.</td></tr>}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {rows.length > 1 && (
              <tr className="bg-blue-100/50 font-bold text-slate-900 border-t-2 border-slate-200">
                <td className="px-4 py-2 border-r border-slate-200">ჯამი</td>
                <td className="px-2 py-2 text-right">{tot.n}</td>
                {tot.bySize.map((c, i) => <td key={i} className="px-2 py-2 text-right">{c}</td>)}
                {tot.byBrand.map((v, i) => <td key={i} className={'px-2 py-2 text-right font-mono' + (i === 0 ? ' border-l border-slate-200' : '')}>{usd0(v)}</td>)}
                <td className="px-2 py-2 text-right font-mono border-l border-slate-200">{usd0(tot.value)}</td>
                <td className="px-2 py-2 text-right font-mono border-l border-slate-200">{usd0(tot.potential)}</td>
                <td className="px-2 py-2 text-right font-mono">{usd0(tot.plan)}</td>
                <td className="px-2 py-2 text-right font-mono">{devCell(tot.potential - tot.plan)}</td>
                <td className="px-2 py-2 text-right font-mono">{cov(tot.potential, tot.plan)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PipelineSheet() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'dashboard2' | 'forma505'>('dashboard');
  const [filterYear, setFilterYear] = useState<string>('2026');
  const [filterQuarter, setFilterQuarter] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const { projects: allProjects, setProjects: setAllProjects, loading } = usePipelineProjects();
  const { isFull, role, actorName } = useAccessRole();
  // გაყიდვების წარმომადგენელი ხედავს მხოლოდ საკუთარ პროექტებს (მენეჯერი = ის).
  const isRep = !isFull && role === 'sales';
  // წაშლა და „წყაროს" მითითება — ფინანსები და კომერცია (მენეჯმენტი)
  const canManage = isFull || role === 'commercial';
  const rawProjects = useMemo(
    () => (isRep ? allProjects.filter((p: any) => managerMatches(p.manager, actorName)) : allProjects),
    [allProjects, isRep, actorName]
  );
  // ჩაწერისას დამალული (სხვისი) ჩანაწერები უცვლელად ბრუნდება სიაში — რომ არ წაიშალოს.
  const setProjects = useCallback((next: any[]) => {
    if (!isRep) { setAllProjects(next); return; }
    const visibleIds = new Set(rawProjects.map((p: any) => p.id));
    setAllProjects([...next, ...allProjects.filter((p: any) => !visibleIds.has(p.id))]);
  }, [isRep, rawProjects, allProjects, setAllProjects]);
  // მენეჯერები: არსებული ჩანაწერებიდან + „გაყიდვები" როლის მომხმარებლები (app_users)
  const [salesUsers, setSalesUsers] = useState<RepRef[]>([]);
  const salesNames = useMemo(() => salesUsers.map((u) => u.name), [salesUsers]);
  useEffect(() => {
    listUsers().then((us) => setSalesUsers(us.filter((u) => u.role === 'sales').map((u) => ({ id: u.id, name: u.name })))).catch(() => {});
  }, []);
  // გაყიდვების გეგმები (sales_plans) — წარმომადგენელი ხედავს მხოლოდ საკუთარს
  const [allPlans, setAllPlans] = useState<SalesPlan[]>([]);
  const [plansError, setPlansError] = useState(false);
  useEffect(() => {
    listSalesPlans().then(setAllPlans).catch((e) => { console.error('[pipeline] plans load failed', e); setPlansError(true); });
  }, []);
  const planReps = useMemo(
    () => (isRep ? salesUsers.filter((u) => u.name === actorName || managerMatches(actorName, u.name)) : salesUsers),
    [salesUsers, isRep, actorName]
  );
  const plans = useMemo(() => {
    const ids = new Set(planReps.map((r) => r.id));
    return allPlans.filter((p) => ids.has(p.salesPersonId));
  }, [allPlans, planReps]);
  const norms = usePipelineNorms();
  const managerOptions = useMemo(() => {
    const fromData = (rawProjects as any[]).map((p) => p.manager).filter(Boolean) as string[];
    if (isRep) {
      const mine = Array.from(new Set(fromData));
      return mine.length ? mine : [actorName];
    }
    const extra = salesNames.filter((n) => !fromData.some((m) => managerMatches(m, n)));
    return Array.from(new Set([...fromData, ...extra])).sort((a, b) => a.localeCompare(b));
  }, [rawProjects, salesNames, isRep, actorName]);
  const projects = useMemo(() => enrichProjectsWithHistory(rawProjects as Project[]), [rawProjects]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [formaSearch, setFormaSearch] = useState('');
  const [formaFilterManager, setFormaFilterManager] = useState('all');
  const [formaFilterQuarter, setFormaFilterQuarter] = useState('all');
  const [formaFilterStatus, setFormaFilterStatus] = useState('all');
  const [formaFilterSource, setFormaFilterSource] = useState('all');
  const [formaFilterSize, setFormaFilterSize] = useState('all');

  const filteredFormaProjects = useMemo(() => {
    return projects.filter(proj => {
      let match = true;
      if (formaFilterManager !== 'all' && proj.manager !== formaFilterManager) match = false;
      if (formaFilterQuarter !== 'all' && proj.quarter !== formaFilterQuarter) match = false;
      if (formaFilterStatus === 'grp_plus') { if (!isPlus(proj)) match = false; }
      else if (formaFilterStatus === 'grp_minus') { if (!isMinus(proj)) match = false; }
      else if (formaFilterStatus === 'lost') { if (!isLost(proj)) match = false; }
      else if (formaFilterStatus !== 'all' && proj.status !== formaFilterStatus) match = false;
      if (formaFilterSource === 'none') { if (proj.source) match = false; }
      else if (formaFilterSource !== 'all' && proj.source !== formaFilterSource) match = false;
      if (formaFilterSize === 'none') { if (proj.size) match = false; }
      else if (formaFilterSize !== 'all' && proj.size !== formaFilterSize) match = false;
      if (formaSearch.trim() !== '') {
        const lowerSearch = formaSearch.toLowerCase();
        const searchString = `${proj.name} ${proj.location} ${proj.comment} ${proj.brand} ${proj.product}`.toLowerCase();
        if (!searchString.includes(lowerSearch)) match = false;
      }
      return match;
    });
  }, [projects, formaSearch, formaFilterManager, formaFilterQuarter, formaFilterStatus, formaFilterSource, formaFilterSize]);

  const removeRow = (id: string) => {
    if(window.confirm('ნამდვილად გსურთ წაშლა? ჩანაწერი სანაგვეში გადავა.')) {
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
                // თარიღი არ აქვს (ფორმა 505 — მიმდინარე წლის პაიპლაინი) → მიმდინარე წელი
                let y = String(new Date().getFullYear());
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
              // გეგმა — sales_plans-იდან (არჩეული წლის); თუ გეგმა არ არის შეყვანილი, ძველი ნორმატივი
              const planYear = filterYear === 'all' ? new Date().getFullYear() : Number(filterYear);
              const planQ = (qi: number, scope: PlanScope) =>
                plans.filter((pl) => pl.year === planYear && pl.quarter === qi && pl.scope === scope).reduce((a, pl) => a + pl.planUsd, 0);
              const hasPlanOverall = [1, 2, 3, 4].some((qi) => planQ(qi, 'overall') > 0);
              const hasPlanKlee = [1, 2, 3, 4].some((qi) => planQ(qi, 'kleemann') > 0);
              const qPlanOverall = (qi: number) => (hasPlanOverall ? planQ(qi, 'overall') : 140000);
              const qPlanKlee = (qi: number) => (hasPlanKlee ? planQ(qi, 'kleemann') : 260000);
              const qSel = filterQuarter === 'all' ? [1, 2, 3, 4] : [Number(filterQuarter.slice(1))];

              const totalRevenue = dashProjects.filter(p => p.status === 'დაკონტრაქტებული').reduce((sum, p) => sum + (p.revenue || 0), 0);
              const targetRevenue = qSel.reduce((a, qi) => a + qPlanOverall(qi), 0);
              const revenuePct = targetRevenue ? totalRevenue / targetRevenue : 0;

              const totalKleemann = dashProjects.filter(p => p.status === 'დაკონტრაქტებული').reduce((sum, p) => sum + (p.kleemannValue || 0), 0);
              const targetKleemann = qSel.reduce((a, qi) => a + qPlanKlee(qi), 0);
              const kleemannPct = targetKleemann ? totalKleemann / targetKleemann : 0;

              const totalPot60Plus = dashProjects.filter(p => isPlus(p)).reduce((sum, p) => sum + (p.revenue || 0), 0);
              
              const formatDol = (num: number) => num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
              const formatCol = (val: number) => <span className={val >= 0 ? "text-emerald-600 font-medium" : "text-rose-500 font-medium"}>{val > 0 ? '+' : ''}{formatDol(val)}</span>;
              const formatColPct = (val: number) => <span className={val >= 1 ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>{formatPct(val)}</span>;

              // Trend data for charts
              const trendData = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
                 let fact = Math.round(annualProjects.filter(p => p.quarter === q && p.status === 'დაკონტრაქტებული').reduce((s, p) => s + (p.revenue || 0), 0));
                 let kleeFact = Math.round(annualProjects.filter(p => p.quarter === q && p.status === 'დაკონტრაქტებული').reduce((s, p) => s + (p.kleemannValue || 0), 0));
                 const qi = Number(q.slice(1));
                 return { name: q, 'საერთო ფაქტი': fact, 'კლემანი ფაქტი': kleeFact, 'საერთო გეგმა': qPlanOverall(qi), 'კლემანი გეგმა': qPlanKlee(qi) };
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
                    
                    {/* წარმომადგენლების გეგმა/შესრულება — კვარტალური და ნაზარდი */}
                    <RepPlanTable projects={projects} plans={plans} plansError={plansError} reps={planReps} year={planYear} />

                    {/* მუშა პროექტები ზომის მიხედვით */}
                    <WorkingBySizeTable projects={projects} reps={managerOptions} norms={norms} />

                    {/* Quarterly Overalls */}
                    {(() => {
                      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
                      const qData = quarters.map((q) => {
                        const planTotal = qPlanOverall(Number(q.slice(1)));
                        const planKleemann = qPlanKlee(Number(q.slice(1)));
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

            {/* წარმომადგენლების პაიპლაინი — ზომა / ბრენდი / ალბათობა vs გეგმა */}
            <RepPipelineDashboard
              projects={projects}
              managers={managerOptions}
              planUsers={planReps}
              plans={plans}
              year={new Date().getFullYear()}
            />
            
            {(() => {
              // DATA PREP FOR FUNNEL
              const reps = managerOptions;
              
              const funnelData = reps.map(rep => {
                const repProj = projects.filter(p => managerMatches(p.manager, rep));
                
                // Funnel counts
                const registered = repProj.length;
                const inProgress = repProj.filter(p => isPlus(p) || isMinus(p) || p.statusDetail === 'წარმოება').length;
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
                const sk = isLost(p) ? "წაგებული" : p.status;
                statusCounts[sk] = (statusCounts[sk] || 0) + 1;
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
                  <option value="grp_plus">პოტ. 60%+ (ჯამი)</option>
                  <option value="grp_minus">პოტ. 60%- (ჯამი)</option>
                  <option value="lost">წაგებული</option>
                  {FINAL_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
                <select 
                  value={formaFilterSource} 
                  onChange={(e) => setFormaFilterSource(e.target.value)}
                  className=" border border-slate-200 bg-slate-50 hover:bg-white text-slate-700 text-xs rounded-md shadow-sm px-2 py-1.5 focus:outline-none focus:border-slate-400 appearance-none"
                >
                  <option value="all">ყველა წყარო</option>
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="none">მიუთითებელი</option>
                </select>
                <select 
                  value={formaFilterSize} 
                  onChange={(e) => setFormaFilterSize(e.target.value)}
                  className=" border border-slate-200 bg-slate-50 hover:bg-white text-slate-700 text-xs rounded-md shadow-sm px-2 py-1.5 focus:outline-none focus:border-slate-400 appearance-none"
                >
                  <option value="all">ყველა ზომა</option>
                  {PROJECT_SIZES.map((sz) => <option key={sz} value={sz}>{sz}</option>)}
                  <option value="none">ზომა მიუთითებელი</option>
                </select>
                <button 
                  onClick={() => {
                    setIsModalOpen(true);
                    setEditingId(null);
                    // ცარიელი ფორმა — ყველა ველს შემყვანი ავსებს
                    setFormData({});
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
                    <th className="px-3 py-2 font-medium sticky left-0 z-20 bg-slate-50 border-r border-slate-200 min-w-[200px]">პროექტის დასახელება</th>
                    <th className="px-3 py-2 font-medium">პროდუქტი</th>
                    <th className="px-3 py-2 font-medium">ზომა</th>
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
                    <th className="px-3 py-2 font-medium">წყარო</th>
                    <th className="px-3 py-2 font-medium text-center" title="გეგმაში გათვალისწინების %">გეგმაში %</th>
                    <th className="px-3 py-2 font-medium">მიმდინარე სტატუსი</th>
                    <th className="px-3 py-2 font-medium">საბოლოო სტატუსი</th>
                    <th className="px-3 py-2 font-medium">დაკონტრაქტების თარიღი</th>
                    <th className="px-3 py-2 font-medium text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {filteredFormaProjects.map((proj) => (
                    <tr key={proj.id} className={"group border-b border-slate-100 bg-white hover:bg-slate-50/80 transition-colors" + (isLost(proj) ? " opacity-50 line-through" : "")}>
                      <td className="px-3 py-1.5 truncate max-w-[220px] min-w-[200px] sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 font-medium" title={proj.name}>{proj.name}</td>
                      <td className="px-3 py-1.5">{proj.product || ''}</td>
                      <td className="px-3 py-1.5">{proj.size || <span className="text-amber-500">—</span>}</td>
                      <td className="px-3 py-1.5">{proj.brand}</td>
                      <td className="px-3 py-1.5 text-center">{proj.units}</td>
                      <td className="px-3 py-1.5 text-center">{proj.floors || ''}</td>
                      <td className="px-3 py-1.5 text-center">{proj.contractDuration || ''}</td>
                      <td className="px-3 py-1.5">{proj.location || ''}</td>
                      <td className="px-3 py-1.5">{proj.currency || ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-500">{proj.kleemannValue ? proj.kleemannValue.toLocaleString() : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-500">{proj.hitachiValue ? proj.hitachiValue.toLocaleString() : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-emerald-600">{proj.value ? proj.value.toLocaleString() : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-emerald-600">{proj.revenue ? proj.revenue.toLocaleString() : ''}</td>
                      <td className="px-3 py-1.5 text-center">{proj.tranche1 ? proj.tranche1 + '%' : ''}</td>
                      <td className="px-3 py-1.5">{proj.deliveryMonth || ''}</td>
                      <td className="px-3 py-1.5 text-center">{proj.probability ? proj.probability + '%' : ''}</td>
                      <td className="px-3 py-1.5 truncate max-w-[150px]" title={proj.comment}>{proj.comment || ''}</td>
                      <td className="px-3 py-1.5">{proj.quarter}</td>
                      <td className="px-3 py-1.5">{proj.manager}</td>
                      <td className="px-3 py-1.5">
                        {proj.source === 'მენეჯმენტის გადაცემული'
                          ? <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">{proj.source}</span>
                          : proj.source
                            ? <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{proj.source}</span>
                            : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {Number(proj.planShare) > 0 && Number(proj.planShare) < 100
                          ? <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800">{proj.planShare}%</span>
                          : <span className="text-slate-400">100%</span>}
                      </td>
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
                        {canManage && <button 
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
          lockedKeys={canManage ? [] : ['source', 'planShare']}
          brandOptions={Array.from(new Set(projects.map((p: any) => p.brand).filter(Boolean))).sort()}
          locationOptions={Array.from(new Set(projects.map((p: any) => p.location).filter(Boolean))).sort()}
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