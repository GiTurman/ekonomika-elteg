import { useEffect, useMemo, useState } from "react";
import { listArchiveFull, type ArchiveEntryFull } from "@/lib/archive";
import { computeEconomics } from "@/lib/econ-calc";
import { normalizeAppState } from "@/lib/econ-defaults";
import { useAccessRole } from "@/components/AccessGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, ChevronDown, X } from "lucide-react";
import { fmtUsd, fmtPct, computedCls } from "./sheet-ui";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from "recharts";

// მარჟის ფერის სკალა: დაბალი მარჟა → წითელი/ნარინჯისფერი, მაღალი → მწვანე
function marginColor(pct: number): string {
  if (pct >= 0.20) return "#16a34a";   // emerald-600
  if (pct >= 0.14) return "#65a30d";   // lime-600
  if (pct >= 0.08) return "#d97706";   // amber-600
  return "#dc2626";                     // red-600
}

// ბრენდის სახელები ხშირად სხვადასხვა რეგისტრში შედის ("KLEEMANN" vs "Kleemann"),
// ან ვარიაციით ("Hitach" vs "Hitachi"), რაც ჯგუფვისას მათ სხვადასხვა ბრენდად
// აქცევდა (ორი ცალკე ბარი ერთი ბრენდისთვის). ჯერ ვასწორებთ ცნობილ ვარიაციებს
// (alias), მერე ვნორმალიზებთ ერთიან "Title Case" ფორმაში — მხოლოდ ანალიტიკის
// ჯგუფვისა და ჩვენებისთვის. საწყისი მონაცემი (არქივი/მიმდინარე პროექტი) უცვლელი რჩება.
//
// ცნობილი ვარიაციები → კანონიკური სახელი (substring-ით: kleemann/hitach/fuji):

