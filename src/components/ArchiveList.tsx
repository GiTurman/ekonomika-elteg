import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FolderOpen, Loader2, Trash2, Eraser, Copy, X, Replace } from "lucide-react";
import { deleteArchiveEntry, clearArchive, listArchiveFull, loadArchiveEntry, setIncludeInAnalytics, renameAcrossArchive, type RenameField, type ArchiveEntryFull } from "@/lib/archive";
import { normalizeAppState } from "@/lib/econ-defaults";
import { EQUIPMENT_CATEGORY_LABEL } from "@/lib/econ-types";
import { useEconStore } from "@/lib/econ-store";
import { useAccessRole } from "@/components/AccessGate";
import { logActivity } from "@/lib/activityLog";

// პროექტის დანადგარებიდან — უნიკალური ბრენდები, ტიპები, ქვეყნები, არქივის
// სიაში მოკლე მიმოხილვისთვის (დასახელების ქვეშ, პატარა ტექსტად).
function summarizeUnits(entry: ArchiveEntryFull): string {
  const units = entry.data?.project?.units ?? [];
  if (units.length === 0) return "";
  const brands = Array.from(new Set(units.map((u) => u.brand?.trim()).filter(Boolean)));
  const kinds = Array.from(new Set(units.map((u) => EQUIPMENT_CATEGORY_LABEL[u.category] ?? u.category).filter(Boolean)));
  const countries = Array.from(new Set(units.map((u) => u.country?.trim()).filter(Boolean)));
  const parts: string[] = [];
  if (brands.length) parts.push(`ბრენდი: ${brands.join(", ")}`);
  if (kinds.length) parts.push(`ტიპი: ${kinds.join(", ")}`);
  if (countries.length) parts.push(`ქვეყანა: ${countries.join(", ")}`);
  return parts.join(" · ");
}

