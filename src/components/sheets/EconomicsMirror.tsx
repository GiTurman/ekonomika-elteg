import { useMemo, useState } from "react";
import { useEconStore } from "@/lib/econ-store";
import { computeEconomics } from "@/lib/econ-calc";
import { RoleView, useAccessRole } from "@/components/AccessGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EconomicsSheet, buildReportBlocks } from "./EconomicsSheet";
import { fmtUsd, fmtPct } from "./sheet-ui";
import { Columns2, Square } from "lucide-react";

// „ეკონომიკა" ტაბი ფინანსებისთვის: ერთი ხედი ან „ორი ხედი" — მარცხნივ ჩემი (full),
// მარჯვნივ ზუსტად ის, რასაც გაყიდვები ხედავს (იგივე პროექტი, იგივე ძრავა, მხოლოდ
// გაყიდვების ხედვადობის წესებით). ზემოთ — სხვაობების ცხრილი.
export function EconomicsTab() {
  const { isFull } = useAccessRole();
  const [mirror, setMirror] = useState(false);
  if (!isFull) return <EconomicsSheet />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant={mirror ? "default" : "outline"} onClick={() => setMirror((m) => !m)}>
          {mirror ? <Square className="h-4 w-4 mr-1" /> : <Columns2 className="h-4 w-4 mr-1" />}
          {mirror ? "ერთი ხედი" : "ორი ხედი: ჩემი | გაყიდვები"}
        </Button>
      </div>
      {mirror ? <EconomicsMirror /> : <EconomicsSheet />}
    </div>
  );
}

type DiffRow = {
  section: string;
  label: string;
  mine: string | null;   // null = ამ ხედში არ ჩანს
  sales: string | null;
  kind: "same" | "diff" | "onlyMine" | "onlySales";
};

