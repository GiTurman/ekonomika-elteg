import { useEffect, useMemo, useState, Fragment } from "react";
import { listArchiveFull, type ArchiveEntryFull } from "@/lib/archive";
import { computeEconomics } from "@/lib/econ-calc";
import { normalizeAppState } from "@/lib/econ-defaults";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, RefreshCw, ChevronDown, X } from "lucide-react";
import { fmtUsd, fmtPct, computedCls } from "./sheet-ui";

const MAX_SELECTED = 3;

interface RowDef {
  label: string;
  fmt: "usd" | "pct" | "num";
  get: (eco: ReturnType<typeof computeEconomics>) => number;
  bold?: boolean;
  betterWhen?: "min" | "max"; // best-value highlight direction; omit to skip highlighting
}

const SECTIONS: Array<{ title: string; rows: RowDef[] }> = [
  {
    title: "პროექტის მოცულობა",
    rows: [
      { label: "დანადგარების რაოდენობა", fmt: "num", get: (e) => e.units.length },
      { label: "სართულების ჯამი", fmt: "num", get: (e) => e.units.reduce((s, u) => s + u.floors, 0) },
    ],
  },
  {
    title: "1. შესყიდვის ხარჯები",
    rows: [
      { label: "ქარხნული ფასი, ჯამი", fmt: "usd", get: (e) => e.report.factoryTotal, betterWhen: "min" },
      { label: "საბანკო საკომისიო", fmt: "usd", get: (e) => e.report.bankCommTotal, betterWhen: "min" },
      { label: "საერთაშორისო ტრანსპორტირება", fmt: "usd", get: (e) => e.report.intTransportTotal, betterWhen: "min" },
      { label: "ტერმინალის მომსახურება", fmt: "usd", get: (e) => e.report.terminalTotal, betterWhen: "min" },
      { label: "ადგილზე ტრანსპორტირება", fmt: "usd", get: (e) => e.report.localTransportTotal, betterWhen: "min" },
      { label: "ჯამი — შესყიდვის თვითღირებულება", fmt: "usd", get: (e) => e.report.purchaseTotal, bold: true, betterWhen: "min" },
    ],
  },
  {
    title: "2. მონტაჟის ხარჯები",
    rows: [
      { label: "მონტაჟის ანაზღაურება", fmt: "usd", get: (e) => e.report.mechPayroll, betterWhen: "min" },
      { label: "ელექტრომონტაჟი", fmt: "usd", get: (e) => e.report.elecPayroll, betterWhen: "min" },
      { label: "მივლინების ხარჯი", fmt: "usd", get: (e) => e.report.travelTotal, betterWhen: "min" },
      { label: "მასალები", fmt: "usd", get: (e) => e.report.materialsTotal, betterWhen: "min" },
      { label: "ხარაჩო", fmt: "usd", get: (e) => e.report.scaffoldingTotal, betterWhen: "min" },
      { label: "ჯამი — მონტაჟის თვითღირებულება", fmt: "usd", get: (e) => e.report.installTotal, bold: true, betterWhen: "min" },
    ],
  },
  {
    title: "3. ფასნამატი",
    rows: [
      { label: "სულ თვითღირებულება", fmt: "usd", get: (e) => e.report.costTotal, bold: true, betterWhen: "min" },
      { label: "დანადგარის ფასნამატი", fmt: "usd", get: (e) => e.report.equipmentMarkup },
      { label: "მონტაჟის ფასნამატი", fmt: "usd", get: (e) => e.report.installMarkup },
      { label: "სულ ფასნამატი", fmt: "usd", get: (e) => e.report.markupTotal, bold: true, betterWhen: "max" },
      { label: "ფასი დამატებითი ხარჯების გარეშე", fmt: "usd", get: (e) => e.report.priceNoExtras, bold: true },
    ],
  },
  {
    title: "4. დამატებითი ხარჯები",
    rows: [
      { label: "გაუთვალისწინებელი ხარჯი", fmt: "usd", get: (e) => e.report.contingency },
      { label: "საბანკო სავალუტო რისკი", fmt: "usd", get: (e) => e.report.fxRisk },
      { label: "სხვა ხარჯები", fmt: "usd", get: (e) => e.report.otherTotal },
      { label: "დამიწება/ზედამხედველობა", fmt: "usd", get: (e) => e.report.groundingTotal },
      { label: "საშუამავლო საკომისიო", fmt: "usd", get: (e) => e.report.brokerTotal },
      { label: "გარანტიის ხარჯი (%-ზე დაფუძნებული)", fmt: "usd", get: (e) => e.report.warrantyCost },
      { label: "უფასო სერვისი", fmt: "usd", get: (e) => e.report.freeServiceCost },
      { label: "გარანტიის თანხა, ჯამურად", fmt: "usd", get: (e) => e.report.guaranteeAmountCost },
      { label: "ჯამი — დამატებითი ხარჯები", fmt: "usd", get: (e) => e.report.extrasTotal, bold: true, betterWhen: "min" },
    ],
  },
  {
    title: "5. საბოლოო ფასი",
    rows: [
      { label: "ფასი დღგ-ს გარეშე", fmt: "usd", get: (e) => e.report.priceNoVat, bold: true, betterWhen: "min" },
      { label: "დღგ", fmt: "usd", get: (e) => e.report.vat },
      { label: "ფასი დღგ-ით (გარანტიის გარეშე)", fmt: "usd", get: (e) => e.report.priceWithVat },
      { label: "საბანკო გარანტიის ბაზა", fmt: "usd", get: (e) => e.report.guaranteeBase },
      { label: "საბანკო გარანტიის საკომისიო", fmt: "usd", get: (e) => e.report.guaranteeFee },
      { label: "საბოლოო კონტრაქტის ფასი (დღგ-ს ჩათვლით)", fmt: "usd", get: (e) => e.report.finalContractPrice, bold: true, betterWhen: "min" },
      { label: "ჯამური მარჟა %", fmt: "pct", get: (e) => e.report.totalMarginPct, bold: true, betterWhen: "max" },
    ],
  },
  {
    title: "საშუალო მაჩვენებლები",
    rows: [
      { label: "საშ. ფასი დანადგარზე (დღგ-ს გარეშე)", fmt: "usd", get: (e) => e.units.length ? e.report.priceNoVat / e.units.length : 0, betterWhen: "min" },
      { label: "საშ. ფასი სართულზე (დღგ-ს გარეშე)", fmt: "usd", get: (e) => {
        const floors = e.units.reduce((s, u) => s + u.floors, 0);
        return floors ? e.report.priceNoVat / floors : 0;
      }, betterWhen: "min" },
    ],
  },
];

