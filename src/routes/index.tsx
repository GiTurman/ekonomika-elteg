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
import { PlanSheet } from "@/components/sheets/PlanSheet";
import { SalesRepSheet } from "@/components/sheets/SalesRepSheet";
import { ComparisonSheet } from "@/components/sheets/ComparisonSheet";
import { ArchiveSheet } from "@/components/sheets/ArchiveSheet";
import { VsActualSheet } from "@/components/sheets/VsActualSheet";
import { Cloud, Download, Loader2, CheckCircle2, KeyRound, Eye, X, LogOut, User, Home } from "lucide-react";
import { fmtUsd, fmtPct } from "@/components/sheets/sheet-ui";
import { useAccessRole } from "@/components/AccessGate";
import { ROLE_LABEL } from "@/lib/access";
import { ArchiveDialog } from "@/components/ArchiveDialog";
import { DataRequestDialog } from "@/components/DataRequestDialog";
import { saveToArchive, findArchiveByName, updateArchiveEntry, loadArchiveEntry } from "@/lib/archive";
import { normalizeAppState } from "@/lib/econ-defaults";
import { logActivity } from "@/lib/activityLog";
import { LogSheet } from "@/components/sheets/LogSheet";
import { PipelineSheet } from "@/components/sheets/PipelineSheet";

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
  const { state, loaded, saving, load, reset, loadedArchiveId, setLoadedArchiveId, setState } = useEconStore();
  const { isFull, logout, actorName, role, canViewPage, userId } = useAccessRole();
  const [finishing, setFinishing] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saveDialog, setSaveDialog] = useState<null | { mode: "overwrite" | "new"; name: string; existingId?: string }>(null);

  useEffect(() => { load(userId); }, [load, userId]);

  // პროექტის პირდაპირი ბმული: ?project=<archiveId> — ავტომ. ჩატვირთვა.
  // მოთხოვნის წერილში ჩასმული ლინკიდან გახსნისთვის. საწყისი load-ის შემდეგ.
  useEffect(() => {
    if (!loaded) return;
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("project");
    if (!pid) return;
    (async () => {
      try {
        const s = await loadArchiveEntry(pid);
        setState((cur) => ({ ...normalizeAppState(s), pageVisibility: cur.pageVisibility }));
        setLoadedArchiveId(pid);
        logActivity(actorName, role, "პროექტის გახსნა ბმულით", pid);
        // URL-ის გასუფთავება, რომ reload-ზე თავიდან არ ჩაიტვირთოს.
        window.history.replaceState({}, "", window.location.pathname);
      } catch (e) {
        console.error("[project-link] load failed", e);
        alert("ბმულით მითითებული პროექტი ვერ გაიხსნა (შესაძლოა წაშლილია ან წვდომა არ გაქვთ).");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

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
  const showInputTab = isFull || canViewPage("input");
  const showEconomicsTab = isFull || canViewPage("economics");
  const showPaymentTab = isFull || canViewPage("payment");
  const showTariffsTab = isFull || canViewPage("tariffs");
  const showAnalyticsTab = isFull || canViewPage("analytics");
  const showAnalyticsWorkingTab = isFull || canViewPage("analytics_working");
  const showPlanTab = isFull || canViewPage("plan");
  const showSalesRepTab = isFull || canViewPage("sales_rep");
  const showComparisonTab = isFull || canViewPage("comparison");
  const showArchiveTab = isFull || canViewPage("archive");
  const showVsActualTab = isFull || canViewPage("vs_actual");
  const showPipelineTab = isFull || canViewPage("pipeline");

  // საწყისი გვერდი — „მთავარი" (არცერთი ტაბი არ არის გახსნილი). ტაბი
  // კონტროლირებადია, რომ „მთავარი" ღილაკით ნებისმიერ დროს დავბრუნდეთ.
  const [tab, setTab] = useState<string>("home");
  const homeTiles: { value: string; title: string; desc: string; show: boolean }[] = [
    { value: "input", title: "შესატანი მონაცემები", desc: "პროექტი, დანადგარები, ფინანსური დაშვებები", show: showInputTab },
    { value: "economics", title: "ეკონომიკა", desc: "თვითღირებულება, ფასნამატი, საბოლოო ფასი", show: showEconomicsTab },
    { value: "comparison", title: "შედარება", desc: "პროექტების/ვერსიების შედარება", show: showComparisonTab },
    { value: "archive", title: "არქივი", desc: "შენახული განფასებები — გახსნა, სტატუსი", show: showArchiveTab },
    { value: "vs_actual", title: "VS ფაქტი", desc: "ბიუჯეტი vs ფაქტიური ხარჯი", show: showVsActualTab },
    { value: "payment", title: "გადახდის გრაფიკი", desc: "ტრანშები და ფულადი ნაკადი", show: showPaymentTab },
    { value: "tariffs", title: "ტარიფები", desc: "მონტაჟის ტარიფები, მინ. მარჟები", show: showTariffsTab },
    { value: "analytics", title: "ანალიტიკა", desc: "დაშბორდი და ბრენდების ჭრილი", show: showAnalyticsTab },
    { value: "analytics_working", title: "ანალიტიკა მუშა", desc: "მიმდინარე (დაუმთავრებელი) პროექტები", show: showAnalyticsWorkingTab },
    { value: "sales_rep", title: "წარმომადგენლები", desc: "პროექტები გაყიდვების მენეჯერის მიხედვით", show: showSalesRepTab },
    { value: "plan", title: "გეგმა და შესრულებები", desc: "კვარტალური გეგმა vs შესრულება", show: showPlanTab },
    { value: "pipeline", title: "პაიპლაინი / ფორმა 505", desc: "გაყიდვების პაიპლაინი და ფუნელი", show: showPipelineTab },
    { value: "log", title: "ლოგი", desc: "აქტივობა, მომხმარებლები, უფლებები", show: isFull },
  ];

  // "დასრულება და შენახვა" — ამზადებს დიალოგს (გადავაწერო?), რეალურ ჩაწერას
  // doSave აკეთებს დადასტურებაზე.
  const handleFinish = async () => {
    setSavedMsg(null);
    // არქივიდან გახსნილი პროექტი — იმავე ჩანაწერს გადავაწერთ (სახელი/თარიღი უცვლელი).
    // გამონაკლისი: „მოგებული" (კონტრაქტი გაფორმებული) პროექტის გადაწერა მხოლოდ
    // ფინანსებს შეუძლია — სხვა როლი ინახავს ახალ ჩანაწერად (ორიგინალი უცვლელია).
    const lockedWon = !isFull && state.project.status === "won";
    if (loadedArchiveId && !lockedWon) {
      setSaveDialog({ mode: "overwrite", name: state.project.projectName || "პროექტი", existingId: loadedArchiveId });
      return;
    }
    if (loadedArchiveId && lockedWon) {
      setSaveDialog({ mode: "new", name: (state.project.projectName || "პროექტი") + " (ასლი) — " + new Date().toLocaleDateString("ka-GE") });
      return;
    }
    // ახალი პროექტი — სახელი თარიღით. თუ იგივე სახელი უკვე არსებობს, გადავაწერით ვკითხავთ.
    const name = (state.project.projectName || "პროექტი") + " — " + new Date().toLocaleDateString("ka-GE");
    setFinishing(true);
    try {
      const existing = await findArchiveByName(name);
      setFinishing(false);
      if (existing) {
        setSaveDialog({ mode: "overwrite", name, existingId: existing.id });
      } else {
        setSaveDialog({ mode: "new", name });
      }
    } catch (e) {
      console.error("[archive] name check failed", e);
      setFinishing(false);
      setSaveDialog({ mode: "new", name });
    }
  };

  const doSave = async () => {
    if (!saveDialog) return;
    setFinishing(true);
    try {
      if (saveDialog.mode === "overwrite" && saveDialog.existingId) {
        // მხოლოდ data ნახლდება — სახელი და created_at (თარიღი) უცვლელი რჩება.
        await updateArchiveEntry(saveDialog.existingId, state);
        setLoadedArchiveId(saveDialog.existingId); // გახსნილად რჩება
        setSavedMsg("გადაწერილია არქივში: " + saveDialog.name);
        logActivity(actorName, role, "პროექტის გადაწერა არქივში", saveDialog.name);
      } else {
        await saveToArchive(saveDialog.name, state);
        setLoadedArchiveId(null); // ახალი ჩანაწერია — ძველ არქივის ჩანაწერს აღარ ვუკავშირდებით
        setSavedMsg("შენახულია არქივში: " + saveDialog.name);
        logActivity(actorName, role, "პროექტის შენახვა არქივში", saveDialog.name);
      }
      setSaveDialog(null);
    } catch (e) {
      console.error("[archive] save failed", e);
      alert("არქივში შენახვა ვერ მოხერხდა. სცადეთ ხელახლა.");
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Tabs value={tab} onValueChange={setTab}>
      <div className="sticky top-0 z-50 bg-background shadow-sm">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold leading-tight">{state.project.projectName || "პროექტი"} — განფასება</h1>
            <p className="text-xs text-muted-foreground">Fuji Hitech / KLEEMANN economic model (Excel template v3)</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1 whitespace-nowrap rounded-md bg-muted px-2 py-1 font-medium text-foreground" title="შესული მომხმარებელი">
              <User className="h-4 w-4" />
              {actorName ? `${actorName} — ${ROLE_LABEL[role] ?? role}` : (ROLE_LABEL[role] ?? role)}
            </span>
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Cloud className="h-4 w-4" />
              {saving ? (<><Loader2 className="h-3 w-3 animate-spin" /> ინახება…</>) : (loaded ? "დრაფტი შენახულია ამ ბრაუზერში" : "იტვირთება…")}
            </span>
            <Button size="sm" variant="outline" onClick={() => exportToXlsx(state)}>
              <Download className="h-4 w-4 mr-1" /> Excel
            </Button>
            <ArchiveDialog />
            <DataRequestDialog />
            <Button size="sm" variant="outline" onClick={() => {
              if (confirm("ახალი, ცარიელი განფასების დაწყება? მიმდინარე ეკრანი გასუფთავდება (თუ ჯერ არ შეგინახავს, ჯერ შეინახე).")) {
                reset();
                setLoadedArchiveId(null);
                logActivity(actorName, role, "ახალი, ცარიელი პროექტის დაწყება");
              }
            }}>
              ახალი
            </Button>
            <Button size="sm" onClick={handleFinish} disabled={finishing}>
              {finishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              დასრულება და შენახვა
            </Button>
            <Button size="icon" variant="ghost" title="კოდის შეცვლა" onClick={logout}>
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" title="გამოსვლა" onClick={logout}>
              <LogOut className="h-4 w-4 mr-1" /> გამოსვლა
            </Button>
          </div>
        </div>
        {state.project.units.length === 0 && Math.abs(eco.report.checkDiff) >= 0.5 && (
          <div className="container mx-auto px-4 pb-2 text-xs text-amber-700">
            დანადგარი ჯერ არ არის დამატებული — პროექტის ხარჯები (ტრანსპორტი, მივლინება, ბანკი) ვერ ნაწილდება, ამიტომ „შემოწმება" წითელია.
          </div>
        )}
        {savedMsg && (
          <div className="container mx-auto px-4 pb-2 text-xs text-emerald-600">{savedMsg}</div>
        )}
        {(isFull || canViewPage("dashboard")) && (
          <div className={"container mx-auto px-4 pb-3 grid grid-cols-2 gap-2 " + (isFull ? "md:grid-cols-6" : "md:grid-cols-5")}>
            <Kpi label={headlinePriceLabel} value={fmtUsd(headlinePrice)} />
            {isFull && <Kpi label="გასაყიდი ფასი (დღგ-ს ჩათვლით)" value={fmtUsd(eco.totals.finalPrice)} />}
            <Kpi label="სულ თვითღ." value={fmtUsd(eco.totals.totalCost)} />
            <Kpi label="ჯამური მოგების თანხა" value={fmtUsd(eco.report.markupTotal)} />
            <Kpi label="ჯამური მარჟა" value={fmtPct(isFull ? eco.report.totalMarginPct : salesMarginPct)} />
            <Kpi label="შემოწმება" value={fmtUsd(eco.report.checkDiff)} tone={Math.abs(eco.report.checkDiff) < 0.5 ? "ok" : "err"} />
          </div>
        )}
      </header>
      <div className="bg-card border-b">
        <div className="container mx-auto px-4">
        <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
          <TabsTrigger value="home" title="მთავარი გვერდი"><Home className="h-4 w-4 mr-1" /> მთავარი</TabsTrigger>
          {showInputTab && <TabsTrigger value="input">შესატანი მონაცემები</TabsTrigger>}
          {showEconomicsTab && <TabsTrigger value="economics">ეკონომიკა</TabsTrigger>}
          {showComparisonTab && <TabsTrigger value="comparison">შედარება</TabsTrigger>}
          {showArchiveTab && <TabsTrigger value="archive">არქივი</TabsTrigger>}
          {showVsActualTab && <TabsTrigger value="vs_actual">VS ფაქტი</TabsTrigger>}
          {showPaymentTab && <TabsTrigger value="payment">გადახდის გრაფიკი</TabsTrigger>}
          {showTariffsTab && <TabsTrigger value="tariffs">ტარიფები</TabsTrigger>}
          {showAnalyticsTab && <TabsTrigger value="analytics">ანალიტიკა</TabsTrigger>}
          {showAnalyticsWorkingTab && <TabsTrigger value="analytics_working">ანალიტიკა მუშა</TabsTrigger>}
          {showSalesRepTab && <TabsTrigger value="sales_rep">წარმომადგენლები</TabsTrigger>}
          {showPlanTab && <TabsTrigger value="plan">გეგმა და შესრულებები</TabsTrigger>}
          {showPipelineTab && <TabsTrigger value="pipeline">პაიპლაინი / ფორმა 505</TabsTrigger>}
          {isFull && <TabsTrigger value="log">ლოგი</TabsTrigger>}
        </TabsList>
        </div>
      </div>
      </div>

      {saveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !finishing && setSaveDialog(null)}>
          <div className="bg-card border rounded-lg shadow-lg p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                {saveDialog.mode === "overwrite" ? "მონაცემების გადაწერა" : "არქივში შენახვა"}
              </h3>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSaveDialog(null)} disabled={finishing} title="დახურვა ცვლილებების გარეშე">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {saveDialog.mode === "overwrite" ? (
                <>არქივში უკვე არსებობს ეს ჩანაწერი: <span className="font-medium text-foreground">„{saveDialog.name}“</span>. გადავაწერო არსებულ მონაცემებს? შენახვის თარიღი უცვლელი დარჩება.</>
              ) : (
                <>განფასება შეინახება არქივში ახალ ჩანაწერად: <span className="font-medium text-foreground">„{saveDialog.name}“</span>.</>
              )}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => setSaveDialog(null)} disabled={finishing}>
                <X className="h-4 w-4 mr-1" /> გაუქმება
              </Button>
              <Button size="sm" onClick={doSave} disabled={finishing}>
                {finishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                {saveDialog.mode === "overwrite" ? "გადაწერა" : "შენახვა"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-6">
          {isFull && (
            <div className="container mx-auto px-4 pt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" /> მომხმარებლების გვერდების ხედვები და კოდები იმართება „ლოგი" ტაბზე.
            </div>
          )}
          <div className="mt-4">
            <TabsContent value="home">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">მთავარი</h2>
                  <p className="text-sm text-muted-foreground">
                    {actorName ? `გამარჯობა, ${actorName}. ` : ""}აირჩიეთ განყოფილება.
                    {loadedArchiveId ? " ამჟამად გახსნილია არქივის პროექტი: " : " მიმდინარე სამუშაო პროექტი: "}
                    <span className="font-medium text-foreground">{state.project.projectName || "უსახელო"}</span>
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {homeTiles.filter((t) => t.show).map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTab(t.value)}
                      className="text-left rounded-lg border bg-card p-4 shadow-sm transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <div className="font-semibold">{t.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>
            {showInputTab && (
              <TabsContent value="input" className="space-y-6">
                <ProjectDataSheet />
                <div className="border-t pt-6">
                  <h2 className="text-base font-semibold mb-4">ფინანსური დაშვებები</h2>
                  <FinancialAssumptionsSheet />
                </div>
              </TabsContent>
            )}
            {showEconomicsTab && <TabsContent value="economics"><EconomicsSheet /></TabsContent>}
            {showComparisonTab && <TabsContent value="comparison"><ComparisonSheet /></TabsContent>}
            {showArchiveTab && <TabsContent value="archive"><ArchiveSheet /></TabsContent>}
            {showVsActualTab && <TabsContent value="vs_actual"><VsActualSheet /></TabsContent>}
            {showPaymentTab && <TabsContent value="payment"><PaymentScheduleSheet /></TabsContent>}
            {showTariffsTab && <TabsContent value="tariffs"><InstallationTariffsSheet /></TabsContent>}
            {showAnalyticsTab && <TabsContent value="analytics"><AnalyticsSheet mode="final" /></TabsContent>}
            {showAnalyticsWorkingTab && <TabsContent value="analytics_working"><AnalyticsSheet mode="working" /></TabsContent>}
            {showSalesRepTab && <TabsContent value="sales_rep"><SalesRepSheet /></TabsContent>}
            {showPlanTab && <TabsContent value="plan"><PlanSheet /></TabsContent>}
            {showPipelineTab && <TabsContent value="pipeline"><PipelineSheet /></TabsContent>}
            {isFull && <TabsContent value="log"><LogSheet /></TabsContent>}
          </div>
      </main>
      </Tabs>
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
