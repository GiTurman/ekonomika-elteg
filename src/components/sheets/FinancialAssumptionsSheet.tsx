import { useEconStore } from "@/lib/econ-store";
import { useAccessRole } from "@/components/AccessGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NumberInput, PercentInput, TextInput, fmtGel, fmtUsd, fmtPct, linkedCls, computedCls } from "./sheet-ui";
import { computeTravel, allocateProjectCosts } from "@/lib/econ-calc";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

export function FinancialAssumptionsSheet() {
  const { state, updateFinance } = useEconStore();
  const { canEditField } = useAccessRole();
  const f = state.finance;
  const units = state.project.units;
  const travel = computeTravel(state);
  const alloc = allocateProjectCosts(state);
  const [refreshing, setRefreshing] = useState(false);

  const refreshRates = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?date=${f.rateDate}`);
      const data = await res.json();
      const list = data?.[0]?.currencies ?? [];
      const usd = list.find((c: any) => c.code === "USD");
      const eur = list.find((c: any) => c.code === "EUR");
      const patch: any = {}; // თარიღს არ ვცვლით — ვიღებთ კურსს ზუსტად იმ თარიღისთვის, რაც უკვე მითითებულია
      if (usd) patch.usdRate = Number(usd.rate);
      if (eur) patch.eurRate = Number(eur.rate);
      updateFinance(patch);
    } catch (e) {
      console.error("rate refresh failed", e);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle>1. სავალუტო კურსები (წყარო: nbg.gov.ge)</CardTitle>
          <Button size="sm" variant="outline" onClick={refreshRates} disabled={refreshing}>
            <RefreshCw className={"h-4 w-4 mr-1 " + (refreshing ? "animate-spin" : "")} /> განახლება
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">კურსის თარიღი</span>
            <TextInput value={f.rateDate} onChange={(v) => updateFinance({ rateDate: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">USD → GEL</span>
            <NumberInput value={f.usdRate} onChange={(v) => updateFinance({ usdRate: v })} step="0.0001" /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">EUR → GEL</span>
            <NumberInput value={f.eurRate} onChange={(v) => updateFinance({ eurRate: v })} step="0.0001" /></label>
          <div className="text-sm text-muted-foreground md:col-span-3">
            EUR/USD კროს-კურსი: <span className={computedCls}>{(f.eurRate / f.usdRate || 0).toFixed(4)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. საგადასახადო პარამეტრები</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">დღგ-ის განაკვეთი</span>
            <PercentInput value={f.vatRate} onChange={(v) => updateFinance({ vatRate: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">საშემოსავლო</span>
            <PercentInput value={f.incomeTaxRate} onChange={(v) => updateFinance({ incomeTaxRate: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">საპენსიო</span>
            <PercentInput value={f.pensionRate} onChange={(v) => updateFinance({ pensionRate: v })} /></label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. მივლინების განაკვეთები (ლარში)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">კვების ხარჯი დღეში, ერთ კაცზე</span>
              {canEditField("finance.mealPerDay") ? (
                <NumberInput value={f.mealPerDay} onChange={(v) => updateFinance({ mealPerDay: v })} />
              ) : <div className={computedCls}>{fmtGel(f.mealPerDay)}</div>}
            </label>
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">საწვავის ფასი, 1 ლ (დღგ-ით)</span>
              {canEditField("finance.fuelPricePerL") ? (
                <NumberInput value={f.fuelPricePerL} onChange={(v) => updateFinance({ fuelPricePerL: v })} />
              ) : <div className={computedCls}>{fmtGel(f.fuelPricePerL)}</div>}
            </label>
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">საწვავი ₾/კმ</span>
              <div className={computedCls}>{travel.fuelPerKm.toFixed(4)}</div></label>
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">სასტუმროს დღიური ტარიფი — მექანიკოსები (₾/დღე)</span>
              {canEditField("finance.hotelRates") ? (
                <NumberInput value={f.hotelMechanics} onChange={(v) => updateFinance({ hotelMechanics: v })} />
              ) : <div className={computedCls}>{fmtGel(f.hotelMechanics)}</div>}
            </label>
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">სასტუმროს დღიური ტარიფი — ელექტრიკოსები (₾/დღე)</span>
              {canEditField("finance.hotelRates") ? (
                <NumberInput value={f.hotelElectricians} onChange={(v) => updateFinance({ hotelElectricians: v })} />
              ) : <div className={computedCls}>{fmtGel(f.hotelElectricians)}</div>}
            </label>
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">სასტუმროს დღიური ტარიფი — ადმინისტრაცია (₾/დღე)</span>
              {canEditField("finance.hotelRates") ? (
                <NumberInput value={f.hotelAdmin} onChange={(v) => updateFinance({ hotelAdmin: v })} />
              ) : <div className={computedCls}>{fmtGel(f.hotelAdmin)}</div>}
            </label>
            <p className="md:col-span-3 text-xs text-muted-foreground">
              გამოიყენება მხოლოდ იმ ჯგუფებისთვის, რომლებსაც «პროექტის მონაცემები» ფურცელზე „საცხოვრებელი" = სასტუმრო
              აქვთ არჩეული (ჯამი = ტარიფი × დღეები). „სახლი ქირით" რეჟიმისთვის ჯამური თანხა შეიყვანება უშუალოდ იქვე.
            </p>
          </div>

          <div className="rounded border p-2">
            <div className="text-sm font-semibold mb-2">ავტომატური გათვლა — მივლინების ჯამური ხარჯი</div>
            <Table>
              <TableHeader>
                <TableRow><TableHead>ჯგუფი</TableHead><TableHead className="text-right">კვება</TableHead><TableHead className="text-right">სასტუმრო</TableHead><TableHead className="text-right">საწვავი</TableHead><TableHead className="text-right">ჯამი (₾)</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(["mechanics", "electricians", "admin"] as const).map((g, i) => (
                  <TableRow key={g}>
                    <TableCell>{["მექანიკოსები", "ელექტრიკოსები", "ადმინისტრაცია"][i]}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtGel(travel.meals[g])}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtGel(travel.hotel[g])}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtGel(travel.fuel[g])}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtGel(travel.meals[g] + travel.hotel[g] + travel.fuel[g])}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell>სულ</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtGel(travel.totalsGel.meals)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtGel(travel.totalsGel.hotel)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtGel(travel.totalsGel.fuel)}</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtGel(travel.totalsGel.grand)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={4}>სულ მივლინების ხარჯი, USD</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(travel.totalUsd)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={4}>ერთ დანადგარზე გადანაწილებული, USD</TableCell>
                  <TableCell className={"text-right " + computedCls}>{fmtUsd(travel.perUnitUsd)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>4. დანადგარების პირდაპირი ხარჯები (USD) — მიმოხილვა</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <p className="text-xs text-muted-foreground mb-2">
            რედაქტირებადია «პროექტის მონაცემები» ფურცელზე (3, 3.1). აქ მხოლოდ საინფორმაციო ჯამია.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>ქარხნული</TableHead>
                <TableHead>საბანკო საკომ.</TableHead>
                <TableHead>საერთაშ. ტრანსპ.</TableHead>
                <TableHead>ტერმინალი</TableHead>
                <TableHead>ადგ. ტრანსპ.</TableHead>
                <TableHead>მასალები</TableHead>
                <TableHead>სხვა</TableHead>
                <TableHead>დამიწება/ზედამხ.</TableHead>
                <TableHead>საშუამავლო %</TableHead>
                <TableHead>ჯამი (საშუამავლოს გარეშე)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((u) => {
                const bank = alloc.bank.get(u.id) ?? 0;
                const intT = alloc.intTransport.get(u.id) ?? 0;
                const term = alloc.terminal.get(u.id) ?? 0;
                const local = alloc.localTransport.get(u.id) ?? 0;
                const sum = u.factoryPrice + bank + intT + term + local + u.materials + u.otherCost + u.grounding;
                return (
                  <TableRow key={u.id}>
                    <TableCell className={linkedCls}>{u.id}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtUsd(u.factoryPrice)}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtUsd(bank)}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtUsd(intT)}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtUsd(term)}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtUsd(local)}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtUsd(u.materials)}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtUsd(u.otherCost)}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtUsd(u.grounding)}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtPct(u.brokerCommissionPct)}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtUsd(sum)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>6. გარანტია და მომსახურება</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">გარანტიის ვადა (წელი)</span>
            <NumberInput value={f.warrantyYears} onChange={(v) => updateFinance({ warrantyYears: v })} /></label>
          <div className="grid gap-1"><span className="text-xs text-muted-foreground">გარანტიის % (ქარხნული ფასიდან)</span>
            <span className="text-xs text-muted-foreground">დანადგარის მიხედვით — «პროექტის მონაცემები» (3.2)</span></div>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">თვიური სერვისი (USD)</span>
            {canEditField("finance.serviceGuarantee") ? (
              <NumberInput value={f.monthlyServiceUsd} onChange={(v) => updateFinance({ monthlyServiceUsd: v })} />
            ) : <div className={computedCls}>{fmtUsd(f.monthlyServiceUsd)}</div>}
          </label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">უფასო სერვისის ვადა (თვე)</span>
            {canEditField("finance.serviceGuarantee") ? (
              <NumberInput value={f.freeServiceMonths} onChange={(v) => updateFinance({ freeServiceMonths: v })} />
            ) : <div className={computedCls}>{f.freeServiceMonths}</div>}
          </label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">გარანტიის თანხა, ჯამურად (USD)</span>
            {canEditField("finance.serviceGuarantee") ? (
              <NumberInput value={f.guaranteeAmountTotal} onChange={(v) => updateFinance({ guaranteeAmountTotal: v })} />
            ) : <div className={computedCls}>{fmtUsd(f.guaranteeAmountTotal)}</div>}
          </label>
          <p className="md:col-span-2 text-xs text-muted-foreground">
            „თვიური სერვისი" და „გარანტიის თანხა" ორივე შეყვანილია პროექტის ჯამურ თანხად და ავტომატურად თანაბრად
            ნაწილდება ყველა დანადგარზე (ჯამში ზუსტად ამ თანხას უტოლდება).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>7. საბანკო გარანტია</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">გარანტიის %, სრული თანხიდან</span>
            {canEditField("finance.bankGuarantee") ? (
              <PercentInput value={f.guaranteePct} onChange={(v) => updateFinance({ guaranteePct: v })} />
            ) : <div className={computedCls}>{fmtPct(f.guaranteePct)}</div>}
          </label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">მოქმედების ვადა, დღე</span>
            {canEditField("finance.bankGuarantee") ? (
              <NumberInput value={f.guaranteeDays} onChange={(v) => updateFinance({ guaranteeDays: v })} />
            ) : <div className={computedCls}>{f.guaranteeDays}</div>}
          </label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">წლიური საკომისიო %</span>
            {canEditField("finance.bankGuarantee") ? (
              <PercentInput value={f.guaranteeAnnualPct} onChange={(v) => updateFinance({ guaranteeAnnualPct: v })} />
            ) : <div className={computedCls}>{fmtPct(f.guaranteeAnnualPct)}</div>}
          </label>
          <p className="md:col-span-3 text-xs text-muted-foreground">Act/365: საკომისიო = თანხა × წლიური % × (დღე/365)</p>
        </CardContent>
      </Card>
    </div>
  );
}
