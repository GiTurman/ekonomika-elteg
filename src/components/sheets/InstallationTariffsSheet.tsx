import { useEconStore } from "@/lib/econ-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtNum, computedCls } from "./sheet-ui";

// Reference price list — independent (does not participate in the current project's economics)
// Prices in USD (net = C column). Gross adjusts for income + pension deductions.

interface Tariff { label: string; usdNet: number; }
const capUnder1000: Tariff[] = [
  { label: "სართულები ≤ 4 (ჯამური ფასი)", usdNet: 600 },
  { label: "სართულები ≥ 5 (დამატებითი ფასი 1 სართულზე)", usdNet: 150 },
];
const capOver1000: Tariff[] = [
  { label: "სართულები ≤ 4 (ჯამური ფასი)", usdNet: 800 },
  { label: "სართულები ≥ 5 (დამატებითი ფასი 1 სართულზე)", usdNet: 200 },
];
const elec: Tariff[] = [
  { label: "სართულები ≤ 4 (ჯამური ფასი)", usdNet: 300 },
  { label: "სართულები ≥ 5 (დამატებითი ფასი 1 სართულზე)", usdNet: 50 },
];
const helper: Tariff[] = [
  { label: "დამხმარეს ანაზღაურება", usdNet: 20 },
];

function TariffTable({ title, rows, incomeTax, pension, cross }: { title: string; rows: Tariff[]; incomeTax: number; pension: number; cross: number }) {
  const grossFactor = 1 / ((1 - incomeTax) * (1 - pension));
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>კატეგორია</TableHead>
              <TableHead className="text-right">USD ნეტო</TableHead>
              <TableHead className="text-right">USD გროსი</TableHead>
              <TableHead className="text-right">EUR ნეტო</TableHead>
              <TableHead className="text-right">EUR გროსი</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const gross = r.usdNet * grossFactor;
              const eurNet = cross ? r.usdNet / cross : 0;
              const eurGross = cross ? gross / cross : 0;
              return (
                <TableRow key={r.label}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className={"text-right " + computedCls}>$ {fmtNum(r.usdNet)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>$ {fmtNum(gross)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>€ {fmtNum(eurNet)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>€ {fmtNum(eurGross)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function InstallationTariffsSheet() {
  const { state } = useEconStore();
  const f = state.finance;
  const cross = f.eurRate / f.usdRate || 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>მონტაჟის მომსახურების სატარიფო ცხრილი</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          დამოუკიდებელი მონტაჟის მომსახურების ფასების ცნობარი (მაგ. ლიფტზე, რომელიც არ არის ამ კომპანიის მიერ მიწოდებული).
          იგი <b>არ მონაწილეობს</b> მიმდინარე პროექტის «ეკონომიკა» ფურცლის გაანგარიშებაში.
          გროსი ფასი მოიცავს საშემოსავლო და საპენსიო დარიცხვებს.
        </CardContent>
      </Card>
      <TariffTable title="სამონტაჟო სამუშაო — ტვირთამწეობა C < 1000 კგ" rows={capUnder1000} incomeTax={f.incomeTaxRate} pension={f.pensionRate} cross={cross} />
      <TariffTable title="სამონტაჟო სამუშაო — ტვირთამწეობა C ≥ 1000 კგ" rows={capOver1000} incomeTax={f.incomeTaxRate} pension={f.pensionRate} cross={cross} />
      <TariffTable title="ელექტრომონტაჟი" rows={elec} incomeTax={f.incomeTaxRate} pension={f.pensionRate} cross={cross} />
      <TariffTable title="დამხმარე პერსონალი" rows={helper} incomeTax={f.incomeTaxRate} pension={f.pensionRate} cross={cross} />
    </div>
  );
}
