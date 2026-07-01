import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
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
import { Cloud, Download, Loader2 } from "lucide-react";
import { fmtUsd, fmtPct } from "@/components/sheets/sheet-ui";

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
  const { state, loaded, saving, load } = useEconStore();
  useEffect(() => { load(); }, [load]);

  const eco = computeEconomics(state);

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
          </div>
        </div>
        <div className="container mx-auto px-4 pb-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi label="საბოლოო ფასი" value={fmtUsd(eco.totals.finalPrice)} />
          <Kpi label="სულ თვითღ." value={fmtUsd(eco.totals.totalCost)} />
          <Kpi label="ჯამური მარჟა" value={fmtPct(eco.report.totalMarginPct)} />
          <Kpi label="შემოწმება" value={fmtUsd(eco.report.checkDiff)} tone={Math.abs(eco.report.checkDiff) < 0.5 ? "ok" : "err"} />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="project">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 h-auto">
            <TabsTrigger value="project">პროექტის მონაცემები</TabsTrigger>
            <TabsTrigger value="finance">ფინანსური დაშვებები</TabsTrigger>
            <TabsTrigger value="economics">ეკონომიკა</TabsTrigger>
            <TabsTrigger value="payment">გადახდის გრაფიკი</TabsTrigger>
            <TabsTrigger value="tariffs">მონტაჟის ტარიფები</TabsTrigger>
          </TabsList>
          <div className="mt-4">
            <TabsContent value="project"><ProjectDataSheet /></TabsContent>
            <TabsContent value="finance"><FinancialAssumptionsSheet /></TabsContent>
            <TabsContent value="economics"><EconomicsSheet /></TabsContent>
            <TabsContent value="payment"><PaymentScheduleSheet /></TabsContent>
            <TabsContent value="tariffs"><InstallationTariffsSheet /></TabsContent>
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
