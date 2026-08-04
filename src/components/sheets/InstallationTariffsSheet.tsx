import { useEffect, useState } from "react";
import { useAccessRole } from "@/components/AccessGate";
import { useEconStore } from "@/lib/econ-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { NumberInput, PercentInput, TextInput, fmtUsd, fmtPct, computedCls } from "./sheet-ui";
import { EQUIPMENT_CATEGORY_LABEL, type EquipmentCategory } from "@/lib/econ-types";
import { listTariffRules, updateTariffRule, deleteTariffRule, createTariffRule, type TariffRule } from "@/lib/installTariffRules";
import { logActivity } from "@/lib/activityLog";
import { Loader2, RefreshCw, Trash2, Plus } from "lucide-react";

const CATEGORY_ORDER: EquipmentCategory[] = ["lift", "escalator", "travelator", "parking", "platform"];

function rangeLabel(min: number | null, max: number | null, unit: string): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null) return `${min}–${max} ${unit}`;
  if (min != null) return `${min}+ ${unit}`;
  return `≤${max} ${unit}`;
}

export function InstallationTariffsSheet() {
  const { isFull, actorName, role } = useAccessRole();
  const { state, setProfitThreshold, updateDefaultRates, updateFinance } = useEconStore();
  const dr = state.defaultRates;
  const f = state.finance;
  const [rules, setRules] = useState<TariffRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setRules(await listTariffRules());
    } catch (e) {
      console.error("[tariffs] load failed", e);
      setError("ტარიფების ჩატვირთვა ვერ მოხერხდა.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const commit = async (rule: TariffRule, patch: Partial<TariffRule>, logNote?: string) => {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, ...patch } : r)));
    try {
      await updateTariffRule(rule.id, patch);
      if (logNote) logActivity(actorName, role, logNote, rule.label);
    } catch (e) {
      console.error("[tariffs] update failed", e);
      alert("განახლება ვერ მოხერხდა.");
      refresh();
    }
  };

  const handleDelete = async (rule: TariffRule) => {
    if (!confirm(`წავშალო ტარიფი "${rule.label}"?`)) return;
    try {
      await deleteTariffRule(rule.id);
      await refresh();
      logActivity(actorName, role, "სატარიფო ხაზის წაშლა", rule.label);
    } catch (e) {
      console.error("[tariffs] delete failed", e);
      alert("წაშლა ვერ მოხერხდა.");
    }
  };

  const handleAdd = async (category: EquipmentCategory) => {
    const label = prompt("ახალი ტარიფის დასახელება:");
    if (!label || !label.trim()) return;
    const id = `${category}_${Date.now()}`;
    try {
      await createTariffRule({ id, label: label.trim(), category, mechRate: 0, elecRate: 0, capMin: null, capMax: null, floorMin: null, floorMax: null, note: null });
      await refresh();
      logActivity(actorName, role, "ახალი სატარიფო ხაზის დამატება", label.trim());
    } catch (e) {
      console.error("[tariffs] create failed", e);
      alert("დამატება ვერ მოხერხდა.");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>მონტაჟის სტანდარტული ტარიფები</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>
            ეს არის კომპანიის სტანდარტული, დამტკიცებული სამონტაჟო ტარიფები (USD, ხელზე ასაღები). „შესატანი მონაცემები"
            გვერდზე, დანადგარის ტარიფის მიხედვით არჩევისას, მონტაჟისა და ელექტრომონტაჟის განაკვეთები
            <b> ავტომატურად აქედან წამოვა</b> — ხელით შესწორება შემდეგაც შესაძლებელია.
          </p>
          {isFull ? (
            <p>რედაქტირება/დამატება/წაშლა — მხოლოდ ფინანსების ხელმისაწვდომობაშია.</p>
          ) : (
            <p className="text-amber-600">ამ ცხრილის კორექტირება მხოლოდ ფინანსებს შეუძლია — შენ მხოლოდ სანახავად გაქვს წვდომა.</p>
          )}
        </CardContent>
      </Card>

      {CATEGORY_ORDER.map((cat) => {
        const catRules = rules.filter((r) => r.category === cat);
        if (catRules.length === 0 && !isFull) return null;
        return (
          <Card key={cat}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{EQUIPMENT_CATEGORY_LABEL[cat]}</CardTitle>
              <div className="flex gap-2">
                {cat === CATEGORY_ORDER[0] && (
                  <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                    განახლება
                  </Button>
                )}
                {isFull && <Button size="sm" variant="outline" onClick={() => handleAdd(cat)}><Plus className="h-4 w-4 mr-1" /> ხაზი</Button>}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {error && <p className="text-sm text-destructive mb-2">{error}</p>}
              {catRules.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">ტარიფი არ არის მითითებული.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>დასახელება</TableHead>
                      <TableHead className="text-right">მექ. $/სართ.</TableHead>
                      <TableHead className="text-right">ელ. $/სართ.</TableHead>
                      <TableHead>ტვირთამწეობა</TableHead>
                      <TableHead>სართული</TableHead>
                      {isFull && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catRules.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="p-1 min-w-[220px]">
                          {isFull ? <TextInput value={r.label} onChange={(v) => commit(r, { label: v })} /> : r.label}
                        </TableCell>
                        <TableCell className="p-1 w-28">
                          {isFull ? (
                            <NumberInput value={r.mechRate} onChange={(v) => commit(r, { mechRate: v }, "ტარიფის განახლება")} />
                          ) : (
                            <div className={"text-right " + computedCls}>{fmtUsd(r.mechRate)}</div>
                          )}
                        </TableCell>
                        <TableCell className="p-1 w-28">
                          {isFull ? (
                            <NumberInput value={r.elecRate} onChange={(v) => commit(r, { elecRate: v }, "ტარიფის განახლება")} />
                          ) : (
                            <div className={"text-right " + computedCls}>{fmtUsd(r.elecRate)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{rangeLabel(r.capMin, r.capMax, "კგ")}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{rangeLabel(r.floorMin, r.floorMax, "სართ.")}</TableCell>
                        {isFull && (
                          <TableCell className="p-1">
                            <Button size="icon" variant="ghost" onClick={() => handleDelete(r)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}

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
                        <NumberInput value={th.minAmount} onChange={(v) => setProfitThreshold(cat, { minAmount: v })} />
                      </TableCell>
                      <TableCell className="p-1 w-36">
                        <PercentInput value={th.minMarginPct} onChange={(v) => setProfitThreshold(cat, { minMarginPct: v })} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* სტანდარტული ფასნამატები და რისკი — ახალი დანადგარი ამ განაკვეთებით იწყება */}
      <Card>
        <CardHeader>
          <CardTitle>სტანდარტული ფასნამატები და რისკი (default)</CardTitle>
          <p className="text-xs text-muted-foreground">
            ეს განაკვეთები ავტომატურად მიენიჭება ახალ დანადგარს. კონკრეტული დანადგარისთვის
            ინდივიდუალური კორექტირება ხდება «შესატანი მონაცემები» ტაბზე.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>დანადგარის ფასნამატი %</TableCell>
                <TableCell className="text-right w-40">
                  {isFull ? (
                    <PercentInput value={dr.equipmentMarkupPct} onChange={(v) => updateDefaultRates({ equipmentMarkupPct: v })} />
                  ) : <div className={"text-right " + computedCls}>{fmtPct(dr.equipmentMarkupPct)}</div>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>მონტაჟის ფასნამატი %</TableCell>
                <TableCell className="text-right">
                  {isFull ? (
                    <PercentInput value={dr.installMarkupPct} onChange={(v) => updateDefaultRates({ installMarkupPct: v })} />
                  ) : <div className={"text-right " + computedCls}>{fmtPct(dr.installMarkupPct)}</div>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>გაუთვალისწინებელი ხარჯი %</TableCell>
                <TableCell className="text-right">
                  {isFull ? (
                    <PercentInput value={dr.contingencyPct} onChange={(v) => updateDefaultRates({ contingencyPct: v })} />
                  ) : <div className={"text-right " + computedCls}>{fmtPct(dr.contingencyPct)}</div>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>ზედნადები ხარჯი %</TableCell>
                <TableCell className="text-right">
                  {isFull ? (
                    <PercentInput value={dr.overheadPct} onChange={(v) => updateDefaultRates({ overheadPct: v })} />
                  ) : <div className={"text-right " + computedCls}>{fmtPct(dr.overheadPct)}</div>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>საბანკო სავალუტო რისკი %</TableCell>
                <TableCell className="text-right">
                  {isFull ? (
                    <PercentInput value={dr.fxRiskPct} onChange={(v) => updateDefaultRates({ fxRiskPct: v })} />
                  ) : <div className={"text-right " + computedCls}>{fmtPct(dr.fxRiskPct)}</div>}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* საგადასახადო პარამეტრები — იგივე გლობალური მნიშვნელობა, რაც «ფინანსურ დაშვებებში» */}
      <Card>
        <CardHeader>
          <CardTitle>საგადასახადო პარამეტრები</CardTitle>
          <p className="text-xs text-muted-foreground">იგივე მნიშვნელობა, რაც «ფინანსური დაშვებები» ტაბზე — ორივე ადგილას რედაქტირებადია.</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>დანადგარის დღგ %</TableCell>
                <TableCell className="text-right w-40">
                  {isFull ? (
                    <PercentInput value={f.equipmentVatRate} onChange={(v) => updateFinance({ equipmentVatRate: v })} />
                  ) : <div className={"text-right " + computedCls}>{fmtPct(f.equipmentVatRate)}</div>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>დღგ % (მონტაჟი/დანარჩენი)</TableCell>
                <TableCell className="text-right">
                  {isFull ? (
                    <PercentInput value={f.otherVatRate} onChange={(v) => updateFinance({ otherVatRate: v })} />
                  ) : <div className={"text-right " + computedCls}>{fmtPct(f.otherVatRate)}</div>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>საშემოსავლო %</TableCell>
                <TableCell className="text-right">
                  {isFull ? (
                    <PercentInput value={f.incomeTaxRate} onChange={(v) => updateFinance({ incomeTaxRate: v })} />
                  ) : <div className={"text-right " + computedCls}>{fmtPct(f.incomeTaxRate)}</div>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>საპენსიო %</TableCell>
                <TableCell className="text-right">
                  {isFull ? (
                    <PercentInput value={f.pensionRate} onChange={(v) => updateFinance({ pensionRate: v })} />
                  ) : <div className={"text-right " + computedCls}>{fmtPct(f.pensionRate)}</div>}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* საბანკო გარანტია — იგივე გლობალური მნიშვნელობა, რაც «ფინანსურ დაშვებებში» */}
      <Card>
        <CardHeader>
          <CardTitle>საბანკო გარანტია</CardTitle>
          <p className="text-xs text-muted-foreground">იგივე მნიშვნელობა, რაც «ფინანსური დაშვებები» ტაბზე — ორივე ადგილას რედაქტირებადია.</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>გარანტიის % (ბაზა ფასიდან)</TableCell>
                <TableCell className="text-right w-40">
                  {isFull ? (
                    <PercentInput value={f.guaranteePct} onChange={(v) => updateFinance({ guaranteePct: v })} />
                  ) : <div className={"text-right " + computedCls}>{fmtPct(f.guaranteePct)}</div>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>წლიური საკომისიო %</TableCell>
                <TableCell className="text-right">
                  {isFull ? (
                    <PercentInput value={f.guaranteeAnnualPct} onChange={(v) => updateFinance({ guaranteeAnnualPct: v })} />
                  ) : <div className={"text-right " + computedCls}>{fmtPct(f.guaranteeAnnualPct)}</div>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>დღეების რაოდენობა</TableCell>
                <TableCell className="text-right">
                  {isFull ? (
                    <NumberInput value={f.guaranteeDays} onChange={(v) => updateFinance({ guaranteeDays: v })} />
                  ) : <div className={"text-right " + computedCls}>{f.guaranteeDays}</div>}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
