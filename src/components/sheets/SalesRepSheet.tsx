import { useEffect, useMemo, useState } from "react";
import { listArchiveFull, loadArchiveEntry, updateArchiveEntry, type ArchiveEntryFull } from "@/lib/archive";
import { computeEconomics } from "@/lib/econ-calc";
import { normalizeAppState } from "@/lib/econ-defaults";
import { listUsers, type AppUser } from "@/lib/access";
import { useAccessRole } from "@/components/AccessGate";
import { logActivity } from "@/lib/activityLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { fmtUsd, computedCls, linkedCls } from "./sheet-ui";

// ბრენდის ნორმალიზება — substring-ით (იგივე, რაც PlanSheet-ში).
function normBrand(raw: string): string {
  const low = (raw || "").trim().toLowerCase();
  if (!low) return "";
  if (low.includes("kleemann")) return "Kleemann";
  if (low.includes("hitach")) return "Hitachi";
  if (low.includes("fuji")) return "Fuji";
  return low.charAt(0).toUpperCase() + low.slice(1);
}

interface ProjectRow {
  id: string;
  name: string;
  salesPersonId: string;
  overall: number;   // მარჟა (report.markupTotal)
  kleemann: number;  // კლემანის ქარხნული ფასი
  hitachi: number;
  factoryTotal: number;
  status: string;
  tranche: string;
}

function projectRow(entry: ArchiveEntryFull): ProjectRow {
  const st = normalizeAppState(entry.data);
  const p = st.project;
  let kleemann = 0, hitachi = 0, factoryTotal = 0;
  for (const u of p.units) {
    const b = normBrand(u.brand);
    const fp = u.factoryPrice || 0;
    factoryTotal += fp;
    if (b === "Kleemann") kleemann += fp;
    else if (b === "Hitachi") hitachi += fp;
  }
  let overall = 0;
  try { overall = computeEconomics(st).report.markupTotal; } catch { overall = 0; }
  return {
    id: entry.id,
    name: entry.name,
    salesPersonId: p.salesPersonId || "",
    overall, kleemann, hitachi, factoryTotal,
    status: p.status || "",
    tranche: p.firstTrancheDate || p.contractDate || "",
  };
}

const UNASSIGNED = "__none__";

export function SalesRepSheet() {
  const { isFull, actorName, role } = useAccessRole();
  const [entries, setEntries] = useState<ArchiveEntryFull[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selRep, setSelRep] = useState<string>("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true); setError(null);
    try {
      const [e, u] = await Promise.all([listArchiveFull(), listUsers()]);
      setEntries(e.filter((x) => x.include_in_analytics));
      setUsers(u);
    } catch (err: any) {
      setError(err?.message ?? "ჩატვირთვა ვერ მოხერხდა");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  const salesUsers = useMemo(() => users.filter((u) => u.role === "sales"), [users]);
  const nameOf = (id: string) => salesUsers.find((u) => u.id === id)?.name ?? "—";

  const rows = useMemo(() => entries.map(projectRow), [entries]);

  const filtered = useMemo(() => {
    if (selRep === "all") return rows;
    if (selRep === UNASSIGNED) return rows.filter((r) => !r.salesPersonId);
    return rows.filter((r) => r.salesPersonId === selRep);
  }, [rows, selRep]);

  const totals = useMemo(() => filtered.reduce(
    (a, r) => ({ overall: a.overall + r.overall, kleemann: a.kleemann + r.kleemann, hitachi: a.hitachi + r.hitachi }),
    { overall: 0, kleemann: 0, hitachi: 0 }
  ), [filtered]);

  // მესაკუთრის გადანიჭება — ტვირთავს entry-ს, ცვლის salesPersonId-ს, ინახავს.
  async function reassign(row: ProjectRow, newId: string) {
    if (!isFull) return;
    const value = newId === UNASSIGNED ? "" : newId;
    if (value === row.salesPersonId) return;
    setSavingId(row.id);
    try {
      const st = await loadArchiveEntry(row.id);
      st.project.salesPersonId = value;
      await updateArchiveEntry(row.id, st);
      setEntries((prev) => prev.map((e) => e.id === row.id
        ? { ...e, data: { ...(e.data as any), project: { ...((e.data as any).project ?? {}), salesPersonId: value } } }
        : e));
      logActivity(actorName, role, "მესაკუთრის გადანიჭება", `${row.name} → ${value ? nameOf(value) : "—"}`);
    } catch (err: any) {
      setError(`შენახვა ვერ მოხერხდა: ${err?.message ?? err}`);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>გაყიდვების წარმომადგენლების ჭრილი</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={selRep} onValueChange={setSelRep}>
              <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ყველა წარმომადგენელი</SelectItem>
                {salesUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                <SelectItem value={UNASSIGNED}>მიუნიშნებელი</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>პროექტი</TableHead>
                <TableHead className="text-right">მარჟა (საერთო)</TableHead>
                <TableHead className="text-right">კლემანი</TableHead>
                <TableHead className="text-right">ჰიტაჩი</TableHead>
                <TableHead>სტატუსი</TableHead>
                <TableHead>თარიღი</TableHead>
                <TableHead className="w-56">მესაკუთრე</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.overall)}</TableCell>
                  <TableCell className={"text-right " + linkedCls}>{r.kleemann ? fmtUsd(r.kleemann) : "—"}</TableCell>
                  <TableCell className={"text-right " + linkedCls}>{r.hitachi ? fmtUsd(r.hitachi) : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.status || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.tranche || "—"}</TableCell>
                  <TableCell>
                    {isFull ? (
                      <div className="flex items-center gap-1">
                        <Select value={r.salesPersonId || UNASSIGNED} onValueChange={(v) => reassign(r, v)} disabled={savingId === r.id}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNASSIGNED}>—</SelectItem>
                            {salesUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {savingId === r.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      </div>
                    ) : (
                      <span className="text-sm">{nameOf(r.salesPersonId)}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && !loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">პროექტი ვერ მოიძებნა.</TableCell></TableRow>
              )}
              {filtered.length > 0 && (
                <TableRow className="font-semibold border-t-2 bg-muted/30">
                  <TableCell>სულ ({filtered.length})</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(totals.overall)}</TableCell>
                  <TableCell className={"text-right " + linkedCls}>{fmtUsd(totals.kleemann)}</TableCell>
                  <TableCell className={"text-right " + linkedCls}>{fmtUsd(totals.hitachi)}</TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
