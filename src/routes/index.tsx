import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useEconStore } from "@/lib/econ-store";
import { computeEconomics } from "@/lib/econ-calc";
import { exportToXlsx } from "@/lib/econ-export";
import { ProjectDataSheet } from "@/components/sheets/ProjectDataSheet";
import { FinancialAssumptionsSheet } from "@/components/sheets/FinancialAssumptionsSheet";
import { EconomicsSheet } from "@/components/sheets/EconomicsSheet";
import { PaymentScheduleSheet } from "@/components/sheets/PaymentScheduleSheet";
import { InstallationTariffsSheet } from "@/components/sheets/InstallationTariffsSheet";
import { AnalyticsSheet } from "@/components/sheets/AnalyticsSheet";
import { Cloud, Download, Loader2, CheckCircle2, KeyRound } from "lucide-react";
import { fmtUsd, fmtPct } from "@/components/sheets/sheet-ui";
import { useAccessRole } from "@/components/AccessGate";
import { ArchiveDialog } from "@/components/ArchiveDialog";
import { DataRequestDialog } from "@/components/DataRequestDialog";
import { saveToArchive, findArchiveByName, updateArchiveEntry } from "@/lib/archive";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "განფასება — Fuji Hitech / KLEEMANN" },
      { name: "description", content: "პროექტის ეკონომიკური კალკულატორი (5 ფურცელი) — Fuji Hitech / KLEEMANN" },
    ],
  }),
  component: Index,
});

