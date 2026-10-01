import { Fragment, useMemo, useState } from "react";
import { useEconStore } from "@/lib/econ-store";
import { computeEconomics } from "@/lib/econ-calc";
import { useAccessRole } from "@/components/AccessGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EconomicsSheet, buildReportBlocks } from "./EconomicsSheet";
import { fmtUsd, fmtPct } from "./sheet-ui";
import { Columns2, Square } from "lucide-react";

// „ეკონომიკა" ტაბი ფინანსებისთვის: ერთი ხედი ან „ორი ხედი" — ჩემი (full) და
// გაყიდვების ხედი გვერდიგვერდ, ხაზები ერთმანეთზე გასწორებული (ერთ ცხრილში),
// რომ ყოველი ხაზის სხვაობა ერთი შეხედვით ჩანდეს.
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

type Kind = "same" | "diff" | "onlyMine" | "onlySales";
type Line = { key: string; label: string; mine: number | null; sales: number | null; fmt: "usd" | "pct"; bold?: boolean; kind: Kind; note?: string };

// ერთი და იგივე თანხა, რომელსაც ორ ხედში სხვადასხვა სახელი აქვს
const LABEL_ALIAS: Record<string, string> = {
  "საბოლოო კონტრაქტის ფასი": "გასაყიდი ფასი (დღგ-ს ჩათვლით)",
};

const kindOf = (a: number | null, b: number | null): Kind =>
  a === null ? "onlySales" : b === null ? "onlyMine" : Math.abs(a - b) > 0.005 ? "diff" : "same";

const ROW_CLS: Record<Kind, string> = {
  same: "",
  diff: "bg-amber-50 dark:bg-amber-950/30",
  onlyMine: "bg-blue-50 dark:bg-blue-950/30",
  onlySales: "bg-emerald-50 dark:bg-emerald-950/30",
};
const BADGE: Record<Kind, { text: string; cls: string }> = {
  same: { text: "", cls: "" },
  diff: { text: "განსხვავებული", cls: "text-amber-700 dark:text-amber-400" },
  onlyMine: { text: "მხოლოდ ჩემთან", cls: "text-blue-700 dark:text-blue-400" },
  onlySales: { text: "მხოლოდ გაყიდვებთან", cls: "text-emerald-700 dark:text-emerald-400" },
};

function fmt(v: number | null, f: "usd" | "pct") {
  if (v === null) return "—";
  return f === "pct" ? fmtPct(v) : fmtUsd(v);
}

