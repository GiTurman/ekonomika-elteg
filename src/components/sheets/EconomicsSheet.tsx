import { useEconStore } from "@/lib/econ-store";
import { computeEconomics } from "@/lib/econ-calc";
import { useAccessRole } from "@/components/AccessGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtUsd, fmtPct, computedCls } from "./sheet-ui";

export function EconomicsSheet() {
  const { state } = useEconStore();
  const { isFull } = useAccessRole();
  const eco = computeEconomics(state);

  // Full (Elteg_2026_GT!) — ფინანსების "სუფთა" ხედი: დღგ საერთოდ არ ჩანს,
  //   საბოლოო რიცხვი = ფასი დღგ-ს გარეშე.
  // Partner (Elteg_2026!) — სრული ხედი დღგ-ს ჩათვლით: საბოლოო რიცხვი =
  //   რეალურად გადასახდელი, დღგ-ს ჩათვლით საბოლოო ფასი.
  const salesMarginPct = eco.totals.finalPrice ? eco.report.markupTotal / eco.totals.finalPrice : 0;
  const marginPct = isFull ? eco.report.totalMarginPct : salesMarginPct;

  return (
    <div className="space-y-6">
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
                <TableHead className="text-right">მარჟა %</TableHead>
                <TableHead className="text-right">წილი %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eco.units.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{r.id}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{r.floors}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.purchaseCost)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.installCost)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.totalCost)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.markup)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.priceNoExtras)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.extras)}</TableCell>
                  <TableCell className={"text-right " + (isFull ? "font-semibold " : "") + computedCls}>{fmtUsd(r.priceNoVat)}</TableCell>
                  {!isFull && <TableCell className={"text-right " + computedCls}>{fmtUsd(r.vat)}</TableCell>}
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(r.bankGuarantee)}</TableCell>
                  {!isFull && <TableCell className={"text-right font-semibold " + computedCls}>{fmtUsd(r.finalPrice)}</TableCell>}
                  <TableCell className={"text-right " + computedCls}>{fmtPct(r.marginPct)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtPct(r.projectShare)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted font-semibold">
                <TableCell colSpan={2}>სულ პროექტში</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.purchaseCost)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.installCost)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.totalCost)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.markup)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.priceNoExtras)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.extras)}</TableCell>
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.priceNoVat)}</TableCell>
                {!isFull && <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.vat)}</TableCell>}
                <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.bankGuarantee)}</TableCell>
                {!isFull && <TableCell className={"text-right " + computedCls}>{fmtUsd(eco.totals.finalPrice)}</TableCell>}
                <TableCell className={"text-right " + computedCls}>{fmtPct(eco.totals.marginPct)}</TableCell>
                <TableCell className={"text-right " + computedCls}>100.00%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. პროექტის დეტალური ანგარიში (დამოუკიდებელი გამოთვლა — შემოწმებისთვის)</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportBlock title="შესყიდვის ხარჯები" rows={[
            ["ქარხნული ფასი", eco.report.factoryTotal],
            ["საბანკო საკომისიო", eco.report.bankCommTotal],
            ["საერთაშორისო ტრანსპორტირება", eco.report.intTransportTotal],
            ["ტერმინალის მომსახურება", eco.report.terminalTotal],
            ["ადგილზე ტრანსპორტირება", eco.report.localTransportTotal],
            ["ჯამი — შესყიდვის თვითღირებულება", eco.report.purchaseTotal, true],
          ]}/>
          <ReportBlock title="მონტაჟის ხარჯები" rows={[
            ["მონტაჟის ანაზღაურება (დარიცხვებით)", eco.report.mechPayroll],
            ["ელექტრომონტაჟი (დარიცხვებით)", eco.report.elecPayroll],
            ["მივლინების ხარჯი (სრული)", eco.report.travelTotal],
            ["მასალები", eco.report.materialsTotal],
            ["ჯამი — მონტაჟის თვითღირებულება", eco.report.installTotal, true],
          ]}/>
          <ReportBlock title="ფასნამატი" rows={[
            ["სულ თვითღირებულება", eco.report.costTotal, true],
            ["დანადგარის ფასნამატი", eco.report.equipmentMarkup],
            ["მონტაჟის ფასნამატი", eco.report.installMarkup],
            ["სულ ფასნამატი", eco.report.markupTotal, true],
            ["ფასი დამატებითი ხარჯების გარეშე", eco.report.priceNoExtras, true],
          ]}/>
          <ReportBlock title="დამატებითი ხარჯები" rows={[
            ["გაუთვალისწინებელი ხარჯი", eco.report.contingency],
            ["საბანკო სავალუტო რისკი", eco.report.fxRisk],
            ["სხვა ხარჯები", eco.report.otherTotal],
            ["დამიწება/ზედამხედველობა", eco.report.groundingTotal],
            ["საშუამავლო საკომისიო", eco.report.brokerTotal],
            ["გარანტიის ხარჯი", eco.report.warrantyCost],
            ["უფასო სერვისი", eco.report.freeServiceCost],
            ["ჯამი — დამატებითი ხარჯები", eco.report.extrasTotal, true],
          ]}/>
          {isFull ? (
            <ReportBlock title="საბოლოო ფასი" rows={[
              ["ფასი დღგ-ს გარეშე", eco.report.priceNoVat, true],
              ["დღგ", eco.report.vat],
              ["ფასი დღგ-ით (გარანტიის გარეშე)", eco.report.priceWithVat],
              ["საბანკო გარანტიის ბაზა", eco.report.guaranteeBase],
              ["საბანკო გარანტიის საკომისიო", eco.report.guaranteeFee],
              ["გასაყიდი ფასი (დღგ-ს ჩათვლით)", eco.report.finalContractPrice, true],
            ]}/>
          ) : (
            <ReportBlock title="საბოლოო ფასი (დღგ-ს ჩათვლით)" rows={[
              ["დღგ", eco.report.vat],
              ["ფასი დღგ-ით (გარანტიის გარეშე)", eco.report.priceWithVat],
              ["საბანკო გარანტიის ბაზა", eco.report.guaranteeBase],
              ["საბანკო გარანტიის საკომისიო", eco.report.guaranteeFee],
              ["საბოლოო კონტრაქტის ფასი", eco.report.finalContractPrice, true],
            ]}/>
          )}
          {isFull && (
            <div className="mt-4 flex items-center justify-between rounded border p-3 bg-muted/40">
              <span className="text-sm font-semibold">✓ შემოწმება: ცხრილის ჯამი − დეტალური ანგარიში</span>
              <span className={"font-mono " + (Math.abs(eco.report.checkDiff) < 0.5 ? "text-emerald-600" : "text-destructive")}>
                {fmtUsd(eco.report.checkDiff)}
              </span>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between rounded border p-3">
            <span className="text-sm">ჯამური მარჟა %</span>
            <span className={"font-semibold " + computedCls}>{fmtPct(marginPct)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportBlock({ title, rows }: { title: string; rows: Array<[string, number, boolean?]> }) {
  return (
    <div className="mb-4">
      <div className="text-sm font-semibold mb-1">{title}</div>
      <Table>
        <TableBody>
          {rows.map(([label, val, bold]) => (
            <TableRow key={label} className={bold ? "font-semibold bg-muted/30" : ""}>
              <TableCell>{label}</TableCell>
              <TableCell className={"text-right " + computedCls}>{fmtUsd(val)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
