import { useEconStore } from "@/lib/econ-store";
import { useAccessRole } from "@/components/AccessGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberInput, PercentInput, TextInput, fmtUsd, fmtPct, computedCls } from "./sheet-ui";
import { allocateProjectCosts, clampEquipmentMarkup } from "@/lib/econ-calc";
import { EQUIPMENT_CATEGORY_LABEL, EQUIPMENT_CATEGORY_PREFIX, PROJECT_STATUS_LABEL, type EquipmentCategory, type ProjectStatus, type Unit } from "@/lib/econ-types";
import { Plus, Trash2 } from "lucide-react";
import { logActivity } from "@/lib/activityLog";
import { useEffect, useState } from "react";
import { listDropdownOptions } from "@/lib/dropdownOptions";
import { listUsers, type AppUser } from "@/lib/access";
import { listTariffRules, findMatchingLiftRule, type TariffRule } from "@/lib/installTariffRules";

const PROJECT_STATUS_ORDER: ProjectStatus[] = ["in_progress", "won", "lost", "stalled"];

const UNIT_COLS: Array<{ key: keyof import("@/lib/econ-types").Unit; label: string; kind: "text" | "num" | "select" }> = [
  { key: "id", label: "#", kind: "text" },
  { key: "capacity", label: "ტვირთ. (კგ)", kind: "num" },
  { key: "floors", label: "სართ.", kind: "num" },
  { key: "currency", label: "ვალუტა", kind: "text" },
  { key: "brand", label: "ბრენდი", kind: "select" },
  { key: "model", label: "მოდელი", kind: "text" },
  { key: "country", label: "ქვეყანა", kind: "select" },
  { key: "kind", label: "სახეობა", kind: "text" },
  { key: "type", label: "ტიპი", kind: "text" },
  { key: "delivery", label: "მიწოდება", kind: "text" },
  { key: "mrType", label: "MR/MRL", kind: "select" },
  { key: "specDate", label: "სპეც. თარიღი", kind: "text" },
  { key: "variant", label: "ვარიანტი", kind: "num" },
  { key: "productionWeeks", label: "წარმოება (კვ)", kind: "num" },
  { key: "transportWeeks", label: "ტრანსპ. (კვ)", kind: "num" },
  { key: "reserveWeeks", label: "რეზერვი (კვ)", kind: "num" },
  { key: "installWeeks", label: "მონტაჟი (კვ)", kind: "num" },
];

// UNIT_COLS-ის key-ები ერგება dropdown_options ცხრილის field_key-ებს (brand/country/mrType)
const SELECT_FIELD_MAP: Partial<Record<string, string>> = { brand: "brand", country: "country", mrType: "mrType" };

// Directly editable per-unit $ cost fields (bank/intl-transport/terminal/local-transport
// are entered once at project level — see "3.1" card — and auto-distributed here as
// read-only columns).
const UNIT_FINANCIAL_COLS: Array<{ key: keyof import("@/lib/econ-types").Unit; label: string }> = [
  { key: "factoryPrice", label: "ქარხნული ფასი ($)" },
  { key: "materials", label: "მასალები ($)" },
  { key: "scaffolding", label: "ხარაჩო ($)" },
  { key: "otherCost", label: "სხვა ხარჯი ($)" },
  { key: "grounding", label: "დამიწება/ზედამხედვ. ($)" },
];

// Per-unit labor rates and margin/risk parameters (moved from global "ფინანსური
// დაშვებები" — previously a single value applied to every unit).
const UNIT_RATE_COLS: Array<{ key: keyof import("@/lib/econ-types").Unit; label: string; kind: "num" | "pct" }> = [
  { key: "mechRateGel", label: "მონტაჟი ($/სართული)", kind: "num" },
  { key: "elecRateGel", label: "ელექტრომონტაჟი ($/სართული)", kind: "num" },
  { key: "equipmentMarkupPct", label: "დანადგარის ფასნამატი %", kind: "pct" },
  { key: "installMarkupPct", label: "მონტაჟის ფასნამატი %", kind: "pct" },
  { key: "contingencyPct", label: "გაუთვალისწინებელი %", kind: "pct" },
  { key: "overheadPct", label: "ზედნადები %", kind: "pct" },
  { key: "fxRiskPct", label: "საბანკო სავალუტო რისკი %", kind: "pct" },
  { key: "warrantyPct", label: "გარანტიის % (ქარხნული ფასიდან)", kind: "pct" },
];

