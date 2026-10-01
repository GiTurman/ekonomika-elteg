import { useEconStore } from "@/lib/econ-store";
import { computeEconomics } from "@/lib/econ-calc";
import { useAccessRole } from "@/components/AccessGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtUsd, fmtPct, computedCls, linkedCls } from "./sheet-ui";
import { EQUIPMENT_CATEGORY_LABEL } from "@/lib/econ-types";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createContext, useContext, useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

// ReportBlock-ის ხელით შესატანი სვეტების კონტექსტი — რომ ყველა ბლოკს
// ცალ-ცალკე props არ გადავცე. თუ null-ია (მაგ. Comparison-ში), სვეტები არ ჩანს.
interface ManualColsCtx {
  canEditBlock: (blockKey: string) => boolean;
  canSeeBlock: (blockKey: string) => boolean;
  finalOffer: Record<string, number>;
  factual: Record<string, number>;
  onSet: (col: "finalOffer" | "factual", key: string, v: number | null) => void;
}
const ManualCtx = createContext<ManualColsCtx | null>(null);

// ცალკე input ხელით სვეტებისთვის: ცარიელი ("") ≠ 0. placeholder-ად გამოთვლილ
// თანხას აჩვენებს, რომ ცხადი იყოს "ჯერ არ შევსებულა" vs "შეყვანილია 0".
function ManualCell({
  saved, computed, onSet, editable,
}: { saved: number | undefined; computed: number; onSet: (v: number | null) => void; editable: boolean }) {
  const [text, setText] = useState(() => (saved === undefined ? "" : String(saved)));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(saved === undefined ? "" : String(saved));
  }, [saved]);

  if (!editable) {
    return <span className={"text-right " + (saved === undefined ? "text-muted-foreground/50" : linkedCls)}>
      {saved === undefined ? fmtUsd(computed) : fmtUsd(saved)}
    </span>;
  }
  return (
    <Input
      type="number" inputMode="decimal" step="any"
      className="h-8 text-right w-32 ml-auto"
      value={text}
      placeholder={fmtUsd(computed)}
      onFocus={(e) => { focused.current = true; e.target.select(); }}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        if (v === "") { onSet(null); return; }
        if (v === "-" || v === ".") return;
        const n = Number(v);
        if (!Number.isNaN(n)) onSet(n);
      }}
      onBlur={() => { focused.current = false; }}
    />
  );
}