function normalizeBrand(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const low = trimmed.toLowerCase();
  if (low.includes("kleemann")) return "Kleemann";
  if (low.includes("hitach")) return "Hitachi";
  if (low.includes("fuji")) return "Fuji";
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

interface UnitRecord {
  projectName: string;
  projectDate: string;
  unitId: string;
  brand: string;
  kind: string;
  floors: number;
  purchaseCost: number;
  installCost: number;
  markup: number;
  priceNoVat: number;
  finalPrice: number; // გასაყიდი ფასი, დღგ-ს ჩათვლით
  marginPct: number;      // "სუფთა" მარჟა, დღგ-ს გარეშე ბაზაზე — მხოლოდ ფინანსებისთვის
  grossMarginPct: number; // მარჟა დღგ-ჩართული ბაზით (ყოველთვის ნაკლები) — ფინანსების გარდა ყველასთვის
}

type GroupBy = "project" | "unit" | "project_brand" | "brand_kind" | "brand" | "floor_project_brand";

const GROUP_LABELS: Record<GroupBy, string> = {
  project: "პროექტი — ჯამური მომგებიანობა",
  unit: "დანადგარი — თითოეულის მომგებიანობა",
  project_brand: "პროექტი + ბრენდი",
  brand_kind: "ბრენდი + დანადგარის ტიპი",
  brand: "ბრენდი — ჯამურად",
  floor_project_brand: "სართული + პროექტი + ბრენდი",
};

function MultiSelect({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: Set<string>; onChange: (s: Set<string>) => void;
}) {
  const allSelected = selected.size === 0;
  const toggle = (opt: string) => {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt); else next.add(opt);
    onChange(next);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-between min-w-[140px]">
          <span className="truncate">{label}{!allSelected && ` (${selected.size})`}</span>
          <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 max-h-80 overflow-y-auto p-2" align="start">
        <div className="flex items-center justify-between mb-1 px-1">
          <span className="text-xs text-muted-foreground">{options.length} ვარიანტი</span>
          {!allSelected && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onChange(new Set())}>გასუფთავება</Button>
          )}
        </div>
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 px-1 py-1.5 text-sm hover:bg-muted/50 rounded cursor-pointer">
            <Checkbox checked={allSelected || selected.has(opt)} onCheckedChange={() => toggle(opt)} />
            <span className="truncate">{opt}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function AnalyticsSheet({ mode = "final" }: { mode?: "final" | "working" }) {
  const { isFull } = useAccessRole();
  const [entries, setEntries] = useState<ArchiveEntryFull[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [groupBy, setGroupBy] = useState<GroupBy>("project");
  const [selProjects, setSelProjects] = useState<Set<string>>(new Set());
  const [selBrands, setSelBrands] = useState<Set<string>>(new Set());
  const [selKinds, setSelKinds] = useState<Set<string>>(new Set());
  const [floorRange, setFloorRange] = useState<[number, number] | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listArchiveFull());
    } catch (e) {
      console.error("[analytics] load failed", e);
      setError("არქივის მონაცემების ჩატვირთვა ვერ მოხერხდა.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const allUnits: UnitRecord[] = useMemo(() => {
    const out: UnitRecord[] = [];
    for (const entry of entries) {
      // "ანალიტიკა" (final) — მხოლოდ ანალიტიკაში ჩართული (მონიშნული) პროექტები.
      // "ანალიტიკა მუშა" (working) — მხოლოდ მოუნიშნავი (ჯერ არ ჩართული) პროექტები.
      if (mode === "final" && !entry.include_in_analytics) continue;
      if (mode === "working" && entry.include_in_analytics) continue;
      let eco;
      try {
        eco = computeEconomics(normalizeAppState(entry.data));
      } catch (e) {
        console.error("[analytics] compute failed for", entry.id, e);
        continue;
      }
      entry.data.project.units.forEach((u, i) => {
        const row = eco.units[i];
        if (!row) return;
        out.push({
          projectName: entry.name,
          projectDate: entry.created_at,
          unitId: u.id || "?",
          brand: normalizeBrand(u.brand || "") || "სხვა",
          kind: (u.kind || "").trim() || "სხვა",
          floors: u.floors,
          purchaseCost: row.purchaseCost,
          installCost: row.installCost,
          markup: row.markup,
          priceNoVat: row.priceNoVat,
          finalPrice: row.finalPrice,
          marginPct: row.marginPct,
          grossMarginPct: row.finalPrice ? row.markup / row.finalPrice : 0,
        });
      });
    }
    return out;
  }, [entries, mode]);

  const projectOptions = useMemo(() => Array.from(new Set(allUnits.map((u) => u.projectName))).sort(), [allUnits]);
  const brandOptions = useMemo(() => Array.from(new Set(allUnits.map((u) => u.brand))).sort(), [allUnits]);
  const kindOptions = useMemo(() => Array.from(new Set(allUnits.map((u) => u.kind))).sort(), [allUnits]);
  const floorBounds = useMemo(() => {
    if (allUnits.length === 0) return [0, 1] as [number, number];
    const floors = allUnits.map((u) => u.floors);
    return [Math.min(...floors), Math.max(...floors)] as [number, number];
  }, [allUnits]);

  const effectiveFloorRange = floorRange ?? floorBounds;

  const filtered = useMemo(() => {
    return allUnits.filter((u) =>
      (selProjects.size === 0 || selProjects.has(u.projectName)) &&
      (selBrands.size === 0 || selBrands.has(u.brand)) &&
      (selKinds.size === 0 || selKinds.has(u.kind)) &&
      u.floors >= effectiveFloorRange[0] && u.floors <= effectiveFloorRange[1]
    );
  }, [allUnits, selProjects, selBrands, selKinds, effectiveFloorRange]);

  const activeFilterCount = selProjects.size + selBrands.size + selKinds.size + (floorRange ? 1 : 0);
  const clearAllFilters = () => {
    setSelProjects(new Set()); setSelBrands(new Set()); setSelKinds(new Set()); setFloorRange(null);
  };

  const keyFn = (u: UnitRecord): { key: string; label: string } => {
    switch (groupBy) {
      case "project": return { key: u.projectName, label: u.projectName };
      case "unit": return { key: `${u.projectName}::${u.unitId}`, label: `${u.projectName} — ${u.unitId}` };
      case "project_brand": return { key: `${u.projectName}::${u.brand}`, label: `${u.projectName} / ${u.brand}` };
      case "brand_kind": return { key: `${u.brand}::${u.kind}`, label: `${u.brand} / ${u.kind}` };
      case "brand": return { key: u.brand, label: u.brand };
      case "floor_project_brand": return { key: `${u.floors}::${u.projectName}::${u.brand}`, label: `${u.floors} სართ. / ${u.projectName} / ${u.brand}` };
    }
  };

  const groupedRows = useMemo(() => {
    const map = new Map<string, { label: string; count: number; floorsSum: number; purchase: number; install: number; markup: number; costNet: number; finalPriceSum: number; marginSum: number }>();
    for (const u of filtered) {
      const { key, label } = keyFn(u);
      const cur = map.get(key) ?? { label, count: 0, floorsSum: 0, purchase: 0, install: 0, markup: 0, costNet: 0, finalPriceSum: 0, marginSum: 0 };
      cur.count += 1;
      cur.floorsSum += u.floors;
      cur.purchase += u.purchaseCost;
      cur.install += u.installCost;
      cur.markup += u.markup;
      cur.costNet += isFull ? u.priceNoVat : u.finalPrice;
      cur.finalPriceSum += u.finalPrice;
      cur.marginSum += isFull ? u.marginPct : u.grossMarginPct;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, avgMarginPct: v.count ? v.marginSum / v.count : 0 }))
      .sort((a, b) => b.costNet - a.costNet);
  }, [filtered, groupBy, isFull]);

  // ბრენდების მომგებიანობა — ყოველთვის ჩანს, მიმდინარე ფილტრების გათვალისწინებით,
  // დამოუკიდებელი მთავარი "დაჯგუფება" არჩევანისგან
  const brandProfitability = useMemo(() => {
    const map = new Map<string, { count: number; costNet: number; markup: number; marginWeightSum: number }>();
    for (const u of filtered) {
      const cur = map.get(u.brand) ?? { count: 0, costNet: 0, markup: 0, marginWeightSum: 0 };
      const value = isFull ? u.priceNoVat : u.finalPrice;
      const margin = isFull ? u.marginPct : u.grossMarginPct;
      cur.count += 1;
      cur.costNet += value;
      cur.markup += u.markup;
      cur.marginWeightSum += margin * value;
      map.set(u.brand, cur);
    }
    return Array.from(map.entries())
      .map(([brand, v]) => ({
        brand,
        count: v.count,
        costNet: v.costNet,
        markup: v.markup,
        marginPct: v.costNet ? v.marginWeightSum / v.costNet : 0,
      }))
      .sort((a, b) => b.marginPct - a.marginPct);
  }, [filtered, isFull]);

  const totals = useMemo(() => {
    const units = filtered.length;
    const floors = filtered.reduce((s, u) => s + u.floors, 0);
    const costNet = filtered.reduce((s, u) => s + (isFull ? u.priceNoVat : u.finalPrice), 0);
    const finalPriceSum = filtered.reduce((s, u) => s + u.finalPrice, 0);
    const markupSum = filtered.reduce((s, u) => s + u.markup, 0);
    const marginWeighted = costNet
      ? filtered.reduce((s, u) => s + (isFull ? u.marginPct : u.grossMarginPct) * (isFull ? u.priceNoVat : u.finalPrice), 0) / costNet
      : 0;
    const projects = new Set(filtered.map((u) => u.projectName)).size;
    return { units, floors, costNet, finalPriceSum, markupSum, marginWeighted, projects };
  }, [filtered, isFull]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {mode === "working"
            ? "მუშა დაშბორდი — არქივში შენახული, ანალიტიკაში ჯერ არ ჩართული (მოუნიშნავი) პროექტების მონაცემებზე."
            : "დაშბორდი აგებულია არქივში შენახული, ანალიტიკაში ჩართული პროექტების მონაცემებზე."}
          {isFull ? " ხედვა: სუფთა ფინანსური (დღგ-ს გარეშე)." : " ხედვა: დღგ-ს ჩათვლით."}
        </p>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          განახლება
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> იტვირთება…
        </div>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">არქივი ცარიელია — ჯერ არცერთი პროექტი არ არის დასრულებული/შენახული.</p>
      ) : (
        <>
          {/* Summary dashboard — ჯამური KPI + ბრენდის ჭრილი */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">პროექტები</div>
              <div className="text-xl font-semibold tabular-nums">{totals.projects}</div>
              <div className="text-xs text-muted-foreground">{totals.units} დანადგარი</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{isFull ? "ფასი (დღგ-ს გარეშე)" : "გასაყიდი ფასი"}</div>
              <div className={"text-xl font-semibold " + computedCls}>{fmtUsd(totals.costNet)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">ჯამური მარჟა (თანხა)</div>
              <div className={"text-xl font-semibold " + linkedCls}>{fmtUsd(totals.markupSum)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">საშ. მარჟა %</div>
              <div className="text-xl font-semibold tabular-nums">{fmtPct(totals.marginWeighted)}</div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">ბრენდის ჭრილი</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ბრენდი</TableHead>
                    <TableHead className="text-right">დანადგარი</TableHead>
                    <TableHead className="text-right">{isFull ? "ფასი (დღგ-ს გარეშე)" : "ფასი"}</TableHead>
                    <TableHead className="text-right">მარჟა (თანხა)</TableHead>
                    <TableHead className="text-right">მარჟა %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brandProfitability.map((b) => (
                    <TableRow key={b.brand}>
                      <TableCell className="font-medium">{b.brand}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.count}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{fmtUsd(b.costNet)}</TableCell>
                      <TableCell className={"text-right " + linkedCls}>{fmtUsd(b.markup)}</TableCell>
                      <TableCell className="text-right tabular-nums" style={{ color: marginColor(b.marginPct) }}>{fmtPct(b.marginPct)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold border-t-2 bg-muted/30">
                    <TableCell>სულ</TableCell>
                    <TableCell className="text-right tabular-nums">{totals.units}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtUsd(totals.costNet)}</TableCell>
                    <TableCell className={"text-right " + linkedCls}>{fmtUsd(totals.markupSum)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(totals.marginWeighted)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <MultiSelect label="პროექტი" options={projectOptions} selected={selProjects} onChange={setSelProjects} />
                <MultiSelect label="ბრენდი" options={brandOptions} selected={selBrands} onChange={setSelBrands} />
                <MultiSelect label="ტიპი" options={kindOptions} selected={selKinds} onChange={setSelKinds} />
                <div className="flex items-center gap-2 min-w-[220px] px-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">სართ. {effectiveFloorRange[0]}–{effectiveFloorRange[1]}</span>
                  <Slider
                    className="w-32"
                    min={floorBounds[0]} max={floorBounds[1]} step={1}
                    value={effectiveFloorRange}
                    onValueChange={(v) => setFloorRange([v[0], v[1]])}
                  />
                </div>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-8 text-xs">
                    <X className="h-3 w-3 mr-1" /> ფილტრების გასუფთავება ({activeFilterCount})
                  </Button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">დაჯგუფება:</span>
                  <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                    <SelectTrigger className="w-64 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(GROUP_LABELS) as GroupBy[]).map((g) => (
                        <SelectItem key={g} value={g}>{GROUP_LABELS[g]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(selProjects.size > 0 || selBrands.size > 0 || selKinds.size > 0) && (
                <div className="flex flex-wrap gap-1">
                  {Array.from(selProjects).map((p) => (
                    <Badge key={"p" + p} variant="secondary" className="text-xs cursor-pointer" onClick={() => { const s = new Set(selProjects); s.delete(p); setSelProjects(s); }}>
                      {p} <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                  {Array.from(selBrands).map((b) => (
                    <Badge key={"b" + b} variant="secondary" className="text-xs cursor-pointer" onClick={() => { const s = new Set(selBrands); s.delete(b); setSelBrands(s); }}>
                      {b} <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                  {Array.from(selKinds).map((k) => (
                    <Badge key={"k" + k} variant="secondary" className="text-xs cursor-pointer" onClick={() => { const s = new Set(selKinds); s.delete(k); setSelKinds(s); }}>
                      {k} <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* KPIs reflect current filter */}
          <div className={"grid grid-cols-2 gap-2 " + (isFull ? "md:grid-cols-6" : "md:grid-cols-5")}>
            <Kpi label="პროექტები" value={String(totals.projects)} />
            <Kpi label="დანადგარები" value={String(totals.units)} />
            <Kpi label="ჯამური სართული" value={String(totals.floors)} />
            <Kpi label={isFull ? "ჯამური ღირებულება (დღგ-ს გარეშე)" : "ჯამური ღირებულება (დღგ-ს ჩათვლით)"} value={fmtUsd(totals.costNet)} />
            {isFull && <Kpi label="გასაყიდი ფასი (დღგ-ს ჩათვლით)" value={fmtUsd(totals.finalPriceSum)} />}
            <Kpi label="საშუალო მარჟა (შეწონილი)" value={fmtPct(totals.marginWeighted)} />
          </div>

          {/* Brand profitability — always visible, independent of Group-by selection */}
          <Card>
            <CardHeader>
              <CardTitle>ბრენდების მომგებიანობა (მარჟა %)</CardTitle>
              <p className="text-xs text-muted-foreground">დალაგებულია მარჟის კლებადობით — ფერი გვიჩვენებს დონეს (მწვანე = მაღალი, წითელი = დაბალი)</p>
            </CardHeader>
            <CardContent>
              <div style={{ height: Math.max(220, brandProfitability.length * 34) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={brandProfitability} layout="vertical" margin={{ left: 8, right: 36, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="brand" width={110} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      formatter={(v: number, key: string) => key === "marginPct" ? [fmtPct(v), "მარჟა"] : [fmtUsd(v), key]}
                      labelFormatter={(label) => label}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="marginPct" radius={[0, 4, 4, 0]}>
                      {brandProfitability.map((r) => (
                        <Cell key={r.brand} fill={marginColor(r.marginPct)} />
                      ))}
                      <LabelList dataKey="marginPct" position="right" formatter={(v: number) => fmtPct(v)} fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Grouped report */}
          <Card>
            <CardHeader><CardTitle>{GROUP_LABELS[groupBy]} ({groupedRows.length} row)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {groupedRows.length > 1 && (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={groupedRows.slice(0, 12).map((r) => ({ name: r.label.length > 20 ? r.label.slice(0, 20) + "…" : r.label, ღირებულება: Math.round(r.costNet), მარჟა: r.avgMarginPct }))}
                      margin={{ top: 20, right: 8, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" fontSize={10} angle={-25} textAnchor="end" height={64} interval={0} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        formatter={(v: number, key: string) => key === "ღირებულება" ? [fmtUsd(v), "ღირებულება"] : [v, key]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Bar dataKey="ღირებულება" radius={[4, 4, 0, 0]}>
                        {groupedRows.slice(0, 12).map((r) => (
                          <Cell key={r.key} fill={marginColor(r.avgMarginPct)} />
                        ))}
                        <LabelList dataKey="მარჟა" position="top" formatter={(v: number) => fmtPct(v)} fontSize={10} fill="hsl(var(--muted-foreground))" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>{groupBy === "unit" ? "პროექტი / დანადგარი" : "ჯგუფი"}</TableHead>
                      <TableHead className="text-right">რაოდ.</TableHead>
                      <TableHead className="text-right">სართ. ჯამი</TableHead>
                      <TableHead className="text-right">შესყ.+მონტ. თვითღ.</TableHead>
                      <TableHead className="text-right">ჯამური ფასნამატი</TableHead>
                      <TableHead className="text-right">{isFull ? "ღირებულება (დღგ-ს გარეშე)" : "ღირებულება (დღგ-ს ჩათვლით)"}</TableHead>
                      {isFull && <TableHead className="text-right">გასაყიდი ფასი (დღგ-ს ჩათვლით)</TableHead>}
                      <TableHead className="text-right">საშ. მარჟა %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedRows.map((r, i) => (
                      <TableRow key={r.key} className={i % 2 === 1 ? "bg-muted/30" : ""}>
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell className={"text-right " + computedCls}>{r.count}</TableCell>
                        <TableCell className={"text-right " + computedCls}>{r.floorsSum}</TableCell>
                        <TableCell className={"text-right " + computedCls}>{fmtUsd(r.purchase + r.install)}</TableCell>
                        <TableCell className={"text-right " + computedCls}>{fmtUsd(r.markup)}</TableCell>
                        <TableCell className={"text-right " + computedCls}>{fmtUsd(r.costNet)}</TableCell>
                        {isFull && <TableCell className={"text-right " + computedCls}>{fmtUsd(r.finalPriceSum)}</TableCell>}
                        <TableCell className="text-right">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: marginColor(r.avgMarginPct) }} />
                            <span className={computedCls}>{fmtPct(r.avgMarginPct)}</span>
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm md:text-base font-semibold font-mono">{value}</div>
      </CardContent>
    </Card>
  );
}
