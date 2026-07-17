import { useEconStore } from "@/lib/econ-store";
import { useAccessRole } from "@/components/AccessGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NumberInput, PercentInput, fmtUsd, fmtPct, fmtNum, computedCls } from "./sheet-ui";
import { EQUIPMENT_CATEGORY_LABEL, type EquipmentCategory, type InstallTariffs } from "@/lib/econ-types";

const SECTIONS: Array<{ key: keyof InstallTariffs; title: string }> = [
  { key: "capUnder1000", title: "სამონტაჟო სამუშაო — ტვირთამწეობა < 1000 კგ" },
  { key: "capOver1000", title: "სამონტაჟო სამუშაო — ტვირთამწეობა ≥ 1000 კგ" },
  { key: "elec", title: "ელექტრომონტაჟი" },
  { key: "helper", title: "დამხმარე პერსონალი" },
];

const CATEGORY_ORDER: EquipmentCategory[] = ["lift", "escalator", "travelator", "parking", "platform"];

export function InstallationTariffsSheet() {
  const { state, setTariffRow, setProfitThreshold } = useEconStore();
  const { isFull } = useAccessRole();
  const f = state.finance;
  const grossFactor = 1 / ((1 - f.incomeTaxRate) * (1 - f.pensionRate));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>მონტაჟის მომსახურების სატარიფო ცხრილი</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          დამოუკიდებელი მონტაჟის მომსახურების ფასების ცნობარი (მაგ. ლიფტზე, რომელიც არ არის ამ კომპანიის მიერ მიწოდებული).
          იგი <b>არ მონაწილეობს</b> მიმდინარე პროექტის «ეკონომიკა» ფურცლის გაანგარიშებაში. ღირებულებები კორექტირებადია და
          ინახება ავტომატურად. გროსი ფასი ავტომატურად ითვლის საშემოსავლო და საპენსიო დარიცხვებს (ნეტოდან) — მხოლოდ დოლარში.
        </CardContent>
      </Card>

      {SECTIONS.map((sec) => (
        <Card key={sec.key}>
          <CardHeader><CardTitle>{sec.title}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>კატეგორია</TableHead>
                  <TableHead className="text-right">USD ნეტო</TableHead>
                  <TableHead className="text-right">USD გროსი</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.tariffs[sec.key].map((r, i) => {
                  const gross = r.usdNet * grossFactor;
                  return (
                    <TableRow key={r.label}>
                      <TableCell className="text-sm">{r.label}</TableCell>
                      <TableCell className="p-1 w-36">
                        {isFull ? (
                          <NumberInput value={r.usdNet} onChange={(v) => setTariffRow(sec.key, i, v)} />
                        ) : (
                          <div className={"text-right " + computedCls}>{fmtUsd(r.usdNet)}</div>
                        )}
                      </TableCell>
                      <TableCell className={"text-right " + computedCls}>$ {fmtNum(gross)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader><CardTitle>მინიმალური მოგების ზღვრები დანადგარის კატეგორიის მიხედვით</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            თუ დანადგარის ფასნამატის თანხა ან მარჟა ამ ზღვარს ჩამოცდება, «ეკონომიკა» ფურცელზე შესაბამისი დანადგარი
            გაწითლდება და გამოჩნდება გაფრთხილება — თუმცა მუშაობა (შენახვა, გაგრძელება) ისევ შესაძლებელი იქნება.
            ნულოვანი მნიშვნელობა ნიშნავს, რომ ზღვარი გამორთულია.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>დანადგარის კატეგორია</TableHead>
                  <TableHead className="text-right">მინ. მოგების თანხა ($)</TableHead>
                  <TableHead className="text-right">მინ. მოგების მარჟა (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CATEGORY_ORDER.map((cat) => {
                  const th = state.profitThresholds[cat];
                  return (
                    <TableRow key={cat}>
                      <TableCell className="text-sm font-medium">{EQUIPMENT_CATEGORY_LABEL[cat]}</TableCell>
                      <TableCell className="p-1 w-36">
                        {isFull ? (
                          <NumberInput value={th.minAmount} onChange={(v) => setProfitThreshold(cat, { minAmount: v })} />
                        ) : (
                          <div className={"text-right " + computedCls}>{fmtUsd(th.minAmount)}</div>
                        )}
                      </TableCell>
                      <TableCell className="p-1 w-36">
                        {isFull ? (
                          <PercentInput value={th.minMarginPct} onChange={(v) => setProfitThreshold(cat, { minMarginPct: v })} />
                        ) : (
                          <div className={"text-right " + computedCls}>{fmtPct(th.minMarginPct)}</div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
