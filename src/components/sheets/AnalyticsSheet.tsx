import { useEffect, useMemo, useState } from "react";
import { listArchiveFull, type ArchiveEntryFull } from "@/lib/archive";
import { computeEconomics } from "@/lib/econ-calc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { fmtUsd, fmtPct, computedCls } from "./sheet-ui";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface ProjectRow {
  id: string;
  name: string;
  date: string;
  unitsCount: number;
  floorsSum: number;
  costNet: number; // ფასი დღგ-ს გარეშე
  marginPct: number;
  checkDiff: number;
}

interface UnitTypeRow {
  prefix: string;
  count: number;
  floorsSum: number;
  avgFloors: number;
  costNet: number; // ჯამური თვითღირებულება+ფასნამატი (დღგ-ს გარეშე)
  avgFactoryPrice: number;
  avgMarginPct: number;
}

interface FloorRow {
  floors: number;
  count: number;
  costNet: number;
  avgCostPerUnit: number;
}

const KIND_LABEL: Record<string, string> = { L: "ლიფტი", E: "ესკალატორი", P: "პლატფორმა" };

export function AnalyticsSheet() {
  const [entries, setEntries] = useState<ArchiveEntryFull[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const { projectRows, unitTypeRows, floorRows, totals } = useMemo(() => {
    const projectRows: ProjectRow[] = [];
    const unitTypeMap = new Map<string, { count: number; floorsSum: number; costNet: number; factorySum: number; marginSum: number }>();
    const floorMap = new Map<number, { count: number; costNet: number }>();

    let totalUnits = 0;
    let totalFloors = 0;
    let totalCostNet = 0;
    let marginWeightedSum = 0;

    for (const entry of entries) {
      let eco;
      try {
        eco = computeEconomics(entry.data);
      } catch (e) {
        console.error("[analytics] compute failed for", entry.id, e);
        continue;
      }
      const unitsCount = eco.units.length;
      const floorsSum = eco.units.reduce((s, u) => s + u.floors, 0);

      projectRows.push({
        id: entry.id,
        name: entry.name,
        date: entry.created_at,
        unitsCount,
        floorsSum,
        costNet: eco.report.priceNoVat,
        marginPct: eco.report.totalMarginPct,
        checkDiff: eco.report.checkDiff,
      });

      totalUnits += unitsCount;
      totalFloors += floorsSum;
      totalCostNet += eco.report.priceNoVat;
      marginWeightedSum += eco.report.totalMarginPct * eco.report.priceNoVat;

      entry.data.project.units.forEach((u, i) => {
        if (!u.id || !u.id.trim()) return;
        const prefix = (u.id.match(/^[A-Za-z]+/)?.[0] ?? "სხვა").toUpperCase();
        const row = eco.units[i];
        const cur = unitTypeMap.get(prefix) ?? { count: 0, floorsSum: 0, costNet: 0, factorySum: 0, marginSum: 0 };
        cur.count += 1;
        cur.floorsSum += u.floors;
        cur.costNet += row ? row.priceNoVat : 0;
        cur.factorySum += u.factoryPrice;
        cur.marginSum += row ? row.marginPct : 0;
        unitTypeMap.set(prefix, cur);

        const fCur = floorMap.get(u.floors) ?? { count: 0, costNet: 0 };
        fCur.count += 1;
        fCur.costNet += row ? row.priceNoVat : 0;
        floorMap.set(u.floors, fCur);
      });
    }

    const unitTypeRows: UnitTypeRow[] = Array.from(unitTypeMap.entries())
      .map(([prefix, v]) => ({
        prefix,
        count: v.count,
        floorsSum: v.floorsSum,
        avgFloors: v.count ? v.floorsSum / v.count : 0,
        costNet: v.costNet,
        avgFactoryPrice: v.count ? v.factorySum / v.count : 0,
        avgMarginPct: v.count ? v.marginSum / v.count : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const floorRows: FloorRow[] = Array.from(floorMap.entries())
      .map(([floors, v]) => ({
        floors,
        count: v.count,
        costNet: v.costNet,
        avgCostPerUnit: v.count ? v.costNet / v.count : 0,
      }))
      .sort((a, b) => a.floors - b.floors);

    return {
      projectRows: projectRows.sort((a, b) => (a.date < b.date ? 1 : -1)),
      unitTypeRows,
      floorRows,
      totals: {
        projects: projectRows.length,
        units: totalUnits,
        floors: totalFloors,
        costNet: totalCostNet,
        avgMargin: totalCostNet ? marginWeightedSum / totalCostNet : 0,
      },
    };
  }, [entries]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          დაშბორდი აგებულია არქივში შენახული ყველა დასრულებული პროექტის მონაცემებზე (დღგ-ს გარეშე, სუფთა ფინანსური ხედვა). მხოლოდ ფინანსების წვდომას უჩანს.
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Kpi label="პროექტები" value={String(totals.projects)} />
            <Kpi label="დანადგარები" value={String(totals.units)} />
            <Kpi label="ჯამური სართული" value={String(totals.floors)} />
            <Kpi label="ჯამური ღირებულება (დღგ-ს გარეშე)" value={fmtUsd(totals.costNet)} />
            <Kpi label="საშუალო მარჟა (შეწონილი)" value={fmtPct(totals.avgMargin)} />
          </div>

          <Card>
            <CardHeader><CardTitle>1. პროექტის ჭრილი</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>პროექტი</TableHead>
                    <TableHead>თარიღი</TableHead>
                    <TableHead className="text-right">დანადგ.</TableHead>
                    <TableHead className="text-right">სართ. ჯამი</TableHead>
                    <TableHead className="text-right">ფასი დღგ-ს გარეშე</TableHead>
                    <TableHead className="text-right">მარჟა %</TableHead>
                    <TableHead className="text-right">შემოწმება</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.date).toLocaleDateString("ka-GE")}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{r.unitsCount}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{r.floorsSum}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{fmtUsd(r.costNet)}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{fmtPct(r.marginPct)}</TableCell>
                      <TableCell className={"text-right font-mono text-xs " + (Math.abs(r.checkDiff) < 0.5 ? "text-emerald-600" : "text-destructive")}>{fmtUsd(r.checkDiff)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>2. დანადგარის ჭრილი (ტიპის მიხედვით, ყველა პროექტში)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={unitTypeRows.map((r) => ({ name: KIND_LABEL[r.prefix] ?? r.prefix, ღირებულება: Math.round(r.costNet) }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={(v: number) => fmtUsd(v)} />
                    <Bar dataKey="ღირებულება" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>ტიპი</TableHead>
                    <TableHead className="text-right">რაოდ.</TableHead>
                    <TableHead className="text-right">სართ. ჯამი</TableHead>
                    <TableHead className="text-right">საშ. სართული</TableHead>
                    <TableHead className="text-right">საშ. ქარხნული ფასი</TableHead>
                    <TableHead className="text-right">ჯამური ღირებ. (დღგ-ს გარეშე)</TableHead>
                    <TableHead className="text-right">საშ. მარჟა %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unitTypeRows.map((r) => (
                    <TableRow key={r.prefix}>
                      <TableCell className="font-medium">{KIND_LABEL[r.prefix] ?? r.prefix} <span className="text-xs text-muted-foreground">({r.prefix})</span></TableCell>
                      <TableCell className={"text-right " + computedCls}>{r.count}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{r.floorsSum}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{r.avgFloors.toFixed(1)}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{fmtUsd(r.avgFactoryPrice)}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{fmtUsd(r.costNet)}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{fmtPct(r.avgMarginPct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3. სართულის ჭრილი (ყველა დანადგარი, ყველა პროექტში)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="text-right">სართულები</TableHead>
                    <TableHead className="text-right">დანადგ. რაოდ.</TableHead>
                    <TableHead className="text-right">ჯამური ღირებ. (დღგ-ს გარეშე)</TableHead>
                    <TableHead className="text-right">საშ. ღირებ./დანადგარი</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {floorRows.map((r) => (
                    <TableRow key={r.floors}>
                      <TableCell className="font-medium text-right">{r.floors}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{r.count}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{fmtUsd(r.costNet)}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{fmtUsd(r.avgCostPerUnit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
