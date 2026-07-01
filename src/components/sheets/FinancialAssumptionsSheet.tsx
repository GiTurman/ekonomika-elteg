import { useEconStore } from "@/lib/econ-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NumberInput, PercentInput, TextInput, fmtGel, fmtUsd, linkedCls, computedCls } from "./sheet-ui";
import { computeTravel } from "@/lib/econ-calc";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

export function FinancialAssumptionsSheet() {
  const { state, updateFinance, updateUnit } = useEconStore();
  const f = state.finance;
  const units = state.project.units;
  const travel = computeTravel(state);
  const [refreshing, setRefreshing] = useState(false);

  const refreshRates = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/");
      const data = await res.json();
      const list = data?.[0]?.currencies ?? [];
      const usd = list.find((c: any) => c.code === "USD");
      const eur = list.find((c: any) => c.code === "EUR");
      const patch: any = { rateDate: new Date().toISOString().slice(0, 10) };
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
              <NumberInput value={f.mealPerDay} onChange={(v) => updateFinance({ mealPerDay: v })} /></label>
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">საწვავის ფასი, 1 ლ (დღგ-ით)</span>
              <NumberInput value={f.fuelPricePerL} onChange={(v) => updateFinance({ fuelPricePerL: v })} /></label>
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">საწვავი ₾/კმ</span>
              <div className={computedCls}>{travel.fuelPerKm.toFixed(4)}</div></label>
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">სასტუმრო — მექანიკოსები</span>
              <NumberInput value={f.hotelMechanics} onChange={(v) => updateFinance({ hotelMechanics: v })} /></label>
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">სასტუმრო — ელექტრიკოსები</span>
              <NumberInput value={f.hotelElectricians} onChange={(v) => updateFinance({ hotelElectricians: v })} /></label>
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">სასტუმრო — ადმინისტრაცია</span>
              <NumberInput value={f.hotelAdmin} onChange={(v) => updateFinance({ hotelAdmin: v })} /></label>
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
        <CardHeader><CardTitle>4. დანადგარების პირდაპირი ხარჯები (USD)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
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
                <TableHead>საშუამავლო</TableHead>
                <TableHead>ჯამი</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((u) => {
                const sum = u.factoryPrice + u.bankCommission + u.intTransport + u.terminal + u.localTransport + u.materials + u.otherCost + u.grounding + u.brokerCommission;
                const N = (k: keyof typeof u) => (
                  <NumberInput value={u[k] as number} onChange={(v) => updateUnit(u.id, { [k]: v } as any)} />
                );
                return (
                  <TableRow key={u.id}>
                    <TableCell className={linkedCls}>{u.id}</TableCell>
                    <TableCell className="p-1 min-w-[100px]">{N("factoryPrice")}</TableCell>
                    <TableCell className="p-1 min-w-[100px]">{N("bankCommission")}</TableCell>
                    <TableCell className="p-1 min-w-[100px]">{N("intTransport")}</TableCell>
                    <TableCell className="p-1 min-w-[100px]">{N("terminal")}</TableCell>
                    <TableCell className="p-1 min-w-[100px]">{N("localTransport")}</TableCell>
                    <TableCell className="p-1 min-w-[100px]">{N("materials")}</TableCell>
                    <TableCell className="p-1 min-w-[100px]">{N("otherCost")}</TableCell>
                    <TableCell className="p-1 min-w-[100px]">{N("grounding")}</TableCell>
                    <TableCell className="p-1 min-w-[100px]">{N("brokerCommission")}</TableCell>
                    <TableCell className={"text-right " + computedCls}>{fmtUsd(sum)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>4.1 მონტაჟის ანაზღაურების განაკვეთები (₾/სართული, ხელზე)</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">მონტაჟი (₾/სართული)</span>
            <NumberInput value={f.mechRateGel} onChange={(v) => updateFinance({ mechRateGel: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">ელექტრომონტაჟი (₾/სართული)</span>
            <NumberInput value={f.elecRateGel} onChange={(v) => updateFinance({ elecRateGel: v })} /></label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>5. მარჟისა და რისკის პარამეტრები</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">დანადგარის ფასნამატი %</span>
            <PercentInput value={f.equipmentMarkupPct} onChange={(v) => updateFinance({ equipmentMarkupPct: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">მონტაჟის ფასნამატი %</span>
            <PercentInput value={f.installMarkupPct} onChange={(v) => updateFinance({ installMarkupPct: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">გაუთვალისწინებელი %</span>
            <PercentInput value={f.contingencyPct} onChange={(v) => updateFinance({ contingencyPct: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">საბანკო სავალუტო რისკი %</span>
            <PercentInput value={f.fxRiskPct} onChange={(v) => updateFinance({ fxRiskPct: v })} /></label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>6. გარანტია და მომსახურება</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">გარანტიის ვადა (წელი)</span>
            <NumberInput value={f.warrantyYears} onChange={(v) => updateFinance({ warrantyYears: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">გარანტიის % (ქარხნული ფასიდან)</span>
            <PercentInput value={f.warrantyPct} onChange={(v) => updateFinance({ warrantyPct: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">თვიური სერვისი (USD)</span>
            <NumberInput value={f.monthlyServiceUsd} onChange={(v) => updateFinance({ monthlyServiceUsd: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">უფასო სერვისის ვადა (თვე)</span>
            <NumberInput value={f.freeServiceMonths} onChange={(v) => updateFinance({ freeServiceMonths: v })} /></label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>7. საბანკო გარანტია</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">გარანტიის %, სრული თანხიდან</span>
            <PercentInput value={f.guaranteePct} onChange={(v) => updateFinance({ guaranteePct: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">მოქმედების ვადა, დღე</span>
            <NumberInput value={f.guaranteeDays} onChange={(v) => updateFinance({ guaranteeDays: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">წლიური საკომისიო %</span>
            <PercentInput value={f.guaranteeAnnualPct} onChange={(v) => updateFinance({ guaranteeAnnualPct: v })} /></label>
          <p className="md:col-span-3 text-xs text-muted-foreground">Act/365: საკომისიო = თანხა × წლიური % × (დღე/365)</p>
        </CardContent>
      </Card>
    </div>
  );
}