function fmtRow(v: number, fmt: RowDef["fmt"]) {
  if (fmt === "usd") return fmtUsd(v);
  if (fmt === "pct") return fmtPct(v);
  return String(Math.round(v));
}

export function ComparisonSheet() {
  const [entries, setEntries] = useState<ArchiveEntryFull[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listArchiveFull());
    } catch (e) {
      console.error("[comparison] load failed", e);
      setError("არქივის მონაცემების ჩატვირთვა ვერ მოხერხდა.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, id];
    });
  };

  const selectedEntries = useMemo(
    () => selected.map((id) => entries.find((e) => e.id === id)).filter(Boolean) as ArchiveEntryFull[],
    [selected, entries]
  );

  const computed = useMemo(() => {
    return selectedEntries.map((entry) => {
      try {
        return { entry, eco: computeEconomics(normalizeAppState(entry.data)) };
      } catch (e) {
        console.error("[comparison] compute failed for", entry.id, e);
        return null;
      }
    }).filter(Boolean) as { entry: ArchiveEntryFull; eco: ReturnType<typeof computeEconomics> }[];
  }, [selectedEntries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          აირჩიე 2-3 დასრულებული პროექტი არქივიდან — მათი ეკონომიკის ყველა მუხლი, საწყისი ხარჯებიდან საბოლოო ფასამდე, გვერდიგვერდ შედარდება.
        </p>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          განახლება
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-3 space-y-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="justify-between min-w-[220px]">
                <span>პროექტების არჩევა ({selected.length}/{MAX_SELECTED})</span>
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-h-96 overflow-y-auto p-2" align="start">
              {entries.map((e) => {
                const checked = selected.includes(e.id);
                const disabled = !checked && selected.length >= MAX_SELECTED;
                return (
                  <label key={e.id} className={"flex items-center gap-2 px-1 py-1.5 text-sm rounded " + (disabled ? "opacity-40" : "hover:bg-muted/50 cursor-pointer")}>
                    <Checkbox checked={checked} disabled={disabled} onCheckedChange={() => toggle(e.id)} />
                    <span className="truncate">{e.name}</span>
                  </label>
                );
              })}
              {entries.length === 0 && !loading && <p className="text-xs text-muted-foreground p-2">არქივი ცარიელია.</p>}
            </PopoverContent>
          </Popover>
          {selectedEntries.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedEntries.map((e) => (
                <Badge key={e.id} variant="secondary" className="text-xs cursor-pointer" onClick={() => toggle(e.id)}>
                  {e.name} <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> იტვირთება…
        </div>
      ) : computed.length < 2 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">აირჩიე მინიმუმ 2 პროექტი შედარებისთვის.</p>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle>დანადგარები</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    {computed.map(({ entry }) => <TableHead key={entry.id}>{entry.name}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    {computed.map(({ entry }) => (
                      <TableCell key={entry.id} className="align-top">
                        <div className="space-y-1">
                          {entry.data.project.units.map((u, i) => (
                            <div key={i} className="text-xs">
                              <span className="font-medium">{u.id || "?"}</span>
                              {" — "}
                              <span className={computedCls}>{u.brand || "—"}</span>
                              {u.country ? <span className="text-muted-foreground"> ({u.country})</span> : null}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>ეკონომიკის სრული შედარება</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>მაჩვენებელი</TableHead>
                    {computed.map(({ entry }) => <TableHead key={entry.id} className="text-right">{entry.name}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SECTIONS.map((section) => (
                    <Fragment key={section.title}>
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={computed.length + 1} className="font-semibold text-xs py-1.5">{section.title}</TableCell>
                      </TableRow>
                      {section.rows.map((row) => {
                        const values = computed.map(({ eco }) => row.get(eco));
                        const best = row.betterWhen === "max" ? Math.max(...values) : row.betterWhen === "min" ? Math.min(...values) : null;
                        const allEqual = values.every((v) => v === values[0]);
                        return (
                          <TableRow key={section.title + row.label} className={row.bold ? "bg-muted/20" : ""}>
                          <TableCell className={row.bold ? "font-semibold" : ""}>{row.label}</TableCell>
                          {computed.map(({ entry }, i) => (
                            <TableCell
                              key={entry.id}
                              className={
                                "text-right " + computedCls + (row.bold ? " font-semibold" : "") +
                                (best !== null && !allEqual && values[i] === best ? " text-emerald-600" : "")
                              }
                            >
                              {fmtRow(values[i], row.fmt)}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
