import { useEconStore } from "@/lib/econ-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberInput, PercentInput, TextInput, fmtUsd, computedCls } from "./sheet-ui";
import { allocateProjectCosts } from "@/lib/econ-calc";
import { Plus, Trash2 } from "lucide-react";

const UNIT_COLS: Array<{ key: keyof import("@/lib/econ-types").Unit; label: string; kind: "text" | "num" }> = [
  { key: "id", label: "#", kind: "text" },
  { key: "capacity", label: "ტვირთ. (კგ)", kind: "num" },
  { key: "floors", label: "სართ.", kind: "num" },
  { key: "currency", label: "ვალუტა", kind: "text" },
  { key: "brand", label: "ბრენდი", kind: "text" },
  { key: "model", label: "მოდელი", kind: "text" },
  { key: "country", label: "ქვეყანა", kind: "text" },
  { key: "kind", label: "სახეობა", kind: "text" },
  { key: "type", label: "ტიპი", kind: "text" },
  { key: "delivery", label: "მიწოდება", kind: "text" },
  { key: "mrType", label: "MR/MRL", kind: "text" },
  { key: "specDate", label: "სპეც. თარიღი", kind: "text" },
  { key: "variant", label: "ვარიანტი", kind: "num" },
  { key: "productionWeeks", label: "წარმოება (კვ)", kind: "num" },
  { key: "transportWeeks", label: "ტრანსპ. (კვ)", kind: "num" },
  { key: "reserveWeeks", label: "რეზერვი (კვ)", kind: "num" },
  { key: "installWeeks", label: "მონტაჟი (კვ)", kind: "num" },
];

// Directly editable per-unit $ cost fields (bank/intl-transport/terminal/local-transport
// are entered once at project level — see "3.1" card — and auto-distributed here as
// read-only columns).
const UNIT_FINANCIAL_COLS: Array<{ key: keyof import("@/lib/econ-types").Unit; label: string }> = [
  { key: "factoryPrice", label: "ქარხნული ფასი ($)" },
  { key: "materials", label: "მასალები ($)" },
  { key: "otherCost", label: "სხვა ხარჯი ($)" },
  { key: "grounding", label: "დამიწება/ზედამხედვ. ($)" },
];

// Per-unit labor rates and margin/risk parameters (moved from global "ფინანსური
// დაშვებები" — previously a single value applied to every unit).
const UNIT_RATE_COLS: Array<{ key: keyof import("@/lib/econ-types").Unit; label: string; kind: "num" | "pct" }> = [
  { key: "mechRateGel", label: "მონტაჟი (₾/სართული)", kind: "num" },
  { key: "elecRateGel", label: "ელექტრომონტაჟი (₾/სართული)", kind: "num" },
  { key: "equipmentMarkupPct", label: "დანადგარის ფასნამატი %", kind: "pct" },
  { key: "installMarkupPct", label: "მონტაჟის ფასნამატი %", kind: "pct" },
  { key: "contingencyPct", label: "გაუთვალისწინებელი %", kind: "pct" },
  { key: "fxRiskPct", label: "საბანკო სავალუტო რისკი %", kind: "pct" },
  { key: "warrantyPct", label: "გარანტიის % (ქარხნული ფასიდან)", kind: "pct" },
];

