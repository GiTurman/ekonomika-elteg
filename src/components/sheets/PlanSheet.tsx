import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { fmtUsd, computedCls, linkedCls, NumberInput } from "./sheet-ui";
import { useAccessRole } from "@/components/AccessGate";
import { listArchiveFull, type ArchiveEntryFull } from "@/lib/archive";
import { listUsers, type AppUser } from "@/lib/access";
import { listSalesPlans, setSalesPlan, type SalesPlan, type PlanScope, PLAN_SCOPE_LABEL } from "@/lib/salesPlans";
import { computeEconomics } from "@/lib/econ-calc";
import { normalizeAppState } from "@/lib/econ-defaults";
import { logActivity } from "@/lib/activityLog";

const SCOPES: PlanScope[] = ["overall", "kleemann", "hitachi"];

// ბრენდის ნორმალიზება (იგივე, რაც ანალიტიკაში — Hitach→Hitachi, KLEEMANN→Kleemann)
const BRAND_ALIASES: Record<string, string> = { hitach: "Hitachi", hitachi: "Hitachi", kleemann: "Kleemann" };
function normBrand(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  const a = BRAND_ALIASES[t.toLowerCase()];
  if (a) return a;
  return t.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

interface Actual { overall: number; kleemann: number; hitachi: number; year: number; quarter: number; salesPersonId: string; }

function projectActual(entry: ArchiveEntryFull): Actual | null {
  const st = normalizeAppState(entry.data);
  const p = st.project;
  // შესრულებულად ითვლება მხოლოდ თუ ორივე თარიღი შევსებულია
  if (!p.contractDate?.trim() || !p.firstTrancheDate?.trim()) return null;
  const d = new Date(p.firstTrancheDate);
  if (isNaN(d.getTime())) return null;
  const eco = computeEconomics(st);
  let kleemann = 0, hitachi = 0;
  for (const u of p.units) {
    const b = normBrand(u.brand);
    if (b === "Kleemann") kleemann += u.factoryPrice || 0;
    else if (b === "Hitachi") hitachi += u.factoryPrice || 0;
  }
  return {
    overall: eco.report.markupTotal,   // საერთო გეგმა — მარჟა
    kleemann, hitachi,
    year: d.getFullYear(),
    quarter: Math.floor(d.getMonth() / 3) + 1,
    salesPersonId: p.salesPersonId || "",
  };
}

export function PlanSheet() {
  const { isFull, userId, actorName, role } = useAccessRole();
  const [entries, setEntries] = useState<ArchiveEntryFull[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [plans, setPlans] = useState<SalesPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const refresh = async () => {
    setLoading(true);
    try {
      const [e, u, pl] = await Promise.all([listArchiveFull(), listUsers(), listSalesPlans().catch(() => [])]);
      setEntries(e); setUsers(u); setPlans(pl);
    } catch (err) {
      console.error("[plan] load failed", err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const salesUsers = useMemo(() => users.filter((u) => u.role === "sales"), [users]);

  const visibleSalesUsers = useMemo(() => {
    if (isFull) return salesUsers;
    return salesUsers.filter((u) => u.id === userId);
  }, [salesUsers, isFull, userId]);

  const actuals = useMemo(() => entries.map(projectActual).filter(Boolean) as Actual[], [entries]);

  const years = useMemo(() => {
    const s = new Set<number>([new Date().getFullYear()]);
    actuals.forEach((a) => s.add(a.year));
    plans.forEach((p) => s.add(p.year));
    return Array.from(s).sort((a, b) => b - a);
  }, [actuals, plans]);

  const actualOf = (salesPersonId: string, scope: PlanScope, quarter: number | "year"): number => {
    return actuals
      .filter((a) => a.year === year && a.salesPersonId === salesPersonId && (quarter === "year" || a.quarter === quarter))
      .reduce((s, a) => s + a[scope], 0);
  };
  const planOf = (salesPersonId: string, scope: PlanScope, quarter: number): number => {
    return plans.find((p) => p.year === year && p.salesPersonId === salesPersonId && p.scope === scope && p.quarter === quarter)?.planUsd ?? 0;
  };

  const handleSetPlan = async (salesPersonId: string, scope: PlanScope, quarter: number, val: number) => {
    try {
      await setSalesPlan(year, quarter, salesPersonId, scope, val);
      setPlans((prev) => {
        const idx = prev.findIndex((p) => p.year === year && p.salesPersonId === salesPersonId && p.scope === scope && p.quarter === quarter);
        const next = [...prev];
        if (idx >= 0) next[idx] = { ...next[idx], planUsd: val };
        else next.push({ id: `tmp-${Date.now()}`, year, quarter, salesPersonId, scope, planUsd: val });
        return next;
      });
      logActivity(actorName, role, "გეგმის დაყენება", `${year} Q${quarter} ${PLAN_SCOPE_LABEL[scope]} = ${val}`);
    } catch (e) {
      console.error("[plan] set failed", e);
      alert("გეგმის შენახვა ვერ მოხერხდა (შესაძლოა ბაზის ცხრილი ჯერ არ არსებობს).");
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />იტვირთება…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">წელი:</span>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={refresh}>განახლება</Button>
      </div>

      {isFull && (
        <PlanBlock
          title="მთელი კომპანია — ჯამურად"
          salesPersonIds={salesUsers.map((u) => u.id)}
          year={year} planOf={planOf} actualOf={actualOf}
          editable={false}
        />
      )}

      {visibleSalesUsers.map((u) => (
        <PlanBlock
          key={u.id}
          title={u.name}
          salesPersonIds={[u.id]}
          year={year} planOf={planOf} actualOf={actualOf}
          editable={isFull}
          onSetPlan={handleSetPlan}
          singleSalesPersonId={u.id}
        />
      ))}

      {visibleSalesUsers.length === 0 && (
        <p className="text-sm text-muted-foreground">გამყიდველი მომხმარებელი არ მოიძებნა.</p>
      )}
    </div>
  );
}

function PlanBlock({
  title, salesPersonIds, planOf, actualOf, editable, onSetPlan, singleSalesPersonId,
}: {
  title: string;
  salesPersonIds: string[];
  year: number;
  planOf: (sp: string, scope: PlanScope, q: number) => number;
  actualOf: (sp: string, scope: PlanScope, q: number | "year") => number;
  editable: boolean;
  onSetPlan?: (sp: string, scope: PlanScope, q: number, v: number) => void;
  singleSalesPersonId?: string;
}) {
  const sumPlan = (scope: PlanScope, q: number) => salesPersonIds.reduce((s, sp) => s + planOf(sp, scope, q), 0);
  const sumActual = (scope: PlanScope, q: number | "year") => salesPersonIds.reduce((s, sp) => s + actualOf(sp, scope, q), 0);

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {SCOPES.map((scope) => {
          const yearPlan = [1, 2, 3, 4].reduce((s, q) => s + sumPlan(scope, q), 0);
          const yearActual = sumActual(scope, "year");
          const yearDev = yearActual - yearPlan;
          const yearShort = yearDev < 0 ? -yearDev : 0;
          return (
            <div key={scope}>
              <div className="text-sm font-semibold mb-1">{PLAN_SCOPE_LABEL[scope]}</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>პერიოდი</TableHead>
                    <TableHead className="text-right">გეგმა</TableHead>
                    <TableHead className="text-right">შესრულება</TableHead>
                    <TableHead className="text-right">გადახრა</TableHead>
                    <TableHead className="text-right">დანაკლისი</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4].map((q) => {
                    const plan = sumPlan(scope, q);
                    const act = sumActual(scope, q);
                    const dev = act - plan;
                    const short = dev < 0 ? -dev : 0;
                    return (
                      <TableRow key={q}>
                        <TableCell>Q{q}</TableCell>
                        <TableCell className="text-right p-1 w-40">
                          {editable && onSetPlan && singleSalesPersonId ? (
                            <NumberInput value={planOf(singleSalesPersonId, scope, q)}
                              onChange={(v) => onSetPlan(singleSalesPersonId, scope, q, v)}
                              className="h-8 text-right w-36 ml-auto" />
                          ) : <span className={computedCls}>{fmtUsd(plan)}</span>}
                        </TableCell>
                        <TableCell className={"text-right " + linkedCls}>{fmtUsd(act)}</TableCell>
                        <TableCell className={"text-right " + (dev < 0 ? "text-red-600" : "text-emerald-600")}>{fmtUsd(dev)}</TableCell>
                        <TableCell className="text-right text-red-600">{short ? fmtUsd(short) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-semibold border-t-2 bg-muted/30">
                    <TableCell>წლის ჯამი</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtUsd(yearPlan)}</TableCell>
                    <TableCell className={"text-right " + linkedCls}>{fmtUsd(yearActual)}</TableCell>
                    <TableCell className={"text-right " + (yearDev < 0 ? "text-red-600" : "text-emerald-600")}>{fmtUsd(yearDev)}</TableCell>
                    <TableCell className="text-right text-red-600">{yearShort ? fmtUsd(yearShort) : "—"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