function EconomicsMirror() {
  const { state } = useEconStore();
  const [onlyDiff, setOnlyDiff] = useState(false);
  const eco = useMemo(() => computeEconomics(state), [state]);

  // ---------- დეტალური ანგარიში: ხაზ-ხაზ გასწორებული ----------
  const sections = useMemo(() => {
    const salesMargin = eco.totals.finalPrice ? eco.report.markupTotal / eco.totals.finalPrice : 0;
    const head: Line[] = [
      { key: "h1", label: "საბოლოო ციფრი", mine: eco.totals.priceNoVat, sales: eco.totals.finalPrice, fmt: "usd", bold: true,
        kind: "diff", note: "ჩემთან — დღგ-ს გარეშე, გაყიდვებთან — დღგ-ით" },
      { key: "h2", label: "ჯამური მარჟა %", mine: eco.report.totalMarginPct, sales: salesMargin, fmt: "pct", bold: true,
        kind: kindOf(eco.report.totalMarginPct, salesMargin), note: "ჩემთან ÷ ფასი დღგ-ს გარეშე, გაყიდვებთან ÷ საბოლოო ფასი" },
      { key: "h3", label: "შემოწმების ხაზი", mine: eco.report.checkDiff, sales: null, fmt: "usd", kind: "onlyMine" },
    ];
    const mine = buildReportBlocks(eco, true);
    const sales = buildReportBlocks(eco, false);
    const out: { title: string; lines: Line[] }[] = [{ title: "მთავარი მაჩვენებლები", lines: head }];
    mine.forEach((mb) => {
      const sb = sales.find((b) => b.blockKey === mb.blockKey);
      const sRows = new Map<string, number>();
      sb?.rows.forEach(([l, v]) => sRows.set(LABEL_ALIAS[l] ?? l, v));
      const used = new Set<string>();
      const lines: Line[] = mb.rows.map(([l, v, bold]) => {
        const s = sRows.has(l) ? sRows.get(l)! : null;
        if (s !== null) used.add(l);
        return { key: mb.blockKey + "|" + l, label: l, mine: v, sales: s, fmt: "usd", bold, kind: kindOf(v, s) };
      });
      // გაყიდვების ხედის ხაზები, რომლებიც ჩემთან არ არის — თავის ადგილას ჩავსვათ
      sb?.rows.forEach(([l, v, bold], idx) => {
        const name = LABEL_ALIAS[l] ?? l;
        if (used.has(name) || mb.rows.some(([ml]) => ml === name)) return;
        lines.splice(Math.min(idx, lines.length), 0,
          { key: mb.blockKey + "|s|" + l, label: l, mine: null, sales: v, fmt: "usd", bold, kind: "onlySales" });
      });
      out.push({ title: mb.title, lines });
    });
    return out;
  }, [eco]);

  const diffCount = sections.reduce((n, s) => n + s.lines.filter((l) => l.kind !== "same").length, 0);

  return (
    <div className="space-y-4">
      {/* ---------- დანადგარები: ერთი სტრიქონი = ერთი დანადგარი, ორივე ხედი ერთ ხაზზე ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>დანადგარები — ჩემი | გაყიდვები</CardTitle>
          <p className="text-xs text-muted-foreground">
            თითო დანადგარი ერთ სტრიქონზეა: მარცხნივ ის, რასაც შენ ხედავ, მარჯვნივ — რასაც გაყიდვები.
            „—" ნიშნავს, რომ ეს სვეტი ამ ხედში არ ჩანს.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead rowSpan={2} className="align-bottom">#</TableHead>
                <TableHead colSpan={6} className="text-center border-l-2 border-blue-300 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400">ჩემი ხედი</TableHead>
                <TableHead colSpan={6} className="text-center border-l-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">გაყიდვების ხედი</TableHead>
              </TableRow>
              <TableRow className="text-xs">
                {[0, 1].map((side) => (
                  <Fragment key={side}>
                    <TableHead className={"text-right " + (side === 0 ? "border-l-2 border-blue-300" : "border-l-2 border-emerald-300")}>სულ თვითღ.</TableHead>
                    <TableHead className="text-right">ფასნამატი</TableHead>
                    <TableHead className="text-right">ფასი დღგ-ს გარეშე</TableHead>
                    <TableHead className="text-right">დღგ</TableHead>
                    <TableHead className="text-right">საბოლოო ფასი</TableHead>
                    <TableHead className="text-right">მარჟა %</TableHead>
                  </Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...eco.units.map((r) => ({ id: r.id, r, total: false })), { id: "სულ", r: null, total: true }].map(({ id, r, total }) => {
                const t = eco.totals;
                const cost = total ? t.totalCost : r!.totalCost;
                const mk = total ? t.markup : r!.markup;
                const pnv = total ? t.priceNoVat : r!.priceNoVat;
                const vat = total ? t.vat : r!.vat;
                const fin = total ? t.finalPrice : r!.finalPrice;
                const mMine = total ? eco.report.totalMarginPct : r!.marginPct;
                const mSales = total ? (t.finalPrice ? eco.report.markupTotal / t.finalPrice : 0) : r!.marginPct;
                const cell = (v: number | null, f: "usd" | "pct", first = false, side = 0, hl = false) => (
                  <TableCell className={"text-right font-mono text-xs whitespace-nowrap " + (first ? (side === 0 ? "border-l-2 border-blue-300 " : "border-l-2 border-emerald-300 ") : "") + (v === null ? "text-muted-foreground " : "") + (hl ? "bg-amber-50 dark:bg-amber-950/30 font-semibold " : "")}>
                    {fmt(v, f)}
                  </TableCell>
                );
                const mDiff = Math.abs(mMine - mSales) > 0.00005;
                return (
                  <TableRow key={id} className={total ? "bg-muted font-semibold" : ""}>
                    <TableCell className="font-semibold">{id}</TableCell>
                    {/* ჩემი: დღგ და საბოლოო ფასი არ ჩანს */}
                    {cell(cost, "usd", true, 0)}{cell(mk, "usd")}{cell(pnv, "usd")}{cell(null, "usd")}{cell(null, "usd")}{cell(mMine, "pct", false, 0, mDiff)}
                    {/* გაყიდვები */}
                    {cell(cost, "usd", true, 1)}{cell(mk, "usd")}{cell(pnv, "usd")}{cell(vat, "usd")}{cell(fin, "usd")}{cell(mSales, "pct", false, 1, mDiff)}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ---------- დეტალური ანგარიში: ხაზ-ხაზ ---------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>დეტალური ანგარიში — ჩემი | გაყიდვები</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              სხვაობა: <span className="font-semibold">{diffCount}</span> ხაზი ·{" "}
              <span className="text-amber-700 dark:text-amber-400">■ განსხვავებული</span>{" "}
              <span className="text-blue-700 dark:text-blue-400">■ მხოლოდ ჩემთან</span>{" "}
              <span className="text-emerald-700 dark:text-emerald-400">■ მხოლოდ გაყიდვებთან</span>
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOnlyDiff((v) => !v)}>
            {onlyDiff ? "ყველა ხაზი" : "მხოლოდ სხვაობები"}
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>ხაზი</TableHead>
                <TableHead className="text-right border-l-2 border-blue-300 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400">ჩემი ხედი</TableHead>
                <TableHead className="text-right border-l-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">გაყიდვების ხედი</TableHead>
                <TableHead className="text-right border-l">სხვაობა</TableHead>
                <TableHead>შენიშვნა</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.map((s) => {
                const lines = onlyDiff ? s.lines.filter((l) => l.kind !== "same") : s.lines;
                if (lines.length === 0) return null;
                return (
                  <Fragment key={s.title}>
                    <TableRow className="bg-muted/60">
                      <TableCell colSpan={5} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</TableCell>
                    </TableRow>
                    {lines.map((l) => {
                      const delta = l.mine !== null && l.sales !== null && l.fmt === "usd" && l.kind === "diff" ? l.mine - l.sales : null;
                      return (
                        <TableRow key={l.key} className={ROW_CLS[l.kind] + (l.bold ? " font-semibold" : "")}>
                          <TableCell className={"text-sm " + (l.bold ? "" : "pl-6")}>{l.label}</TableCell>
                          <TableCell className={"text-right font-mono text-sm whitespace-nowrap border-l-2 border-blue-300 " + (l.mine === null ? "text-muted-foreground" : "")}>{fmt(l.mine, l.fmt)}</TableCell>
                          <TableCell className={"text-right font-mono text-sm whitespace-nowrap border-l-2 border-emerald-300 " + (l.sales === null ? "text-muted-foreground" : "")}>{fmt(l.sales, l.fmt)}</TableCell>
                          <TableCell className="text-right font-mono text-xs whitespace-nowrap border-l">{delta === null ? "" : fmtUsd(delta)}</TableCell>
                          <TableCell className={"text-xs " + BADGE[l.kind].cls}>
                            {[BADGE[l.kind].text, l.note].filter(Boolean).join(" · ")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