export function EconomicsSheet() {
  const { state, setManualCell } = useEconStore();
  const { isFull, canEditField, canSeeField } = useAccessRole();
  const eco = computeEconomics(state);
  const mc = state.manualColumns ?? { finalOffer: {}, factual: {} };

  // Full (Elteg_2026_GT!) — ფინანსების "სუფთა" ხედი: დღგ საერთოდ არ ჩანს,
  //   საბოლოო რიცხვი = ფასი დღგ-ს გარეშე.
  // Partner (Elteg_2026!) — სრული ხედი დღგ-ს ჩათვლით: საბოლოო რიცხვი =
  //   რეალურად გადასახდელი, დღგ-ს ჩათვლით საბოლოო ფასი.
  const salesMarginPct = eco.totals.finalPrice ? eco.report.markupTotal / eco.totals.finalPrice : 0;
  const marginPct = isFull ? eco.report.totalMarginPct : salesMarginPct;
  const salesBuf = isFull ? 0 : eco.report.salesBuffer;
  const belowThreshold = eco.units.filter((r) => r.belowMinAmount || r.belowMinMargin);

  return (
    <div className="space-y-6">
      {isFull && belowThreshold.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-destructive">
                  {belowThreshold.length} დანადგარი ჩამოცდა მინიმალურ მოგების ზღვარს (იხ. «მონტაჟის ტარიფები»)
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {belowThreshold.map((r) => (
                    <li key={r.id}>
                      <span className="font-medium text-destructive">{r.id}</span> ({EQUIPMENT_CATEGORY_LABEL[r.category]}) —{" "}
                      {r.belowMinAmount && <span>მოგება {fmtUsd(r.markup)} &lt; მინიმუმი</span>}
                      {r.belowMinAmount && r.belowMinMargin && "; "}
                      {r.belowMinMargin && <span>მარჟა {fmtPct(r.marginPct)} &lt; მინიმუმი</span>}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground pt-1">ეს მხოლოდ გაფრთხილებაა — მუშაობის გაგრძელება შესაძლებელია.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>1. დანადგარების ეკონომიკა — ერთი სტრიქონი = ერთი დანადგარი</CardTitle>
          <p className="text-xs text-muted-foreground">
            ეს ცხრილი მთლიანად ავტომატურადაა გამოთვლილი «პროექტის მონაცემები» და «ფინანსური დაშვებები» ფურცლების საფუძველზე.{" "}
            {isFull ? "ხედი: დღგ-ს გარეშე (სუფთა ფინანსური ანგარიშგება)." : "ხედი: დღგ-ს ჩათვლით (სრული თანხები)."}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>#</TableHead>
                <TableHead className="text-right">სართ.</TableHead>
                <TableHead className="text-right">შესყ. თვითღ.</TableHead>
                <TableHead className="text-right">მონტ. თვითღ.</TableHead>
                <TableHead className="text-right">სულ თვითღ.</TableHead>
                <TableHead className="text-right">ფასნამატი</TableHead>
                <TableHead className="text-right">ფასი დამ.-ის გარეშე</TableHead>
                <TableHead className="text-right">დამატ. ხარჯ.</TableHead>
                <TableHead className="text-right">ფასი დღგ-ს გარეშე</TableHead>
                {!isFull && <TableHead className="text-right">დღგ</TableHead>}
                <TableHead className="text-right">საბ. გარანტია</TableHead>
                {!isFull && <TableHead className="text-right">საბოლოო ფასი</TableHead>}
                <TableHead className="text-right sticky right-24 w-24 bg-background z-10 border-l">მარჟა %</TableHead>
                <TableHead className="text-right sticky right-0 w-24 bg-background z-10 border-l">წილი %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eco.units.map((r) => {
                const flagged = r.belowMinAmount || r.belowMinMargin;
                const stickyBg = flagged ? "bg-destructive/10" : "bg-background";
                return (
                <TableRow key={r.id} className={flagged ? "bg-destructive/10" : ""}>
                  <TableCell className="font-semibold">{r.id}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{r.floors}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.purchaseCost)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.installCost + (isFull ? 0 : r.salesBuffer))}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.totalCost + (isFull ? 0 : r.salesBuffer))}</TableCell>
                  <TableCell className={"text-right " + (r.belowMinAmount ? "text-destructive font-semibold " : "") + computedCls}>{fmtUsd(r.markup)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.priceNoExtras + (isFull ? 0 : r.salesBuffer))}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.extras - (isFull ? 0 : r.salesBuffer))}</TableCell>
                  <TableCell className={"text-right " + (isFull ? "font-semibold " : "") + computedCls}>{fmtUsd(r.priceNoVat)}</TableCell>
                  {!isFull && <TableCell className={"text-right " + computedCls}>{fmtUsd(r.vat)}</TableCell>}
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.bankGuarantee)}</TableCell>
                  {!isFull && <TableCell className={"text-right font-semibold " + computedCls}>{fmtUsd(r.finalPrice)}</TableCell>}
                  <TableCell className={"text-right sticky right-24 w-24 z-10 border-l " + stickyBg + " " + (r.belowMinMargin ? "text-destructive font-semibold " : "") + computedCls}>{fmtPct(r.marginPct)}</TableCell>
                  <TableCell className={"text-right sticky right-0 w-24 z-10 border-l " + stickyBg + " " + computedCls}>{fmtPct(r.projectShare)}</TableCell>
                </TableRow>
                );
              })}
              <TableRow className="bg-muted font-semibold">
                <TableCell colSpan={2}>სულ პროექტში</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.purchaseCost)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.installCost + salesBuf)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.totalCost + salesBuf)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.markup)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.priceNoExtras + salesBuf)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.extras - salesBuf)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.priceNoVat)}</TableCell>
                {!isFull && <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.vat)}</TableCell>}
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.bankGuarantee)}</TableCell>
                {!isFull && <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.finalPrice)}</TableCell>}
                <TableCell className={"text-right sticky right-24 w-24 bg-muted z-10 border-l " + computedCls}>{fmtPct(eco.totals.marginPct)}</TableCell>
                <TableCell className={"text-right sticky right-0 w-24 bg-muted z-10 border-l " + computedCls}>100.00%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ManualCtx.Provider value={{
        canEditBlock: (bk) => canEditField("econ." + bk),
        canSeeBlock: (bk) => canSeeField("econ." + bk),
        finalOffer: mc.finalOffer, factual: mc.factual, onSet: setManualCell,
      }}>
      <Card>
        <CardHeader>
          <CardTitle>2. პროექტის დეტალური ანგარიში (დამოუკიდებელი გამოთვლა — შემოწმებისთვის)</CardTitle>
          <p className="text-xs text-muted-foreground">
            «გამოთვლილი» — ავტომატური თანხა. «საბოლოო შეთავაზება» — კლიენტისთვის შეთავაზებული საბოლოო თანხა.
            «ფაქტი» — რეალურად გასული თანხა (ბუღალტრისა და შენ მიერ). ცარიელი უჯრა = შესატანი არ არის;
            placeholder-ად ნაცრისფრად გამოთვლილი თანხა ჩანს. სვეტების ჯამები ბოლოში ავტომატურად ითვლება.
          </p>
        </CardHeader>
        <CardContent>
          {(() => {
            // ერთი წყარო — ReportBlock-ებიც აქედან ივსება და ღილაკის "გადატანა"-ც
            // ამ სიაზე მუშაობს, რომ key-ები ზუსტად ემთხვეოდეს (title|label).
            const blocks = buildReportBlocks(eco, isFull);

            // ღილაკი — ყველა ხაზის გამოთვლილ თანხას გადაიტანს «საბოლოო შეთავაზება» სვეტში.
            const copyComputedToOffer = () => {
              for (const b of blocks) {
                for (const [label, val, bold] of b.rows) {
                  if (bold) continue; // ჯამური ხაზები ავტომატურად ითვლება — არ ვწერთ
                  setManualCell("finalOffer", b.title + "|" + label, val);
                }
              }
            };

            return (
              <>
                {isFull && (
                  <div className="mb-3 flex justify-end">
                    <Button variant="outline" size="sm" onClick={copyComputedToOffer}>
                      <ArrowRight className="h-4 w-4 mr-1" />
                      გამოთვლილის გადატანა «საბოლოო შეთავაზებაში»
                    </Button>
                  </div>
                )}
                {blocks.map((b) => <ReportBlock key={b.title} title={b.title} blockKey={b.blockKey} rows={b.rows} />)}
              </>
            );
          })()}
          {isFull && (
            <div className="mt-4 flex items-center justify-between rounded border p-3 bg-muted/40">
              <span className="text-sm font-semibold">✓ შემოწმება: ცხრილის ჯამი − დეტალური ანგარიში</span>
              <span className={"font-mono " + (Math.abs(eco.report.checkDiff) < 0.5 ? "text-emerald-600" : "text-destructive")}>
                {fmtUsd(eco.report.checkDiff)}
              </span>
            </div>
          )}
          {isFull && (
            <div className="mt-3 flex items-center justify-between rounded border p-3">
              <span className="text-sm">
                ზედნადები ხარჯი % <span className="text-xs text-muted-foreground">(ზედნადები {fmtUsd(eco.report.overhead)}, მ.შ. გაყიდვების ტარიფის სხვაობა {fmtUsd(eco.report.salesBuffer)} ÷ ფასი დამატ. ხარჯების გარეშე)</span>
              </span>
              <span className={"font-semibold " + computedCls}>{fmtPct(eco.report.overheadPct)}</span>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between rounded border p-3">
            <span className="text-sm">ჯამური მარჟა %</span>
            <span className={"font-semibold " + computedCls}>{fmtPct(marginPct)}</span>
          </div>
        </CardContent>
      </Card>
      </ManualCtx.Provider>

      {isFull && <ProfitCard eco={eco} />}
    </div>
  );
}

