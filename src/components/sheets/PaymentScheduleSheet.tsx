import { useEconStore } from "@/lib/econ-store";
import { computeEconomics } from "@/lib/econ-calc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PercentInput, fmtUsd, fmtPct, computedCls } from "./sheet-ui";
import type { PaymentReport } from "@/lib/econ-calc";

export function PaymentScheduleSheet() {
  const { state, updatePayment } = useEconStore();
  const eco = computeEconomics(state);
  const p = state.payment;

  const setSc = (which: "A" | "B", patch: Partial<typeof p.scenarioA>) =>
    updatePayment(which === "A"
      ? { scenarioA: { ...p.scenarioA, ...patch } }
      : { scenarioB: { ...p.scenarioB, ...patch } });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>ზოგადი პარამეტრები</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="flex items-center justify-between rounded border p-3">
            <span className="text-sm">სრული საკონტრაქტო ფასი</span>
            <span className={"font-semibold " + computedCls}>{fmtUsd(eco.totals.finalPrice)}</span>
          </div>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">მომწოდებლისთვის ავანსი, %</span>
            <PercentInput value={p.procurementAdvancePct} onChange={(v) => updatePayment({ procurementAdvancePct: v })} /></label>
        </CardContent>
      </Card>

      <ScenarioCard title={p.scenarioA.name} report={eco.scenarioA}
        onT1={(v) => setSc("A", { tranche1: v })}
        onT2={(v) => setSc("A", { tranche2: v })}
        onT3={(v) => setSc("A", { tranche3: v })}
      />
      <ScenarioCard title={p.scenarioB.name} report={eco.scenarioB}
        onT1={(v) => setSc("B", { tranche1: v })}
        onT2={(v) => setSc("B", { tranche2: v })}
        onT3={(v) => setSc("B", { tranche3: v })}
      />
    </div>
  );
}

function ScenarioCard({
  title, report, onT1, onT2, onT3,
}: {
  title: string;
  report: PaymentReport;
  onT1: (v: number) => void;
  onT2: (v: number) => void;
  onT3: (v: number) => void;
}) {
  const t = report.scenario;
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">I ტრანში</span>
            <PercentInput value={t.tranche1} onChange={onT1} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">II ტრანში</span>
            <PercentInput value={t.tranche2} onChange={onT2} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">III ტრანში</span>
            <PercentInput value={t.tranche3} onChange={onT3} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">IV ტრანში (ნაშთი)</span>
            <div className={"h-8 flex items-center font-mono px-2 " + computedCls}>{fmtPct(t.tranche4)}</div></label>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ტრანში</TableHead>
              <TableHead className="text-right">% კონტრაქტიდან</TableHead>
              <TableHead className="text-right">თანხა</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.tranches.map((tr) => (
              <TableRow key={tr.label}>
                <TableCell>{tr.label}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtPct(tr.pct)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(tr.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ფულადი ნაკადის მოვლენა</TableHead>
              <TableHead className="text-right">თანხა (+/−)</TableHead>
              <TableHead className="text-right">ნაშთი</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.events.map((e, i) => (
              <TableRow key={i}>
                <TableCell>{e.label}</TableCell>
                <TableCell className={"text-right " + computedCls + " " + (e.amount < 0 ? "text-destructive" : "text-emerald-700")}>{fmtUsd(e.amount)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(e.balance)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold bg-muted/30">
              <TableCell>საბოლოო ფულადი ნაშთი</TableCell>
              <TableCell />
              <TableCell className={"text-right " + computedCls}>{fmtUsd(report.finalBalance)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
