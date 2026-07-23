import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Archive as ArchiveIcon, FolderOpen, Loader2, Trash2, Eraser, Copy } from "lucide-react";
import { deleteArchiveEntry, clearArchive, listArchive, loadArchiveEntry, type ArchiveEntry } from "@/lib/archive";
import { normalizeAppState } from "@/lib/econ-defaults";
import { useEconStore } from "@/lib/econ-store";
import { useAccessRole } from "@/components/AccessGate";
import { logActivity } from "@/lib/activityLog";

export function ArchiveDialog() {
  const { isFull, actorName, role } = useAccessRole();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const { setState } = useEconStore();

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await listArchive());
    } catch (e) {
      console.error("[archive] list failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const handleOpenEntry = async (id: string) => {
    if (!confirm("მიმდინარე ეკრანზე არსებული მონაცემები ჩანაცვლდება არქივიდან ამოღებული ვერსიით. გავაგრძელო?")) return;
    setBusyId(id);
    try {
      const entryName = items.find((it) => it.id === id)?.name ?? id;
      const state = await loadArchiveEntry(id);
      setState((cur) => ({ ...normalizeAppState(state), pageVisibility: cur.pageVisibility }));
      setOpen(false);
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
      setOpen(false);
      logActivity(actorName, role, "პროექტის დუბლირება ახალ ვარიანტად", `${baseName} → ${newName.trim()}`);
    } catch (e) {
      console.error("[archive] duplicate failed", e);
      alert("დუბლირება ვერ მოხერხდა.");
    } finally {
      setBusyId(null);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ArchiveIcon className="h-4 w-4 mr-1" /> არქივი
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span>დასრულებული განფასებების არქივი</span>
            {isFull && items.length > 0 && (
              <Button size="sm" variant="outline" onClick={handleClearAll} disabled={clearing}>
                {clearing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eraser className="h-4 w-4 mr-1" />}
                არქივის გასუფთავება
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> იტვირთება…
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">არქივი ცარიელია</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>დასახელება</TableHead>
                  <TableHead>თარიღი</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(it.created_at).toLocaleString("ka-GE")}
                    </TableCell>
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
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busyId === it.id}
                        onClick={() => handleDelete(it.id)}
                        title="წაშლა"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