function EconomicsMirror() {
  const { state } = useEconStore();
  const [onlyDiff, setOnlyDiff] = useState(true);
  const eco = useMemo(() => computeEconomics(state), [state]);

  const rows = useMemo<DiffRow[]>(() => {
    const out: DiffRow[] = [];
    const kindOf = (a: number | null, b: number | null): DiffRow["kind"] =>
      a === null ? "onlySales" : b === null ? "onlyMine" : Math.abs(a - b) > 0.005 ? "diff" : "same";

    // მთავარი მაჩვენებლები — აქ განსხვავდება განმარტებაც
    const salesMargin = eco.totals.finalPrice ? eco.report.markupTotal / eco.totals.finalPrice : 0;
    out.push({ section: "მთავარი", label: "საბოლოო ციფრი (ცხრილის ბოლო სვეტი)",
      mine: fmtUsd(eco.totals.priceNoVat) + " (დღგ-ს გარეშე)", sales: fmtUsd(eco.totals.finalPrice) + " (დღგ-ით)", kind: "diff" });
    out.push({ section: "მთავარი", label: "ჯამური მარჟა %",
      mine: fmtPct(eco.report.totalMarginPct) + " (ფასნამატი / ფასი დღგ-ს გარეშე)",
      sales: fmtPct(salesMargin) + " (ფასნამატი / საბოლოო ფასი)",
      kind: kindOf(eco.report.totalMarginPct, salesMargin) });
    out.push({ section: "მთავარი", label: "შემოწმების ხაზი", mine: fmtUsd(eco.report.checkDiff), sales: null, kind: "onlyMine" });
    out.push({ section: "მთავარი", label: "ზღვარს ქვემოთ დანადგარების გაფრთხილება",
      mine: String(eco.units.filter((u) => u.belowMinAmount || u.belowMinMargin).length) + " დანადგარი", sales: null, kind: "onlyMine" });
    out.push({ section: "დანადგარების ცხრილი", label: "დღგ და საბოლოო ფასი სვეტები",
      mine: null, sales: fmtUsd(eco.totals.vat) + " / " + fmtUsd(eco.totals.finalPrice), kind: "onlySales" });

    // დეტალური ანგარიში — ხაზ-ხაზ
    const mine = buildReportBlocks(eco, true);
    const sales = buildReportBlocks(eco, false);
    const salesMap = new Map<string, number>();
    sales.forEach((b) => b.rows.forEach(([l, v]) => salesMap.set(b.blockKey + "|" + l, v)));
    const mineMap = new Map<string, number>();
    mine.forEach((b) => b.rows.forEach(([l, v]) => mineMap.set(b.blockKey + "|" + l, v)));
    mine.forEach((b) => b.rows.forEach(([l, v]) => {
      const s = salesMap.has(b.blockKey + "|" + l) ? salesMap.get(b.blockKey + "|" + l)! : null;
      out.push({ section: b.title, label: l, mine: fmtUsd(v), sales: s === null ? null : fmtUsd(s), kind: kindOf(v, s) });
    }));
    sales.forEach((b) => b.rows.forEach(([l, v]) => {
      if (!mineMap.has(b.blockKey + "|" + l)) out.push({ section: b.title, label: l, mine: null, sales: fmtUsd(v), kind: "onlySales" });
    }));
    return out;
  }, [eco]);

  const shown = onlyDiff ? rows.filter((r) => r.kind !== "same") : rows;
  const badge: Record<DiffRow["kind"], { text: string; cls: string }> = {
    same: { text: "ერთნაირი", cls: "text-muted-foreground" },
    diff: { text: "განსხვავებული", cls: "text-amber-700 dark:text-amber-400 font-semibold" },
    onlyMine: { text: "მხოლოდ ჩემთან", cls: "text-blue-700 dark:text-blue-400 font-semibold" },
    onlySales: { text: "მხოლოდ გაყიდვებთან", cls: "text-emerald-700 dark:text-emerald-400 font-semibold" },
  };
  const rowCls: Record<DiffRow["kind"], string> = {
    same: "", diff: "bg-amber-50 dark:bg-amber-950/30", onlyMine: "bg-blue-50 dark:bg-blue-950/30", onlySales: "bg-emerald-50 dark:bg-emerald-950/30",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>სხვაობები: ჩემი ხედი ↔ გაყიდვების ხედი</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setOnlyDiff((v) => !v)}>
            {onlyDiff ? "ყველა ხაზის ჩვენება" : "მხოლოდ სხვაობები"}
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>ნაწილი</TableHead>
                <TableHead>ხაზი</TableHead>
                <TableHead className="text-right">ჩემი ხედი</TableHead>
                <TableHead className="text-right">გაყიდვების ხედი</TableHead>
                <TableHead>სტატუსი</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r, i) => (
                <TableRow key={i} className={rowCls[r.kind]}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.section}</TableCell>
                  <TableCell className="text-sm">{r.label}</TableCell>
                  <TableCell className="text-right font-mono text-sm whitespace-nowrap">{r.mine ?? "— არ ჩანს"}</TableCell>
                  <TableCell className="text-right font-mono text-sm whitespace-nowrap">{r.sales ?? "— არ ჩანს"}</TableCell>
                  <TableCell className={"text-xs whitespace-nowrap " + badge[r.kind].cls}>{badge[r.kind].text}</TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">სხვაობა არ არის</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 2xl:grid-cols-2">
        <div className="min-w-0 rounded-lg border-2 border-blue-300 dark:border-blue-800 p-2">
          <div className="mb-2 px-1 text-sm font-semibold text-blue-700 dark:text-blue-400">ჩემი ხედი (ფინანსები)</div>
          <EconomicsSheet />
        </div>
        <div className="min-w-0 rounded-lg border-2 border-emerald-300 dark:border-emerald-800 p-2">
          <div className="mb-2 px-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">გაყიდვების ხედი (მხოლოდ სანახავად)</div>
          <RoleView role="sales">
            <EconomicsSheet />
          </RoleView>
        </div>
      </div>
    </div>
  );
}
