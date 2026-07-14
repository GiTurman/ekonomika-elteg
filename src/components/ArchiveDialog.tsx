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
import { Archive as ArchiveIcon, FolderOpen, Loader2, Trash2, Eraser } from "lucide-react";
import { deleteArchiveEntry, clearArchive, listArchive, loadArchiveEntry, type ArchiveEntry } from "@/lib/archive";
import { useEconStore } from "@/lib/econ-store";

export function ArchiveDialog() {
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
      const state = await loadArchiveEntry(id);
      setState(() => state);
      setOpen(false);
    } catch (e) {
      console.error("[archive] load failed", e);
      alert("არქივის ჩანაწერის ჩატვირთვა ვერ მოხერხდა.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("წავშალო არქივის ეს ჩანაწერი? ეს მოქმედება შეუქცევადია.")) return;
    setBusyId(id);
    try {
      await deleteArchiveEntry(id);
      await refresh();
    } catch (e) {
      console.error("[archive] delete failed", e);
    } finally {
      setBusyId(null);
    }
  };

  const handleClearAll = async () => {
    if (items.length === 0) return;
    if (!confirm(`დარწმუნებული ხართ? წაიშლება არქივის ყველა ჩანაწერი (${items.length} ცალი). ეს მოქმედება შეუქცევადია.`)) return;
    setClearing(true);
    try {
      await clearArchive();
      await refresh();
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
            {items.length > 0 && (
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