export function ProjectDataSheet() {
  const { state, updateProject, updateUnit, addUnit, removeUnit, updateFinance } = useEconStore();
  const { isFull, actorName, role, canEditField, canSeeField } = useAccessRole();
  const p = state.project;
  const t = p.travel;
  const f = state.finance;
  const alloc = allocateProjectCosts(state);
  // დაწყების თარიღს პარტნიორი ავსებს პირველად; ერთხელ შევსების შემდეგ
  // მის შესწორებას მხოლოდ ფინანსები ახერხებს.
  const canEditStartDate = isFull || !p.startDate;
  const visibleUnitCols = UNIT_COLS.filter((c) => canSeeField("unit." + c.key));
  const visibleFinCols = UNIT_FINANCIAL_COLS.filter((c) => canSeeField("unit." + c.key));
  const visibleRateCols = UNIT_RATE_COLS.filter((c) => canSeeField("unit." + c.key));
  const seeCategory = canSeeField("unit.category");
  const seeBank = canSeeField("project.bankCommissionTotal");
  const seeIntTransport = canSeeField("project.intTransportTotal");
  const seeTerminal = canSeeField("project.terminalTotal");
  const seeLocalTransport = canSeeField("project.localTransportTotal");
  const seeBroker = canSeeField("unit.brokerCommissionPct");
  const seeHeadcount = canSeeField("travel.headcount");
  const seeDays = canSeeField("travel.days");
  const seeTrips = canSeeField("travel.trips");
  const seeAccommodation = canSeeField("travel.accommodation");
  const seeHouseRent = canSeeField("travel.houseRent");
  const seeDistanceFuel = canSeeField("travel.distanceFuel");

  const [dropdownOpts, setDropdownOpts] = useState<Record<string, string[]>>({});
  const [markupWarn, setMarkupWarn] = useState<Record<string, number>>({});

  // გაყიდვების როლი: დანადგარის ფასნამატის შემცირებისას მიღებული მარჟა ტარიფებში
  // დადგენილ მინიმალურ მარჟაზე ვერ ჩამოვა — ავტომატურად ეყრდნობა მინ. დასაშვებ ფასნამატს.
  // ფინანსები (full) შეზღუდვის გარეშე რედაქტირებს.
  const handleRateChange = (u: Unit, key: keyof Unit, v: number) => {
    if (key === "equipmentMarkupPct" && !isFull) {
      const minM = state.profitThresholds?.[u.category]?.minMarginPct ?? 0;
      const { pct, clamped } = clampEquipmentMarkup(state, u.id, v, minM);
      updateUnit(u.id, { equipmentMarkupPct: pct });
      setMarkupWarn((w) => {
        const n = { ...w };
        if (clamped) n[u.id] = minM; else delete n[u.id];
        return n;
      });
    } else {
      updateUnit(u.id, { [key]: v } as any);
    }
  };
  useEffect(() => {
    listDropdownOptions()
      .then((list) => setDropdownOpts(Object.fromEntries(list.map((o) => [o.fieldKey, o.options]))))
      .catch((e) => console.error("[dropdown-options] load failed", e));
  }, []);

  const [tariffRules, setTariffRules] = useState<TariffRule[]>([]);
  useEffect(() => {
    listTariffRules().catch((e) => { console.error("[tariffs] load failed", e); return []; }).then(setTariffRules);
  }, []);

  // არსებული lift-დანადგარები, რომლებსაც sales-განაკვეთი ჯერ არ აქვთ (ფუნქცია მოგვიანებით
  // დაემატა), ავტომატურად აიღებენ მას შესაბამისი ტარიფიდან — მხოლოდ sales-ველი, რეალურ
  // განაკვეთს არ ვცვლით. Loop-safe: ერთხელ შევსების შემდეგ აღარ ისვრება.
  useEffect(() => {
    if (tariffRules.length === 0) return;
    for (const u of state.project.units) {
      if (u.mechRateSalesGel !== undefined || u.elecRateSalesGel !== undefined) continue;
      if (u.category !== "lift") continue;
      const rule = findMatchingLiftRule(tariffRules, u.capacity, u.floors);
      if (rule) updateUnit(u.id, { mechRateSalesGel: rule.mechRateSales, elecRateSalesGel: rule.elecRateSales });
    }
  }, [tariffRules, state.project.units]);

  // გამყიდველების სია (sales როლი) — პროექტის "გამყიდველი" ველისთვის
  const [salesUsers, setSalesUsers] = useState<AppUser[]>([]);
  useEffect(() => {
    listUsers().then((us) => setSalesUsers(us.filter((u) => u.role === "sales"))).catch((e) => console.error("[users] load failed", e));
  }, []);

  // ტარიფის არჩევისას (ან ლიფტისთვის — ავტომატურად, ტვირთამწეობის/სართულების
  // მიხედვით) მონტაჟისა და ელექტრომონტაჟის განაკვეთები ავსებს ამ სტანდარტული
  // ტარიფიდან. ხელით შესწორება შემდეგაც შესაძლებელია.
  const applyTariff = (unitId: string, rule: TariffRule) => {
    updateUnit(unitId, { mechRateGel: rule.mechRate, elecRateGel: rule.elecRate, mechRateSalesGel: rule.mechRateSales, elecRateSalesGel: rule.elecRateSales });
  };

  // "2. დანადგარების ცხრილში" კატეგორიის/ტვირთამწეობის/სართულების შევსებისას
  // ლიფტისთვის ტარიფი ავტომატურად გამოითვლება და ერთვის იმავე patch-ში —
  // ცალკე 3.2-ში ხელით არჩევა აღარ სჭირდება (თუმცა შემდეგაც თავისუფლად
  // შესწორებადია). ესკალატორი/პლატფორმისთვის, სადაც რამდენიმე ქვეტიპია
  // შესაძლებელი ცალსახა განმასხვავებლის გარეშე, ეს კვლავ 3.2-ში ხელით ირჩევა.
  const updateUnitAndTariff = (unitId: string, patch: Partial<Unit>) => {
    const u = p.units.find((x) => x.id === unitId);
    let finalPatch: Partial<Unit> = patch;
    if (u && ("capacity" in patch || "floors" in patch || "category" in patch)) {
      const next = { ...u, ...patch };
      if (next.category === "lift") {
        const rule = findMatchingLiftRule(tariffRules, next.capacity, next.floors);
        if (rule) finalPatch = { ...patch, mechRateGel: rule.mechRate, elecRateGel: rule.elecRate, mechRateSalesGel: rule.mechRateSales, elecRateSalesGel: rule.elecRateSales };
      }
    }
    updateUnit(unitId, finalPatch);
  };

  // კატეგორიის შეცვლისას დანადგარის ID ავტომატურად ერგება კონვენციას
  // (ლიფტი→L, ესკალატორი→E, ტრაველატორი→T, საპარკინგე→PK, პლატფორმა→PL),
  // შემდეგი თავისუფალი ნომრით იმავე პროექტში.
  const handleCategoryChange = (unitId: string, category: EquipmentCategory) => {
    const prefix = EQUIPMENT_CATEGORY_PREFIX[category];
    const used = p.units
      .filter((x) => x.id !== unitId && x.id.startsWith(prefix) && /^\d+$/.test(x.id.slice(prefix.length)))
      .map((x) => parseInt(x.id.slice(prefix.length), 10));
    const nextNum = used.length ? Math.max(...used) + 1 : 1;
    updateUnitAndTariff(unitId, { category, id: `${prefix}${nextNum}` });
  };

  const setTravel = (patch: Partial<typeof t>) =>
    updateProject({ travel: { ...t, ...patch } });
  const setGroup = (k: "mechanics" | "electricians" | "admin", patch: Partial<typeof t.mechanics>) =>
    setTravel({ [k]: { ...t[k], ...patch } } as any);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>0. შიდა ინფო</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">მომუშავე პირის სახელი და გვარი</span>
          <TextInput value={p.responsiblePerson} onChange={(v) => updateProject({ responsiblePerson: v })} /></label>
          {canSeeField("project.salesPersonId") && (
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">გამყიდველი</span>
              {canEditField("project.salesPersonId") ? (
                <Select value={p.salesPersonId || "none"} onValueChange={(v) => updateProject({ salesPersonId: v === "none" ? "" : v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="აირჩიე გამყიდველი" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {salesUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div className={"h-9 flex items-center px-3 rounded-md border bg-muted/30 " + computedCls}>
                  {salesUsers.find((u) => u.id === p.salesPersonId)?.name ?? "—"}
                </div>
              )}
            </label>
          )}
          {canSeeField("project.contractDate") && (
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">კონტრაქტის გაფორმების თარიღი</span>
              {canEditField("project.contractDate") ? (
                <TextInput value={p.contractDate} onChange={(v) => updateProject({ contractDate: v })} placeholder="წწწწ-თთ-დდ" />
              ) : <div className={"h-9 flex items-center px-3 rounded-md border bg-muted/30 " + computedCls}>{p.contractDate}</div>}
            </label>
          )}
          {canSeeField("project.firstTrancheDate") && (
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">პირველი ტრანშის ჩარიცხვის თარიღი</span>
              {canEditField("project.firstTrancheDate") ? (
                <TextInput value={p.firstTrancheDate} onChange={(v) => updateProject({ firstTrancheDate: v })} placeholder="წწწწ-თთ-დდ" />
              ) : <div className={"h-9 flex items-center px-3 rounded-md border bg-muted/30 " + computedCls}>{p.firstTrancheDate}</div>}
            </label>
          )}
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">საიდან მოვიდა პროექტი</span>
          <TextInput value={p.leadSource} onChange={(v) => updateProject({ leadSource: v })} /></label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              პროექტზე მუშაობის დაწყების თარიღი{!canEditStartDate && " (კორექტირება — მხოლოდ ფინანსები)"}
            </span>
            {canEditStartDate ? (
              <TextInput value={p.startDate} onChange={(v) => updateProject({ startDate: v })} placeholder="წწწწ-თთ-დდ" />
            ) : (
              <div className={"h-9 flex items-center px-3 rounded-md border bg-muted/30 " + computedCls}>{p.startDate}</div>
            )}
          </label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">პროექტის დახურვის თარიღი</span>
          <TextInput value={p.closeDate} onChange={(v) => updateProject({ closeDate: v })} placeholder="წწწწ-თთ-დდ" /></label>
          <label className="grid gap-1 md:col-span-2"><span className="text-xs text-muted-foreground">პროექტის სტატუსი</span>
            <Select value={p.status} onValueChange={(v) => {
              updateProject({ status: v as ProjectStatus });
              logActivity(actorName, role, "პროექტის სტატუსის შეცვლა", `${p.projectName || "პროექტი"} → ${PROJECT_STATUS_LABEL[v as ProjectStatus]}`);
            }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        </CardContent>
      </Card>

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
          {canSeeField("finance.guaranteePct") && (
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">საბანკო გარანტიის % (ბაზა ფასიდან)</span>
            {canEditField("finance.guaranteePct") ? (
              <PercentInput value={f.guaranteePct} onChange={(v) => updateFinance({ guaranteePct: v })} />
            ) : <div className={"text-right " + computedCls}>{fmtPct(f.guaranteePct)}</div>}
            </label>
          )}
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
                {seeCategory && <TableHead className="whitespace-nowrap text-xs">კატეგორია</TableHead>}
                {visibleUnitCols.map((c) => <TableHead key={c.key} className="whitespace-nowrap text-xs">{c.label}</TableHead>)}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.units.map((u) => (
                <TableRow key={u.id}>
                  {seeCategory && (
                    <TableCell className="p-1 min-w-[140px]">
                      {canEditField("unit.category") ? (
                        <Select value={u.category} onValueChange={(v) => handleCategoryChange(u.id, v as EquipmentCategory)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(EQUIPMENT_CATEGORY_LABEL) as EquipmentCategory[]).map((c) => (
                              <SelectItem key={c} value={c}>{EQUIPMENT_CATEGORY_LABEL[c]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className={"h-8 flex items-center text-sm " + computedCls}>{EQUIPMENT_CATEGORY_LABEL[u.category]}</div>
                      )}
                    </TableCell>
                  )}
                  {visibleUnitCols.map((c) => (
                    <TableCell key={c.key} className="p-1 min-w-[92px]">
                      {canEditField("unit." + c.key) ? (
                        c.kind === "num" ? (
                          <NumberInput value={u[c.key] as number} onChange={(v) => updateUnitAndTariff(u.id, { [c.key]: v } as any)} />
                        ) : c.kind === "select" ? (
                          <Select value={String(u[c.key] ?? "")} onValueChange={(v) => updateUnit(u.id, { [c.key]: v } as any)}>
                            <SelectTrigger className="h-8 text-sm min-w-[110px]"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {(dropdownOpts[SELECT_FIELD_MAP[c.key] ?? ""] ?? []).map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <TextInput value={String(u[c.key] ?? "")} onChange={(v) => updateUnit(u.id, { [c.key]: v } as any)} />
                        )
                      ) : (
                        <div className={"h-8 flex items-center px-2 text-sm " + computedCls}>{String(u[c.key] ?? "")}</div>
                      )}
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
                {visibleFinCols.map((c) => <TableHead key={c.key} className="whitespace-nowrap text-xs">{c.label}</TableHead>)}
                {seeBank && <TableHead className="whitespace-nowrap text-xs">საბანკო საკომ. ($, გადანაწ.)</TableHead>}
                {seeIntTransport && <TableHead className="whitespace-nowrap text-xs">საერთაშ. ტრანსპ. ($, გადანაწ.)</TableHead>}
                {seeTerminal && <TableHead className="whitespace-nowrap text-xs">ტერმინალი ($, გადანაწ.)</TableHead>}
                {seeLocalTransport && <TableHead className="whitespace-nowrap text-xs">ადგ. ტრანსპ. ($, გადანაწ.)</TableHead>}
                {seeBroker && <TableHead className="whitespace-nowrap text-xs">საშუამავლო საკ. (%)</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.units.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="p-1 font-semibold">{u.id}</TableCell>
                  {visibleFinCols.map((c) => (
                    <TableCell key={c.key} className="p-1 min-w-[110px]">
                      {canEditField("unit." + c.key) ? (
                        <NumberInput value={u[c.key] as number} onChange={(v) => updateUnit(u.id, { [c.key]: v } as any)} />
                      ) : (
                        <div className={"text-right " + computedCls}>{fmtUsd(u[c.key] as number)}</div>
                      )}
                    </TableCell>
                  ))}
                  {seeBank && <TableCell className={"p-1 min-w-[110px] text-right " + computedCls}>{fmtUsd(alloc.bank.get(u.id) ?? 0)}</TableCell>}
                  {seeIntTransport && <TableCell className={"p-1 min-w-[110px] text-right " + computedCls}>{fmtUsd(alloc.intTransport.get(u.id) ?? 0)}</TableCell>}
                  {seeTerminal && <TableCell className={"p-1 min-w-[110px] text-right " + computedCls}>{fmtUsd(alloc.terminal.get(u.id) ?? 0)}</TableCell>}
                  {seeLocalTransport && <TableCell className={"p-1 min-w-[110px] text-right " + computedCls}>{fmtUsd(alloc.localTransport.get(u.id) ?? 0)}</TableCell>}
                  {seeBroker && (
                    <TableCell className="p-1 min-w-[100px]">
                      {canEditField("unit.brokerCommissionPct") ? (
                        <PercentInput value={u.brokerCommissionPct} onChange={(v) => updateUnit(u.id, { brokerCommissionPct: v })} />
                      ) : (
                        <div className={"text-right " + computedCls}>{fmtPct(u.brokerCommissionPct)}</div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell className="p-1">ჯამი</TableCell>
                {visibleFinCols.map((c) => (
                  <TableCell key={c.key} className={"p-1 text-right " + computedCls}>
                    {fmtUsd(p.units.reduce((s, u) => s + (Number(u[c.key]) || 0), 0))}
                  </TableCell>
                ))}
                {seeBank && <TableCell className={"p-1 text-right " + computedCls}>{fmtUsd(p.units.reduce((s, u) => s + (alloc.bank.get(u.id) ?? 0), 0))}</TableCell>}
                {seeIntTransport && <TableCell className={"p-1 text-right " + computedCls}>{fmtUsd(p.units.reduce((s, u) => s + (alloc.intTransport.get(u.id) ?? 0), 0))}</TableCell>}
                {seeTerminal && <TableCell className={"p-1 text-right " + computedCls}>{fmtUsd(p.units.reduce((s, u) => s + (alloc.terminal.get(u.id) ?? 0), 0))}</TableCell>}
                {seeLocalTransport && <TableCell className={"p-1 text-right " + computedCls}>{fmtUsd(p.units.reduce((s, u) => s + (alloc.localTransport.get(u.id) ?? 0), 0))}</TableCell>}
                {seeBroker && <TableCell className="p-1" />}
              </TableRow>
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
          {seeBank && (
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">საბანკო საკომისიო — ჯამი</span>
              {canEditField("project.bankCommissionTotal") ? (
                <NumberInput value={p.bankCommissionTotal} onChange={(v) => updateProject({ bankCommissionTotal: v })} />
              ) : <div className={computedCls}>{fmtUsd(p.bankCommissionTotal)}</div>}
            </label>
          )}
          {seeIntTransport && (
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">საერთაშ. ტრანსპ. — ჯამი</span>
              {canEditField("project.intTransportTotal") ? (
                <NumberInput value={p.intTransportTotal} onChange={(v) => updateProject({ intTransportTotal: v })} />
              ) : <div className={computedCls}>{fmtUsd(p.intTransportTotal)}</div>}
            </label>
          )}
          {seeTerminal && (
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">ტერმინალი — ჯამი</span>
              {canEditField("project.terminalTotal") ? (
                <NumberInput value={p.terminalTotal} onChange={(v) => updateProject({ terminalTotal: v })} />
              ) : <div className={computedCls}>{fmtUsd(p.terminalTotal)}</div>}
            </label>
          )}
          {seeLocalTransport && (
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">ადგ. ტრანსპ. — ჯამი</span>
              {canEditField("project.localTransportTotal") ? (
                <NumberInput value={p.localTransportTotal} onChange={(v) => updateProject({ localTransportTotal: v })} />
              ) : <div className={computedCls}>{fmtUsd(p.localTransportTotal)}</div>}
            </label>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3.2 დანადგარების მონტაჟის განაკვეთები და მარჟა/რისკის პარამეტრები</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap text-xs">#</TableHead>
                <TableHead className="whitespace-nowrap text-xs">ტარიფი</TableHead>
                {visibleRateCols.map((c) => <TableHead key={c.key} className="whitespace-nowrap text-xs">{c.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.units.map((u) => {
                const catRules = tariffRules.filter((r) => r.category === u.category);
                const suggested = u.category === "lift" ? findMatchingLiftRule(tariffRules, u.capacity, u.floors) : null;
                return (
                <TableRow key={u.id}>
                  <TableCell className="p-1 font-semibold">{u.id}</TableCell>
                  <TableCell className="p-1 min-w-[220px]">
                    {canEditField("unit.mechRateGel") ? (
                      catRules.length > 0 ? (
                        <Select value="" onValueChange={(v) => { const r = catRules.find((x) => x.id === v); if (r) applyTariff(u.id, r); }}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={suggested ? `შემოთავაზება: ${suggested.label}` : "ტარიფის არჩევა…"} />
                          </SelectTrigger>
                          <SelectContent>
                            {catRules.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.id === suggested?.id ? "✓ " : ""}{r.label} (${r.mechRate}/${r.elecRate})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">ტარიფი არ არის</span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {visibleRateCols.map((c) => (
                    <TableCell key={c.key} className="p-1 min-w-[110px]">
                      {canEditField("unit." + c.key) ? (
                        c.kind === "pct"
                          ? <PercentInput value={u[c.key] as number} onChange={(v) => handleRateChange(u, c.key, v)} />
                          : <NumberInput value={u[c.key] as number} onChange={(v) => handleRateChange(u, c.key, v)} />
                      ) : (
                        <div className={"text-right " + computedCls}>
                          {c.kind === "pct" ? fmtPct(u[c.key] as number) : (u[c.key] as number)}
                        </div>
                      )}
                      {c.key === "equipmentMarkupPct" && markupWarn[u.id] !== undefined && (
                        <div className="mt-1 text-[10px] leading-tight text-destructive">
                          მინ. მარჟა {fmtPct(markupWarn[u.id])} — ფასნამატი დაყენდა მინ. დასაშვებზე
                        </div>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
                );
              })}
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
                {seeHeadcount && <TableHead>რაოდენობა (კაცი)</TableHead>}
                {seeDays && <TableHead>მივლინების დღეები</TableHead>}
                {seeTrips && <TableHead>ჩასვლების რაოდენობა</TableHead>}
                {seeAccommodation && <TableHead>საცხოვრებელი</TableHead>}
                {seeHouseRent && <TableHead>სახლის ქირა, ჯამურად (₾) / სთ. ტარიფი</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {([["მექანიკოსები", "mechanics"], ["ელექტრიკოსები", "electricians"], ["ადმინისტრაცია", "admin"]] as const).map(([label, key]) => (
                <TableRow key={key}>
                  <TableCell>{label}</TableCell>
                  {seeHeadcount && (
                    <TableCell>
                      {canEditField("travel.headcount") ? (
                        <NumberInput value={t[key].headcount} onChange={(v) => setGroup(key, { headcount: v })} />
                      ) : <div className={computedCls}>{t[key].headcount}</div>}
                    </TableCell>
                  )}
                  {seeDays && (
                    <TableCell>
                      {canEditField("travel.days") ? (
                        <NumberInput value={t[key].days} onChange={(v) => setGroup(key, { days: v })} />
                      ) : <div className={computedCls}>{t[key].days}</div>}
                    </TableCell>
                  )}
                  {seeTrips && (
                    <TableCell>
                      {canEditField("travel.trips") ? (
                        <NumberInput value={t[key].trips} onChange={(v) => setGroup(key, { trips: v })} />
                      ) : <div className={computedCls}>{t[key].trips}</div>}
                    </TableCell>
                  )}
                  {seeAccommodation && (
                    <TableCell>
                      {canEditField("travel.accommodation") ? (
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
                      ) : (
                        <div className={computedCls}>{t[key].accommodationMode === "house" ? "სახლი ქირით" : "სასტუმრო"}</div>
                      )}
                    </TableCell>
                  )}
                  {seeHouseRent && (
                    <TableCell>
                      {t[key].accommodationMode === "house"
                        ? (canEditField("travel.houseRent") ? (
                            <NumberInput value={t[key].houseRentTotal} onChange={(v) => setGroup(key, { houseRentTotal: v })} />
                          ) : <div className={computedCls}>{fmtUsd(t[key].houseRentTotal)}</div>)
                        : <span className="text-xs text-muted-foreground">დღიური ტარიფი — «ფინანსური დაშვებები»-ში</span>
                      }
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid gap-3 md:grid-cols-2">
            {seeDistanceFuel && (
              <>
                <label className="grid gap-1"><span className="text-xs text-muted-foreground">მანძილი ოფისიდან ობიექტამდე, კმ (ერთი მიმართულებით)</span>
                  {canEditField("travel.distanceFuel") ? (
                    <NumberInput value={t.distanceKm} onChange={(v) => setTravel({ distanceKm: v })} />
                  ) : <div className={computedCls}>{t.distanceKm}</div>}
                </label>
                <label className="grid gap-1"><span className="text-xs text-muted-foreground">ავტომობილის საწვავის ხარჯი, ლ/100კმ</span>
                  {canEditField("travel.distanceFuel") ? (
                    <NumberInput value={t.fuelConsumption} onChange={(v) => setTravel({ fuelConsumption: v })} />
                  ) : <div className={computedCls}>{t.fuelConsumption}</div>}
                </label>
              </>
            )}
            <label className="grid gap-1 md:col-span-2"><span className="text-xs text-muted-foreground">სამუშაო დღეები კვირაში</span>
            <TextInput value={t.workDays} onChange={(v) => setTravel({ workDays: v })} /></label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