// გაზიარებული არქივის სია — გამოიყენება ორივეგან: თავზე Dialog-ითა (სწრაფი
// წვდომისთვის) და ცალკე "არქივის" ტაბად (იგივე ხედვები/მოქმედებები).
export function ArchiveList({ onNavigateAway, autoLoad = true }: { onNavigateAway?: () => void; autoLoad?: boolean }) {
  const { isFull, actorName, role } = useAccessRole();
  const [items, setItems] = useState<ArchiveEntryFull[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const { setState, setLoadedArchiveId } = useEconStore();

  // "სახელების ჩასწორება" dialog — ყველა არქივში ტექსტური სახელის ჩანაცვლება
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameField, setRenameField] = useState<RenameField>("kind");
  const [renameOld, setRenameOld] = useState("");
  const [renameNew, setRenameNew] = useState("");
  const [renaming, setRenaming] = useState(false);

  const RENAME_FIELD_LABEL: Record<RenameField, string> = {
    brand: "ბრენდი", kind: "სახეობა", model: "მოდელი", type: "ტიპი", country: "ქვეყანა",
  };

  const handleRename = async () => {
    if (!renameOld.trim()) { alert("მიუთითე ძველი სახელი."); return; }
    setRenaming(true);
    try {
      const n = await renameAcrossArchive(renameField, renameOld, renameNew);
      await refresh();
      logActivity(actorName, role, "არქივში სახელის ჩასწორება",
        `${RENAME_FIELD_LABEL[renameField]}: "${renameOld.trim()}" → "${renameNew.trim()}" (${n} ჩანაწერი)`);
      alert(n > 0 ? `განახლდა ${n} ჩანაწერი.` : "დამთხვევა ვერ მოიძებნა — შესაძლოა სახელი ზუსტად არ ემთხვევა.");
      setRenameOpen(false);
      setRenameOld(""); setRenameNew("");
    } catch (e) {
      console.error("[archive] rename failed", e);
      alert("სახელების ჩასწორება ვერ მოხერხდა.");
    } finally {
      setRenaming(false);
    }
  };

  const years = useMemo(() => {
    const set = new Set(items.map((it) => new Date(it.created_at).getFullYear()));
    return Array.from(set).sort((a, b) => b - a);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const d = new Date(it.created_at);
      if (yearFilter !== "all" && String(d.getFullYear()) !== yearFilter) return false;
      if (dateFrom && d < new Date(dateFrom + "T00:00:00")) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [items, yearFilter, dateFrom, dateTo]);

  const hasActiveFilter = yearFilter !== "all" || !!dateFrom || !!dateTo;
  const clearFilters = () => { setYearFilter("all"); setDateFrom(""); setDateTo(""); };

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await listArchiveFull());
    } catch (e) {
      console.error("[archive] list failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad]);

  const handleOpenEntry = async (id: string) => {
    if (!confirm("მიმდინარე ეკრანზე არსებული მონაცემები ჩანაცვლდება არქივიდან ამოღებული ვერსიით. გავაგრძელო?")) return;
    setBusyId(id);
    try {
      const entryName = items.find((it) => it.id === id)?.name ?? id;
      const state = await loadArchiveEntry(id);
      setState((cur) => ({ ...normalizeAppState(state), pageVisibility: cur.pageVisibility }));
      setLoadedArchiveId(id); // ხელახლა შენახვისას ამ ჩანაწერს გადააწერს (თარიღი უცვლელი)
      onNavigateAway?.();
      logActivity(actorName, role, "არქივიდან პროექტის გახსნა", entryName);
    } catch (e) {
      console.error("[archive] load failed", e);
      alert("არქივის ჩანაწერის ჩატვირთვა ვერ მოხერხდა.");
    } finally {
      setBusyId(null);
    }
  };

  // ერთი პროექტის რამდენიმე ვარიანტისთვის — სრულად აკოპირებს არჩეულ არქივის
  // ჩანაწერს სამუშაო ეკრანზე, სახელს სთავაზობს "— ვარიანტი 2" და ა.შ., და
  // "დასრულება და შენახვისას" ცალკე ჩანაწერად ინახება. ორიგინალს არ ეხება.
  const handleDuplicateVariant = async (id: string) => {
    if (!confirm("მიმდინარე ეკრანზე არსებული მონაცემები ჩანაცვლდება ამ პროექტის ასლით — ახალი ვარიანტისთვის. გავაგრძელო?")) return;
    setBusyId(id);
    try {
      const raw = await loadArchiveEntry(id);
      const normalized = normalizeAppState(raw);
      const baseName = normalized.project.projectName.replace(/\s*—\s*ვარიანტი\s*\d+\s*$/, "").trim();
      const suggested = `${baseName} — ვარიანტი 2`;
      const newName = prompt("ახალი ვარიანტის დასახელება (საჭიროებისამებრ შეასწორე ნომერი):", suggested);
      if (!newName || !newName.trim()) { setBusyId(null); return; }
      setState((cur) => ({
        ...normalized,
        project: { ...normalized.project, projectName: newName.trim() },
        pageVisibility: cur.pageVisibility,
      }));
      setLoadedArchiveId(null); // ახალი ვარიანტი — ცალკე ჩანაწერად შეინახოს, ორიგინალს არ ეხება
      onNavigateAway?.();
      logActivity(actorName, role, "პროექტის დუბლირება ახალ ვარიანტად", `${baseName} → ${newName.trim()}`);
    } catch (e) {
      console.error("[archive] duplicate failed", e);
      alert("დუბლირება ვერ მოხერხდა.");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleAnalytics = async (it: ArchiveEntryFull) => {
    const next = !it.include_in_analytics;
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, include_in_analytics: next } : x)));
    try {
      await setIncludeInAnalytics(it.id, next);
      logActivity(actorName, role, "ანალიტიკაში ჩართვის შეცვლა", `${it.name} → ${next ? "ჩართული" : "გამორთული"}`);
    } catch (e) {
      console.error("[archive] analytics toggle failed", e);
      alert("განახლება ვერ მოხერხდა.");
      refresh();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("წავშალო არქივის ეს ჩანაწერი? ეს მოქმედება შეუქცევადია.")) return;
    setBusyId(id);
    try {
      const entryName = items.find((it) => it.id === id)?.name ?? id;
      await deleteArchiveEntry(id);
      await refresh();
      logActivity(actorName, role, "არქივის ჩანაწერის წაშლა", entryName);
    } catch (e) {
      console.error("[archive] delete failed", e);
    } finally {
      setBusyId(null);
    }
  };

  const handleClearAll = async () => {
    if (items.length === 0) return;
    if (!confirm(`დარწმუნებული ხართ? წაიშლება არქივის ყველა ჩანაწერი (${items.length} ცალი). ეს მოქმედება შეუქცევადია.`)) return;
    const count = items.length;
    setClearing(true);
    try {
      await clearArchive();
      await refresh();
      logActivity(actorName, role, "არქივის სრული გასუფთავება", `${count} ჩანაწერი`);
    } catch (e) {
      console.error("[archive] clear failed", e);
      alert("არქივის გასუფთავება ვერ მოხერხდა.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          განახლება
        </Button>
        {isFull && items.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setRenameOpen(true)}>
            <Replace className="h-4 w-4 mr-1" />
            სახელების ჩასწორება
          </Button>
        )}
        {isFull && items.length > 0 && (
          <Button size="sm" variant="outline" onClick={handleClearAll} disabled={clearing}>
            {clearing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eraser className="h-4 w-4 mr-1" />}
            არქივის გასუფთავება
          </Button>
        )}
      </div>

      {renameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRenameOpen(false)}>
          <div className="bg-card border rounded-lg shadow-lg p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">სახელების ჩასწორება არქივში</h3>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRenameOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ყველა არქივის ჩანაწერში, არჩეულ ველში ზუსტ სახელს ჩაანაცვლებს ახლით.
              შენახვის თარიღი უცვლელი რჩება.
            </p>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">ველი</span>
              <Select value={renameField} onValueChange={(v) => setRenameField(v as RenameField)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="brand">ბრენდი</SelectItem>
                  <SelectItem value="kind">სახეობა</SelectItem>
                  <SelectItem value="model">მოდელი</SelectItem>
                  <SelectItem value="type">ტიპი</SelectItem>
                  <SelectItem value="country">ქვეყანა</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">ძველი სახელი (ზუსტად)</span>
              <Input value={renameOld} onChange={(e) => setRenameOld(e.target.value)} placeholder="მაგ. dumb" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">ახალი სახელი</span>
              <Input value={renameNew} onChange={(e) => setRenameNew(e.target.value)} placeholder="მაგ. dumwaiter" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => setRenameOpen(false)} disabled={renaming}>
                <X className="h-4 w-4 mr-1" /> გაუქმება
              </Button>
              <Button size="sm" onClick={handleRename} disabled={renaming}>
                {renaming ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Replace className="h-4 w-4 mr-1" />}
                ჩასწორება
              </Button>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-xs text-muted-foreground whitespace-nowrap">ფილტრი:</span>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="წელი" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ყველა წელი</SelectItem>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">-დან</span>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-36 text-xs" />
          <span className="text-xs text-muted-foreground">-მდე</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-36 text-xs" />
          {hasActiveFilter && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" /> გასუფთავება
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{filteredItems.length} / {items.length}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> იტვირთება…
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">არქივი ცარიელია</p>
      ) : filteredItems.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">ფილტრით ჩანაწერი ვერ მოიძებნა.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>დასახელება</TableHead>
                <TableHead>თარიღი</TableHead>
                {isFull && <TableHead className="text-center">ანალიტიკაში</TableHead>}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((it) => {
                const summary = summarizeUnits(it);
                return (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">
                      <div>{it.name}</div>
                      {summary && <div className="text-xs text-muted-foreground font-normal mt-0.5">{summary}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(it.created_at).toLocaleString("ka-GE")}
                    </TableCell>
                    {isFull && (
                      <TableCell className="text-center">
                        <Checkbox checked={it.include_in_analytics} onCheckedChange={() => handleToggleAnalytics(it)} />
                      </TableCell>
                    )}
                    <TableCell className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busyId === it.id}
                        onClick={() => handleOpenEntry(it.id)}
                        title="გახსნა"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busyId === it.id}
                        onClick={() => handleDuplicateVariant(it.id)}
                        title="დუბლირება ახალ ვარიანტად"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {/* წაშლა მხოლოდ ფინანსებს (როგორც „არქივის გასუფთავება") — სხვა როლს
                          არქივის ისტორიის (გაყიდვების შესრულების წყარო) წაშლა არ შეუძლია. */}
                      {isFull && (
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={busyId === it.id}
                          onClick={() => handleDelete(it.id)}
                          title="წაშლა"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
