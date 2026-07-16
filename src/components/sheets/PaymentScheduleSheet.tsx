import { useEconStore } from "@/lib/econ-store";
import { computeEconomics } from "@/lib/econ-calc";
import { useAccessRole } from "@/components/AccessGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberInput, PercentInput, TextInput, fmtUsd, fmtPct, computedCls } from "./sheet-ui";
import type { PaymentReport } from "@/lib/econ-calc";
import type { PaymentScenario } from "@/lib/econ-types";
import { Plus, Trash2, Wand2 } from "lucide-react";

export function PaymentScheduleSheet() {
  const { state, updatePayment, addTranche, removeTranche, updateTranche, addExpense, removeExpense, updateExpense, applySuggestedExpenses } = useEconStore();
  const { isFull } = useAccessRole();
  const eco = computeEconomics(state);
  const p = state.payment;

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
            {isFull ? (
              <PercentInput value={p.procurementAdvancePct} onChange={(v) => updatePayment({ procurementAdvancePct: v })} />
            ) : (
              <div className={"h-8 flex items-center font-mono px-2 " + computedCls}>{fmtPct(p.procurementAdvancePct)}</div>
            )}
          </label>
        </CardContent>
      </Card>

      <ScenarioCard
        which="A" title={p.scenarioA.name} scenario={p.scenarioA} report={eco.scenarioA} isFull={isFull}
        onAddTranche={() => addTranche("A")} onRemoveTranche={(i) => removeTranche("A", i)} onUpdateTranche={(i, patch) => updateTranche("A", i, patch)}
        onAddExpense={(after) => addExpense("A", after)} onRemoveExpense={(i) => removeExpense("A", i)} onUpdateExpense={(i, patch) => updateExpense("A", i, patch)}
        onAutoFill={() => applySuggestedExpenses("A")}
      />
    </div>
  );
}

function ScenarioCard({
  which, title, scenario, report, isFull,
  onAddTranche, onRemoveTranche, onUpdateTranche,
  onAddExpense, onRemoveExpense, onUpdateExpense, onAutoFill,
}: {
  which: "A" | "B";
  title: string;
  scenario: PaymentScenario;
  report: PaymentReport;
  isFull: boolean;
  onAddTranche: () => void;
  onRemoveTranche: (i: number) => void;
  onUpdateTranche: (i: number, patch: { label?: string; pct?: number }) => void;
  onAddExpense: (afterTranche: number) => void;
  onRemoveExpense: (i: number) => void;
  onUpdateExpense: (i: number, patch: { label?: string; amount?: number; afterTranche?: number }) => void;
  onAutoFill: () => void;
}) {
  const pctOk = Math.abs(report.pctSum - 1) < 0.001;

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {/* ტრანშები — რაოდენობა და პროცენტები ხელით */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">ტრანშები</span>
            {isFull && (
              <Button size="sm" variant="outline" onClick={onAddTranche}>
                <Plus className="h-3.5 w-3.5 mr-1" /> ტრანშის დამატება
              </Button>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ტრანში</TableHead>
                <TableHead className="text-right">% კონტრაქტიდან</TableHead>
                <TableHead className="text-right">თანხა</TableHead>
                {isFull && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.tranches.map((tr, i) => (
                <TableRow key={i}>
                  <TableCell className="p-1">
                    {isFull ? (
                      <TextInput value={tr.label} onChange={(v) => onUpdateTranche(i, { label: v })} />
                    ) : tr.label}
                  </TableCell>
                  <TableCell className="p-1 w-32">
                    {isFull ? (
                      <PercentInput value={tr.pct} onChange={(v) => onUpdateTranche(i, { pct: v })} />
                    ) : (
                      <div className={"text-right " + computedCls}>{fmtPct(tr.pct)}</div>
                    )}
                  </TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(tr.amount)}</TableCell>
                  {isFull && (
                    <TableCell className="p-1 w-10">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRemoveTranche(i)} disabled={report.tranches.length <= 1}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium">ჯამი</TableCell>
                <TableCell className={"text-right font-semibold " + (pctOk ? "text-emerald-600" : "text-destructive")}>{fmtPct(report.pctSum)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(report.tranches.reduce((s, t) => s + t.amount, 0))}</TableCell>
                {isFull && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
          {!pctOk && <p className="text-xs text-destructive mt-1">ტრანშების ჯამი 100%-ს არ უტოლდება — გადაამოწმეთ პროცენტები.</p>}
        </div>

        {/* გასავლები — თავისუფლად რედაქტირებადი, მხოლოდ ფინანსებისთვის */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">ფულადი ნაკადი (ტრანშების მიღება + გასავლები)</span>
            {isFull && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={onAutoFill}>
                  <Wand2 className="h-3.5 w-3.5 mr-1" /> ავტომატური შევსება
                </Button>
                <Button size="sm" variant="outline" onClick={() => onAddExpense(report.tranches.length - 1)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> გასავლის დამატება
                </Button>
              </div>
            )}
          </div>
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
        </div>

        {/* გასავლების რედაქტორი — მხოლოდ ფინანსებისთვის: ლეიბლი, თანხა, რომელი ტრანშის შემდეგ */}
        {isFull && (
          <div>
            <span className="text-sm font-medium">გასავლების რედაქტირება</span>
            <Table className="mt-2">
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>ლეიბლი</TableHead>
                  <TableHead className="text-right">თანხა</TableHead>
                  <TableHead>რომელი ტრანშის შემდეგ</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenario.expenses.map((exp, i) => (
                  <TableRow key={i}>
                    <TableCell className="p-1"><TextInput value={exp.label} onChange={(v) => onUpdateExpense(i, { label: v })} /></TableCell>
                    <TableCell className="p-1 w-32"><NumberInput value={exp.amount} onChange={(v) => onUpdateExpense(i, { amount: v })} /></TableCell>
                    <TableCell className="p-1 w-48">
                      <Select value={String(exp.afterTranche)} onValueChange={(v) => onUpdateExpense(i, { afterTranche: Number(v) })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {scenario.tranches.map((t, ti) => <SelectItem key={ti} value={String(ti)}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-1 w-10">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRemoveExpense(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {scenario.expenses.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">გასავალი არ არის დამატებული — დააჭირეთ "ავტომატური შევსება" ან "გასავლის დამატება".</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
