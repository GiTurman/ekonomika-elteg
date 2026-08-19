import { Fragment, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { NumberInput, fmtUsd, fmtPct, computedCls } from "./sheet-ui";
import { computeEconomics, type ProjectReport } from "@/lib/econ-calc";
import { listArchiveFull, updateArchiveEntry, type ArchiveEntryFull } from "@/lib/archive";
import type { AppState } from "@/lib/econ-types";
import { ChevronDown, ChevronRight, Loader2, Save, CheckCircle2 } from "lucide-react";

// ხარჯვითი ნაწილის მუხლები. key ზუსტად ემთხვევა «ეკონომიკა» ფურცლის ReportBlock-ის
// key-ს (`ბლოკის სათაური | ხაზის დასახელება`), რომ ფაქტი იმავე manualColumns.factual-ში ჩაიწეროს.
const PURCHASE_TITLE = "შესყიდვის ხარჯები";
const INSTALL_TITLE = "მონტაჟის ხარჯები";

interface LineDef { label: string; get: (r: ProjectReport) => number }
interface GroupDef { title: string; subtotal: (r: ProjectReport) => number; items: LineDef[] }

const COST_GROUPS: GroupDef[] = [
  {
    title: PURCHASE_TITLE,
    subtotal: (r) => r.purchaseTotal,
    items: [
      { label: "ქარხნული ფასი", get: (r) => r.factoryTotal },
      { label: "საბანკო საკომისიო", get: (r) => r.bankCommTotal },
      { label: "საერთაშორისო ტრანსპორტირება", get: (r) => r.intTransportTotal },
      { label: "ტერმინალის მომსახურება", get: (r) => r.terminalTotal },
      { label: "ადგილზე ტრანსპორტირება", get: (r) => r.localTransportTotal },
    ],
  },
  {
    title: INSTALL_TITLE,
    subtotal: (r) => r.installTotal,
    items: [
      { label: "მონტაჟის ანაზღაურება (დარიცხვებით)", get: (r) => r.mechPayroll },
      { label: "ელექტრომონტაჟი (დარიცხვებით)", get: (r) => r.elecPayroll },
      { label: "მივლინების ხარჯი (სრული)", get: (r) => r.travelTotal },
      { label: "მასალები", get: (r) => r.materialsTotal },
      { label: "ხარაჩო", get: (r) => r.scaffoldingTotal },
    ],
  },
];

const keyOf = (title: string, label: string) => title + "|" + label;

function reportOf(data: AppState): ProjectReport | null {
  try {
    return computeEconomics(data).report;
  } catch {
    return null;
  }
}

function factualOf(data: AppState): Record<string, number> {
  return data?.manualColumns?.factual ?? {};
}

// გადახრის ფერი: ფაქტი > ბიუჯეტი = გადახარჯვა (წითელი); ნაკლები = ეკონომია (მწვანე).
function varCls(actual: number | undefined, budget: number): string {
  if (actual === undefined) return computedCls;
  const d = actual - budget;
  if (Math.abs(d) < 0.005) return computedCls;
  return d > 0 ? "text-destructive font-mono tabular-nums" : "text-emerald-600 font-mono tabular-nums";
}

function VarianceCells({ actual, budget }: { actual: number | undefined; budget: number }) {
  if (actual === undefined) {
    return (
      <>
        <TableCell className={"text-right " + computedCls}>—</TableCell>
        <TableCell className={"text-right " + computedCls}>—</TableCell>
      </>
    );
  }
  const amt = actual - budget;
  const pct = budget ? amt / budget : 0;
  const cls = "text-right " + varCls(actual, budget);
  return (
    <>
      <TableCell className={cls}>{(amt >= 0 ? "+" : "") + fmtUsd(amt)}</TableCell>
      <TableCell className={cls}>{budget ? (pct >= 0 ? "+" : "") + fmtPct(pct) : "—"}</TableCell>
    </>
  );
}

export function VsActualSheet() {
  const [entries, setEntries] = useState<ArchiveEntryFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listArchiveFull()
      .then((rows) => { if (alive) setEntries(rows); })
      .catch((e) => { if (alive) setError(e?.message ?? "ჩატვირთვა ვერ მოხერხდა"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // თითო ობიექტზე budget/actual ჯამები (ხარჯვითი ნაწილი).
  const summaries = useMemo(() => {
    const m = new Map<string, { report: ProjectReport | null; budget: number; actual: number; filled: number; totalLines: number }>();
    for (const e of entries) {
      const report = reportOf(e.data);
      const fac = factualOf(e.data);
      let budget = 0, actual = 0, filled = 0, totalLines = 0;
      for (const g of COST_GROUPS) for (const it of g.items) {
        totalLines++;
        budget += report ? it.get(report) : 0;
        const v = fac[keyOf(g.title, it.label)];
        if (typeof v === "number") { actual += v; filled++; }
      }
      m.set(e.id, { report, budget, actual, filled, totalLines });
    }
    return m;
  }, [entries]);

  function toggle(e: ArchiveEntryFull) {
    if (expandedId === e.id) { setExpandedId(null); return; }
    setExpandedId(e.id);
    setDraft({ ...factualOf(e.data) }); // მხოლოდ უკვე შენახული ფაქტი; შეუვსებელი ხაზი — «—»
    setSavedId(null);
  }

  async function save(e: ArchiveEntryFull) {
    setSavingId(e.id);
    try {
      const prev = e.data.manualColumns ?? { finalOffer: {}, factual: {} };
      const next: AppState = {
        ...e.data,
        manualColumns: { finalOffer: { ...prev.finalOffer }, factual: { ...draft } },
      };
      await updateArchiveEntry(e.id, next);
      setEntries((cur) => cur.map((x) => (x.id === e.id ? { ...x, data: next } : x)));
      setSavedId(e.id);
    } catch (err: any) {
      setError(err?.message ?? "შენახვა ვერ მოხერხდა");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <Card><CardContent className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> იტვირთება…
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>გეგმა / ფაქტი — ხარჯვითი ნაწილი</CardTitle>
        <p className="text-xs text-muted-foreground">
          თითო ობიექტის განფასების ხარჯვითი თვითღირებულება (ბიუჯეტი, USD) ფაქტობრივ დანახარჯთან. ობიექტზე
          დაჭერით იშლება მუხლების დეტალი — ფაქტს აქვე ავსებ და ვინახავ. გადახრა ნაჩვენებია თანხობრივადაც და
          პროცენტულადაც (წითელი = გადახარჯვა, მწვანე = ეკონომია). ცარიელი ფაქტის ხაზი ჯამში არ ითვლება.
        </p>
      </CardHeader>
      <CardContent>
        {error && <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
        {entries.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">არქივში ობიექტები ჯერ არ არის.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>ობიექტი</TableHead>
                <TableHead className="text-right">ბიუჯეტი (ხარჯვ.)</TableHead>
                <TableHead className="text-right">ფაქტი</TableHead>
                <TableHead className="text-right">გადახრა</TableHead>
                <TableHead className="text-right">გადახრა %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => {
                const s = summaries.get(e.id)!;
                const open = expandedId === e.id;
                const anyFilled = s.filled > 0;
                const dt = e.created_at ? new Date(e.created_at).toLocaleDateString("ka-GE") : "";
                return (
                  <Fragment key={e.id}>
                    <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => toggle(e)}>
                      <TableCell className="p-1 align-middle">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{e.name}</div>
                        <div className="text-xs text-muted-foreground">{dt} · შევსებული {s.filled}/{s.totalLines} მუხლი</div>
                      </TableCell>
                      <TableCell className={"text-right " + computedCls}>{fmtUsd(s.budget)}</TableCell>
                      <TableCell className={"text-right " + computedCls}>{anyFilled ? fmtUsd(s.actual) : "—"}</TableCell>
                      <VarianceCells actual={anyFilled ? s.actual : undefined} budget={s.budget} />
                    </TableRow>
                    {open && (
                      <TableRow key={e.id + "-detail"}>
                        <TableCell colSpan={6} className="bg-muted/20 p-3">
                          <DetailTable
                            entry={e}
                            report={s.report}
                            draft={draft}
                            onEdit={(k, v) => setDraft((d) => ({ ...d, [k]: v }))}
                          />
                          <div className="mt-3 flex items-center gap-3">
                            <Button size="sm" onClick={() => save(e)} disabled={savingId === e.id}>
                              {savingId === e.id
                                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> ინახება…</>
                                : <><Save className="h-4 w-4 mr-1" /> ფაქტის შენახვა</>}
                            </Button>
                            {savedId === e.id && (
                              <span className="flex items-center gap-1 text-sm text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" /> შენახულია
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function DetailTable({
  entry, report, draft, onEdit,
}: {
  entry: ArchiveEntryFull;
  report: ProjectReport | null;
  draft: Record<string, number>;
  onEdit: (key: string, v: number) => void;
}) {
  if (!report) {
    return <div className="text-sm text-destructive">ამ ობიექტის გამოთვლა ვერ მოხერხდა (მონაცემები არასრულია).</div>;
  }

  let grandActual = 0;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>მუხლი</TableHead>
          <TableHead className="text-right w-[130px]">ბიუჯეტი</TableHead>
          <TableHead className="text-right w-[150px]">ფაქტი</TableHead>
          <TableHead className="text-right w-[130px]">გადახრა</TableHead>
          <TableHead className="text-right w-[90px]">%</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {COST_GROUPS.map((g) => {
          let subActual = 0;
          const rows = g.items.map((it) => {
            const budget = it.get(report);
            const key = keyOf(g.title, it.label);
            const has = typeof draft[key] === "number";
            const actual = has ? draft[key] : undefined;
            if (has) subActual += draft[key];
            return (
              <TableRow key={key}>
                <TableCell className="pl-4">{it.label}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(budget)}</TableCell>
                <TableCell className="p-1 w-[150px]">
                  <NumberInput value={draft[key] ?? 0} onChange={(v) => onEdit(key, v)} />
                </TableCell>
                <VarianceCells actual={actual} budget={budget} />
              </TableRow>
            );
          });
          grandActual += subActual;
          return (
            <Fragment key={g.title}>
              <TableRow key={g.title + "-h"} className="bg-muted/40">
                <TableCell colSpan={5} className="font-semibold">{g.title}</TableCell>
              </TableRow>
              {rows}
              <TableRow key={g.title + "-s"} className="font-semibold">
                <TableCell className="text-right">ჯამი — {g.title}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(g.subtotal(report))}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(subActual)}</TableCell>
                <VarianceCells actual={subActual} budget={g.subtotal(report)} />
              </TableRow>
            </Fragment>
          );
        })}
        <TableRow className="font-bold border-t-2">
          <TableCell className="text-right">სულ ხარჯვითი თვითღირებულება</TableCell>
          <TableCell className={"text-right " + computedCls}>{fmtUsd(report.costTotal)}</TableCell>
          <TableCell className={"text-right " + computedCls}>{fmtUsd(grandActual)}</TableCell>
          <VarianceCells actual={grandActual} budget={report.costTotal} />
        </TableRow>
      </TableBody>
    </Table>
  );
}