function ReportBlock({ title, blockKey, rows }: { title: string; blockKey: string; rows: Array<[string, number, boolean?]> }) {
  const mc = useContext(ManualCtx);
  // ბლოკ-დონის უფლებები: canSee → ხედავს input სვეტებს; canEdit → ავსებს.
  const canSee = mc ? mc.canSeeBlock(blockKey) : false;
  const canEdit = mc ? mc.canEditBlock(blockKey) : false;
  // input სვეტები ჩანს მხოლოდ თუ კონტექსტი არსებობს და ბლოკი ხილვადია.
  const showManual = !!mc && canSee;

  const keyOf = (label: string) => title + "|" + label;

  // bold ხაზი = ბლოკის ჯამური სტრიქონი. მას ხელით არ ავსებენ — ავტომატურად
  // დაითვლება. "ჯამი — " პრეფიქსის ხაზი = მის წინა არა-bold ხაზების ჯამი
  // (ცალკეული input-ების ან, თუ ცარიელია, გამოთვლილის ჯამი). დანარჩენი bold
  // ხაზები (მაგ. "სულ ფასნამატი", "ფასი დღგ-ს გარეშე") ჯაჭვურ გამოთვლას
  // ეყრდნობა — მათ «საბოლოო»/«ფაქტი» სვეტში პირდაპირ გამოთვლილი value ჩნდება.
  const isSimpleSum = (label: string) => label.startsWith("ჯამი —") || label.startsWith("ჯამი (");

  // მოცემული ხაზისთვის, ხელით სვეტის (col) მნიშვნელობა:
  //   - bold "ჯამი —" ხაზი → მის წინა არა-bold ხაზების ჯამი (input-ი ან val)
  //   - bold სხვა ხაზი → გამოთვლილი val (ჯაჭვური, არა მარტივი ჯამი)
  //   - ჩვეულებრივი ხაზი → input-ი თუ არსებობს, თუ არა — val
  const colValue = (col: "finalOffer" | "factual", idx: number): number => {
    if (!mc) return rows[idx][1];
    const [label, val, bold] = rows[idx];
    if (!bold) return mc[col][keyOf(label)] ?? val;
    if (isSimpleSum(label)) {
      // წინა არა-bold ხაზების ჯამი ამ ბლოკში (ბოლო bold-მდე)
      let s = 0;
      for (let i = 0; i < idx; i++) {
        const [l2, v2, b2] = rows[i];
        if (b2) continue;
        s += mc[col][keyOf(l2)] ?? v2;
      }
      return s;
    }
    return val; // ჯაჭვური bold — გამოთვლილივე
  };

  return (
    <div className="mb-4">
      <div className="text-sm font-semibold mb-1">{title}</div>
      <Table>
        {showManual && (
          <TableHeader>
            <TableRow>
              <TableHead>ხარჯის დასახელება</TableHead>
              <TableHead className="text-right">გამოთვლილი</TableHead>
              <TableHead className="text-right w-36">საბოლოო შეთავაზება</TableHead>
              <TableHead className="text-right w-36">ფაქტი</TableHead>
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {rows.map(([label, val, bold], idx) => {
            const k = keyOf(label);
            return (
              <TableRow key={label} className={bold ? "font-semibold bg-muted/30" : ""}>
                <TableCell>{label}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(val)}</TableCell>
                {showManual && (
                  <>
                    <TableCell className="text-right p-1">
                      {bold ? (
                        <span className={"text-right " + linkedCls}>{fmtUsd(colValue("finalOffer", idx))}</span>
                      ) : (
                        <ManualCell
                          saved={mc!.finalOffer[k]} computed={val} editable={canEdit}
                          onSet={(v) => mc!.onSet("finalOffer", k, v)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right p-1">
                      {bold ? (
                        <span className={"text-right " + linkedCls}>{fmtUsd(colValue("factual", idx))}</span>
                      ) : (
                        <ManualCell
                          saved={mc!.factual[k]} computed={val} editable={canEdit}
                          onSet={(v) => mc!.onSet("factual", k, v)}
                        />
                      )}
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export type ReportBlockDef = { title: string; blockKey: string; rows: Array<[string, number, boolean?]> };

// დეტალური ანგარიშის ბლოკები — ერთი წყარო ეკრანისთვის, «საბოლოო შეთავაზებაში» გადატანისთვის
// და «ორი ხედის» შედარებისთვის. isFull=false → ზუსტად ის, რასაც გაყიდვები ხედავს.
export function buildReportBlocks(eco: ReturnType<typeof computeEconomics>, isFull: boolean): ReportBlockDef[] {
  // გაყიდვების ხედი: მონტაჟი გაყიდვების ტარიფით ჩანს (რეალური + ბუფერი), ბუფერი კი
  // დამატებით ხარჯებს აკლდება — საბოლოო ფასი ორივე ხედში ერთი და იგივეა.
  // ჩემს (full) ხედში ბუფერი ზედნადებშია.
  const buf = isFull ? 0 : eco.report.salesBuffer;
  const bufM = isFull ? 0 : eco.report.salesBufferMech;
  const bufE = isFull ? 0 : eco.report.salesBufferElec;
  return [
              { title: "შესყიდვის ხარჯები", blockKey: "purchase", rows: [
                ["ქარხნული ფასი", eco.report.factoryTotal],
                ["საბანკო საკომისიო", eco.report.bankCommTotal],
                ["საერთაშორისო ტრანსპორტირება", eco.report.intTransportTotal],
                ["ტერმინალის მომსახურება", eco.report.terminalTotal],
                ["ადგილზე ტრანსპორტირება", eco.report.localTransportTotal],
                ["ჯამი — შესყიდვის თვითღირებულება", eco.report.purchaseTotal, true],
              ]},
              { title: "მონტაჟის ხარჯები", blockKey: "install", rows: [
                ["მონტაჟის ანაზღაურება (დარიცხვებით)", eco.report.mechPayroll + bufM],
                ["ელექტრომონტაჟი (დარიცხვებით)", eco.report.elecPayroll + bufE],
                ["მივლინების ხარჯი (სრული)", eco.report.travelTotal],
                ["მასალები", eco.report.materialsTotal],
                ["ხარაჩო", eco.report.scaffoldingTotal],
                ["ჯამი — მონტაჟის თვითღირებულება", eco.report.installTotal + buf, true],
              ]},
              { title: "ფასნამატი", blockKey: "markup", rows: [
                ["სულ თვითღირებულება", eco.report.costTotal + buf, true],
                ["დანადგარის ფასნამატი", eco.report.equipmentMarkup],
                ["მონტაჟის ფასნამატი", eco.report.installMarkup],
                ["სულ ფასნამატი", eco.report.markupTotal, true],
                ["ფასი დამატებითი ხარჯების გარეშე", eco.report.priceNoExtras + buf, true],
              ]},
              { title: "დამატებითი ხარჯები", blockKey: "extras", rows: [
                ["გაუთვალისწინებელი ხარჯი", eco.report.contingency],
                ...(isFull ? ([["ზედნადები ხარჯი", eco.report.overhead]] as Array<[string, number, boolean?]>) : []),
                ["საბანკო სავალუტო რისკი", eco.report.fxRisk],
                ["სხვა ხარჯები", eco.report.otherTotal],
                ["დამიწება/ზედამხედველობა", eco.report.groundingTotal],
                ["საშუამავლო საკომისიო", eco.report.brokerTotal],
                ["გარანტიის ხარჯი", eco.report.warrantyCost],
                ["უფასო სერვისი", eco.report.freeServiceCost],
                ["გარანტიის თანხა (ჯამურად)", eco.report.guaranteeAmountCost],
                ["ჯამი — დამატებითი ხარჯები", eco.report.extrasTotal - buf, true],
              ]},
              isFull
                ? { title: "საბოლოო ფასი", blockKey: "final", rows: [
                    ["ფასი დღგ-ს გარეშე", eco.report.priceNoVat, true],
                    ["დღგ", eco.report.vat],
                    ["ფასი დღგ-ით (გარანტიის გარეშე)", eco.report.priceWithVat],
                    ["საბანკო გარანტიის ბაზა", eco.report.guaranteeBase],
                    ["საბანკო გარანტიის საკომისიო", eco.report.guaranteeFee],
                    ["გასაყიდი ფასი (დღგ-ს ჩათვლით)", eco.report.finalContractPrice, true],
                  ]}
                : { title: "საბოლოო ფასი (დღგ-ს ჩათვლით)", blockKey: "final", rows: [
                    ["დღგ", eco.report.vat],
                    ["ფასი დღგ-ით (გარანტიის გარეშე)", eco.report.priceWithVat],
                    ["საბანკო გარანტიის ბაზა", eco.report.guaranteeBase],
                    ["საბანკო გარანტიის საკომისიო", eco.report.guaranteeFee],
                    ["საბოლოო კონტრაქტის ფასი", eco.report.finalContractPrice, true],
                  ]},
            ];
}

// სავარაუდო მოგება — მხოლოდ ფინანსებისთვის. რომელი პუნქტიდან რა თანხა რჩება
// კომპანიას. ფასნამატები და ტარიფების სხვაობა — პირდაპირი მოგება; რეზერვები
// (გაუთვალისწინებელი, ზედნადები, სავალუტო რისკი) — მოგება, თუ არ დაიხარჯა.
export function buildProfitLines(eco: ReturnType<typeof computeEconomics>) {
  const r = eco.report;
  const overheadBase = r.overhead - r.salesBuffer;
  const lines: Array<{ label: string; amount: number; kind: "direct" | "reserve"; note: string }> = [
    { label: "დანადგარის ფასნამატი", amount: r.equipmentMarkup, kind: "direct", note: "შესყიდვის თვითღირებულება × დანადგარის ფასნამატი %" },
    { label: "მონტაჟის ფასნამატი", amount: r.installMarkup, kind: "direct", note: "მონტაჟის თვითღირებულება × მონტაჟის ფასნამატი %" },
    { label: "გაყიდვების ტარიფის სხვაობა", amount: r.salesBuffer, kind: "direct", note: "(გაყიდვების ტარიფი − რეალური) × სართული × დარიცხვები" },
    { label: "ზედნადები ხარჯი", amount: overheadBase, kind: "reserve", note: "ფასი დამატ. ხარჯების გარეშე × ზედნადები %" },
    { label: "გაუთვალისწინებელი ხარჯი", amount: r.contingency, kind: "reserve", note: "მოგება, თუ არ დაიხარჯა" },
    { label: "სავალუტო რისკი", amount: r.fxRisk, kind: "reserve", note: "მოგება, თუ კურსი არ შეიცვალა" },
  ];
  const direct = lines.filter((l) => l.kind === "direct").reduce((s, l) => s + l.amount, 0);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { lines, direct, total, base: r.priceNoVat };
}

function ProfitCard({ eco }: { eco: ReturnType<typeof computeEconomics> }) {
  const { lines, direct, total, base } = buildProfitLines(eco);
  const pct = (v: number) => (base ? v / base : 0);
  const share = (v: number) => (total ? v / total : 0);
  return (
    <Card className="border-emerald-300 dark:border-emerald-800">
      <CardHeader>
        <CardTitle>3. სავარაუდო მოგება (მხოლოდ ფინანსები)</CardTitle>
        <p className="text-xs text-muted-foreground">
          რომელი პუნქტიდან რა თანხა რჩება კომპანიას. % — ფასიდან დღგ-ს გარეშე ({fmtUsd(base)}).
          რეზერვები მოგებად იქცევა, თუ პროექტში არ დაიხარჯა.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>პუნქტი</TableHead>
              <TableHead>ტიპი</TableHead>
              <TableHead className="text-right">თანხა</TableHead>
              <TableHead className="text-right">% ფასიდან</TableHead>
              <TableHead className="text-right">წილი მოგებაში</TableHead>
              <TableHead>როგორ ითვლება</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.label}>
                <TableCell className="text-sm">{l.label}</TableCell>
                <TableCell className={"text-xs " + (l.kind === "direct" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
                  {l.kind === "direct" ? "პირდაპირი" : "რეზერვი"}
                </TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(l.amount)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtPct(pct(l.amount))}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtPct(share(l.amount))}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.note}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/60 font-semibold">
              <TableCell colSpan={2}>პირდაპირი მოგება</TableCell>
              <TableCell className={"text-right " + computedCls}>{fmtUsd(direct)}</TableCell>
              <TableCell className={"text-right " + computedCls}>{fmtPct(pct(direct))}</TableCell>
              <TableCell className={"text-right " + computedCls}>{fmtPct(share(direct))}</TableCell>
              <TableCell className="text-xs text-muted-foreground">ფასნამატები + ტარიფების სხვაობა</TableCell>
            </TableRow>
            <TableRow className="bg-emerald-50 dark:bg-emerald-950/30 font-bold">
              <TableCell colSpan={2}>სავარაუდო მოგება სულ (რეზერვების ჩათვლით)</TableCell>
              <TableCell className={"text-right " + computedCls}>{fmtUsd(total)}</TableCell>
              <TableCell className={"text-right " + computedCls}>{fmtPct(pct(total))}</TableCell>
              <TableCell className={"text-right " + computedCls}>100.00%</TableCell>
              <TableCell className="text-xs text-muted-foreground">თუ რეზერვები სრულად დარჩა</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