function Index() {
  const { state, loaded, saving, load, reset } = useEconStore();
  const { isFull, logout } = useAccessRole();
  const [finishing, setFinishing] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => { load(); }, [load]);

  const eco = computeEconomics(state);
  // ორივე კოდით ყველა მონაცემი და ტაბი სრულად ხელმისაწვდომია (დეტალური
  // ცხრილები/ანგარიშები არ იცვლება — იქ ორივე ველი, დღგ-ს გარეშე და დღგ-ით,
  // გამჭვირვალედაა ნაჩვენები აუდიტისთვის). სათაურის KPI-ებში კი როლის
  // მიხედვით სხვადასხვა "მთავარი" თანხა და მარჟა გამოისახება:
  // Full (Elteg_2026_GT!) — ფინანსების "სუფთა" ხედი: ფასი დღგ-ს გარეშე,
  //   ფასნამატი / ფასი დღგ-ს გარეშე (ხელფასები აქაც ყოველთვის გაგროსილებულია)
  // Partner (Elteg_2026!) — სრული, დღგ-ს ჩათვლით საბოლოო ფასი,
  //   ფასნამატი / გასაყიდი ფასი დღგ-ს ჩათვლით
  const salesMarginPct = eco.totals.finalPrice ? eco.report.markupTotal / eco.totals.finalPrice : 0;
  const headlinePrice = isFull ? eco.report.priceNoVat : eco.totals.finalPrice;
  const headlinePriceLabel = isFull ? "ფასი დღგ-ს გარეშე" : "საბოლოო ფასი (დღგ-ს ჩათვლით)";

  const handleFinish = async () => {
    const name = (state.project.projectName || "პროექტი") + " — " + new Date().toLocaleDateString("ka-GE");
    setFinishing(true);
    setSavedMsg(null);
    try {
      const existing = await findArchiveByName(name);
      if (existing) {
        const overwrite = confirm(
          `არქივში უკვე არსებობს იგივე სახელის ჩანაწერი: "${name}". გადავაწერო არსებული?`
        );
        if (!overwrite) {
          setFinishing(false);
          return;
        }
        await updateArchiveEntry(existing.id, state);
        setSavedMsg("გადაწერილია არქივში: " + name);
      } else {
        await saveToArchive(name, state);
        setSavedMsg("შენახულია არქივში: " + name);
      }
      const startNew = confirm("განფასება შენახულია არქივში. დავიწყოთ ახალი, ცარიელი განფასება?");
      if (startNew) {
        reset();
      }
    } catch (e) {
      console.error("[archive] save failed", e);
      alert("არქივში შენახვა ვერ მოხერხდა. სცადეთ ხელახლა.");
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold leading-tight">{state.project.projectName || "პროექტი"} — განფასება</h1>
            <p className="text-xs text-muted-foreground">Fuji Hitech / KLEEMANN economic model (Excel template v3)</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Cloud className="h-4 w-4" />
            {saving ? (<><Loader2 className="h-3 w-3 animate-spin" /> ინახება…</>) : (loaded ? "შენახულია" : "იტვირთება…")}
            <Button size="sm" variant="outline" onClick={() => exportToXlsx(state)}>
              <Download className="h-4 w-4 mr-1" /> Excel
            </Button>
            <ArchiveDialog />
            <DataRequestDialog />
            <Button size="sm" onClick={handleFinish} disabled={finishing}>
              {finishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              დასრულება და შენახვა
            </Button>
            <Button size="icon" variant="ghost" title="კოდის შეცვლა" onClick={logout}>
              <KeyRound className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {savedMsg && (
          <div className="container mx-auto px-4 pb-2 text-xs text-emerald-600">{savedMsg}</div>
        )}
        <div className={"container mx-auto px-4 pb-3 grid grid-cols-2 gap-2 " + (isFull ? "md:grid-cols-6" : "md:grid-cols-5")}>
          <Kpi label={headlinePriceLabel} value={fmtUsd(headlinePrice)} />
          {isFull && <Kpi label="გასაყიდი ფასი (დღგ-ს ჩათვლით)" value={fmtUsd(eco.totals.finalPrice)} />}
          <Kpi label="სულ თვითღ." value={fmtUsd(eco.totals.totalCost)} />
          <Kpi label="ჯამური მოგების თანხა" value={fmtUsd(eco.report.markupTotal)} />
          <Kpi label="ჯამური მარჟა" value={fmtPct(isFull ? eco.report.totalMarginPct : salesMarginPct)} />
          <Kpi label="შემოწმება" value={fmtUsd(eco.report.checkDiff)} tone={Math.abs(eco.report.checkDiff) < 0.5 ? "ok" : "err"} />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="input">
          <TabsList className={"grid h-auto " + (isFull ? "grid-cols-2 md:grid-cols-5" : "grid-cols-2 md:grid-cols-3")}>
            <TabsTrigger value="input">შესატანი მონაცემები</TabsTrigger>
            <TabsTrigger value="economics">ეკონომიკა</TabsTrigger>
            <TabsTrigger value="payment">გადახდის გრაფიკი</TabsTrigger>
            {isFull && <TabsTrigger value="tariffs">მონტაჟის ტარიფები</TabsTrigger>}
            {isFull && <TabsTrigger value="analytics">ანალიტიკა</TabsTrigger>}
          </TabsList>
          <div className="mt-4">
            <TabsContent value="input" className="space-y-6">
              <ProjectDataSheet />
              <div className="border-t pt-6">
                <h2 className="text-base font-semibold mb-4">ფინანსური დაშვებები</h2>
                <FinancialAssumptionsSheet />
              </div>
            </TabsContent>
            <TabsContent value="economics"><EconomicsSheet /></TabsContent>
            <TabsContent value="payment"><PaymentScheduleSheet /></TabsContent>
            {isFull && <TabsContent value="tariffs"><InstallationTariffsSheet /></TabsContent>}
            {isFull && <TabsContent value="analytics"><AnalyticsSheet /></TabsContent>}
          </div>
        </Tabs>
      </main>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "err" }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={"text-sm md:text-base font-semibold font-mono " + (tone === "ok" ? "text-emerald-600" : tone === "err" ? "text-destructive" : "")}>{value}</div>
      </CardContent>
    </Card>
  );
}