export function ProjectDataSheet() {
  const { state, updateProject, updateUnit, addUnit, removeUnit } = useEconStore();
  const p = state.project;
  const t = p.travel;
  const alloc = allocateProjectCosts(state);

  const setTravel = (patch: Partial<typeof t>) =>
    updateProject({ travel: { ...t, ...patch } });
  const setGroup = (k: "mechanics" | "electricians" | "admin", patch: Partial<typeof t.mechanics>) =>
    setTravel({ [k]: { ...t[k], ...patch } } as any);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>1. ზოგადი ინფორმაცია</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">პროექტის დასახელება</span>
          <TextInput value={p.projectName} onChange={(v) => updateProject({ projectName: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">მონტაჟის ადგილმდებარეობა</span>
          <TextInput value={p.location} onChange={(v) => updateProject({ location: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">ნაგებობის ტიპი</span>
          <TextInput value={p.buildingType} onChange={(v) => updateProject({ buildingType: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">პროექტის ჩაბარების წელი</span>
          <NumberInput value={p.completionYear} onChange={(v) => updateProject({ completionYear: v })} /></label>
          <div className="md:col-span-2 text-sm text-muted-foreground">
            დანადგარების რაოდენობა (ავტომატურად): <span className="font-mono font-semibold">{p.units.length}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>2. დანადგარების ცხრილი — ერთი სტრიქონი = ერთი დანადგარი</CardTitle>
          <Button size="sm" onClick={addUnit}><Plus className="h-4 w-4 mr-1" /> ახალი დანადგარი</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {UNIT_COLS.map((c) => <TableHead key={c.key} className="whitespace-nowrap text-xs">{c.label}</TableHead>)}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.units.map((u) => (
                <TableRow key={u.id}>
                  {UNIT_COLS.map((c) => (
                    <TableCell key={c.key} className="p-1 min-w-[92px]">
                      {c.kind === "num"
                        ? <NumberInput value={u[c.key] as number} onChange={(v) => updateUnit(u.id, { [c.key]: v } as any)} />
                        : <TextInput value={String(u[c.key] ?? "")} onChange={(v) => updateUnit(u.id, { [c.key]: v } as any)} />
                      }
                    </TableCell>
                  ))}
                  <TableCell className="p-1">
                    <Button variant="ghost" size="icon" onClick={() => removeUnit(u.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. დანადგარების ფინანსური მონაცემები — თვითღირებულების შემადგენელი მუხლები ($)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap text-xs">#</TableHead>
                {UNIT_FINANCIAL_COLS.map((c) => <TableHead key={c.key} className="whitespace-nowrap text-xs">{c.label}</TableHead>)}
                <TableHead className="whitespace-nowrap text-xs">საბანკო საკომ. ($, გადანაწ.)</TableHead>
                <TableHead className="whitespace-nowrap text-xs">საერთაშ. ტრანსპ. ($, გადანაწ.)</TableHead>
                <TableHead className="whitespace-nowrap text-xs">ტერმინალი ($, გადანაწ.)</TableHead>
                <TableHead className="whitespace-nowrap text-xs">ადგ. ტრანსპ. ($, გადანაწ.)</TableHead>
                <TableHead className="whitespace-nowrap text-xs">საშუამავლო საკ. (%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.units.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="p-1 font-semibold">{u.id}</TableCell>
                  {UNIT_FINANCIAL_COLS.map((c) => (
                    <TableCell key={c.key} className="p-1 min-w-[110px]">
                      <NumberInput value={u[c.key] as number} onChange={(v) => updateUnit(u.id, { [c.key]: v } as any)} />
                    </TableCell>
                  ))}
                  <TableCell className={"p-1 min-w-[110px] text-right " + computedCls}>{fmtUsd(alloc.bank.get(u.id) ?? 0)}</TableCell>
                  <TableCell className={"p-1 min-w-[110px] text-right " + computedCls}>{fmtUsd(alloc.intTransport.get(u.id) ?? 0)}</TableCell>
                  <TableCell className={"p-1 min-w-[110px] text-right " + computedCls}>{fmtUsd(alloc.terminal.get(u.id) ?? 0)}</TableCell>
                  <TableCell className={"p-1 min-w-[110px] text-right " + computedCls}>{fmtUsd(alloc.localTransport.get(u.id) ?? 0)}</TableCell>
                  <TableCell className="p-1 min-w-[100px]">
                    <PercentInput value={u.brokerCommissionPct} onChange={(v) => updateUnit(u.id, { brokerCommissionPct: v })} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-2">
            საბანკო საკომისიო, საერთაშორისო ტრანსპორტირება, ტერმინალი და ადგილობრივი ტრანსპორტირება
            შეყვანილია ჯამურად პროექტის დონეზე (იხ. ქვემოთ, „3.1 პროექტის ჯამური შესყიდვის ხარჯები") და
            ავტომატურად ნაწილდება დანადგარებზე ქარხნული ფასის პროპორციულად. საშუამავლო საკომისიო ემატება
            თითოეული დანადგარის საბოლოო ფასს (დღგ+გარანტიის შემდეგ).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3.1 პროექტის ჯამური შესყიდვის ხარჯები ($) — ნაწილდება ქარხნული ფასის პროპორციულად</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">საბანკო საკომისიო — ჯამი</span>
            <NumberInput value={p.bankCommissionTotal} onChange={(v) => updateProject({ bankCommissionTotal: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">საერთაშ. ტრანსპ. — ჯამი</span>
            <NumberInput value={p.intTransportTotal} onChange={(v) => updateProject({ intTransportTotal: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">ტერმინალი — ჯამი</span>
            <NumberInput value={p.terminalTotal} onChange={(v) => updateProject({ terminalTotal: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">ადგ. ტრანსპ. — ჯამი</span>
            <NumberInput value={p.localTransportTotal} onChange={(v) => updateProject({ localTransportTotal: v })} /></label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3.2 დანადგარების მონტაჟის განაკვეთები და მარჟა/რისკის პარამეტრები</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap text-xs">#</TableHead>
                {UNIT_RATE_COLS.map((c) => <TableHead key={c.key} className="whitespace-nowrap text-xs">{c.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.units.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="p-1 font-semibold">{u.id}</TableCell>
                  {UNIT_RATE_COLS.map((c) => (
                    <TableCell key={c.key} className="p-1 min-w-[110px]">
                      {c.kind === "pct"
                        ? <PercentInput value={u[c.key] as number} onChange={(v) => updateUnit(u.id, { [c.key]: v } as any)} />
                        : <NumberInput value={u[c.key] as number} onChange={(v) => updateUnit(u.id, { [c.key]: v } as any)} />
                      }
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>4. მივლინების მონაცემები — პერსონალი და ლოჯისტიკა</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ჯგუფი</TableHead>
                <TableHead>რაოდენობა (კაცი)</TableHead>
                <TableHead>მივლინების დღეები</TableHead>
                <TableHead>ჩასვლების რაოდენობა</TableHead>
                <TableHead>საცხოვრებელი</TableHead>
                <TableHead>სახლის ქირა, ჯამურად (₾) / სთ. ტარიფი</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {([["მექანიკოსები", "mechanics"], ["ელექტრიკოსები", "electricians"], ["ადმინისტრაცია", "admin"]] as const).map(([label, key]) => (
                <TableRow key={key}>
                  <TableCell>{label}</TableCell>
                  <TableCell><NumberInput value={t[key].headcount} onChange={(v) => setGroup(key, { headcount: v })} /></TableCell>
                  <TableCell><NumberInput value={t[key].days} onChange={(v) => setGroup(key, { days: v })} /></TableCell>
                  <TableCell><NumberInput value={t[key].trips} onChange={(v) => setGroup(key, { trips: v })} /></TableCell>
                  <TableCell>
                    <Select
                      value={t[key].accommodationMode}
                      onValueChange={(v) => setGroup(key, { accommodationMode: v as "house" | "hotel" })}
                    >
                      <SelectTrigger className="h-8 w-[160px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="house">სახლი ქირით</SelectItem>
                        <SelectItem value="hotel">სასტუმრო</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {t[key].accommodationMode === "house"
                      ? <NumberInput value={t[key].houseRentTotal} onChange={(v) => setGroup(key, { houseRentTotal: v })} />
                      : <span className="text-xs text-muted-foreground">დღიური ტარიფი — «ფინანსური დაშვებები»-ში</span>
                    }
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">მანძილი ოფისიდან ობიექტამდე, კმ (ერთი მიმართულებით)</span>
            <NumberInput value={t.distanceKm} onChange={(v) => setTravel({ distanceKm: v })} /></label>
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">ავტომობილის საწვავის ხარჯი, ლ/100კმ</span>
            <NumberInput value={t.fuelConsumption} onChange={(v) => setTravel({ fuelConsumption: v })} /></label>
            <label className="grid gap-1 md:col-span-2"><span className="text-xs text-muted-foreground">სამუშაო დღეები კვირაში</span>
            <TextInput value={t.workDays} onChange={(v) => setTravel({ workDays: v })} /></label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
