import { useCallback, useEffect, useMemo, useState } from "react";
import { listTrash, restoreTrash, purgeTrash, TRASH_TABLE_LABEL, type TrashItem } from "@/lib/trash";
import { useAccessRole } from "@/components/AccessGate";
import { logActivity } from "@/lib/activityLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";

const ALL = "__all__";

function fmtDate(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

// სანაგვე — მხოლოდ full როლისთვის (ჩანართიც და სერვერული ფუნქციებიც).
export function TrashSheet() {
  const { isFull, actorName, role } = useAccessRole();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [table, setTable] = useState<string>(ALL);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listTrash()); }
    catch (e) { console.error("[trash] load failed", e); alert("სანაგვის ჩატვირთვა ვერ მოხერხდა."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isFull) load(); }, [isFull, load]);

  const tables = useMemo(() => Array.from(new Set(items.map((i) => i.table_name))).sort(), [items]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((i) =>
      (table === ALL || i.table_name === table) &&
      (!s || (i.label || "").toLowerCase().includes(s) || (i.deleted_by || "").toLowerCase().includes(s)));
  }, [items, table, q]);

  if (!isFull) return null;

  const tLabel = (t: string) => TRASH_TABLE_LABEL[t] ?? t;

  const onRestore = async (it: TrashItem) => {
    if (!window.confirm(`აღვადგინო „${it.label}" (${tLabel(it.table_name)})?`)) return;
    setBusy(it.id);
    try {
      await restoreTrash(it.id);
      logActivity(actorName, role, "სანაგვიდან აღდგენა", `${tLabel(it.table_name)}: ${it.label}`);
      setItems((xs) => xs.filter((x) => x.id !== it.id));
      alert("აღდგენილია. სათანადო ჩანართში გამოსაჩენად განაახლეთ გვერდი.");
    } catch (e: any) {
      console.error("[trash] restore failed", e);
      alert(String(e?.message || "").includes("already exists")
        ? "ვერ აღდგება — იგივე იდენტიფიკატორით ჩანაწერი უკვე არსებობს."
        : "აღდგენა ვერ მოხერხდა.");
    } finally { setBusy(null); }
  };

  const onPurge = async (it: TrashItem) => {
    if (!window.confirm(`„${it.label}" საბოლოოდ წაიშლება და ვეღარ აღდგება. გავაგრძელო?`)) return;
    setBusy(it.id);
    try {
      await purgeTrash(it.id);
      logActivity(actorName, role, "სანაგვიდან საბოლოო წაშლა", `${tLabel(it.table_name)}: ${it.label}`);
      setItems((xs) => xs.filter((x) => x.id !== it.id));
    } catch (e) { console.error("[trash] purge failed", e); alert("წაშლა ვერ მოხერხდა."); }
    finally { setBusy(null); }
  };

  const onPurgeAll = async () => {
    if (!items.length) return;
    if (!window.confirm(`სანაგვე მთლიანად გასუფთავდება (${items.length} ჩანაწერი). აღდგენა შეუძლებელი იქნება. გავაგრძელო?`)) return;
    setBusy("*");
    try {
      await purgeTrash(null);
      logActivity(actorName, role, "სანაგვის გასუფთავება", `${items.length} ჩანაწერი`);
      setItems([]);
    } catch (e) { console.error("[trash] purge all failed", e); alert("გასუფთავება ვერ მოხერხდა."); }
    finally { setBusy(null); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">სანაგვე — წაშლილი ჩანაწერები</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} განახლება
          </Button>
          <Button size="sm" variant="destructive" onClick={onPurgeAll} disabled={!items.length || busy !== null}>
            <Trash2 className="h-4 w-4 mr-1" /> სანაგვის გასუფთავება
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          ყველაფერი, რაც აპლიკაციაში წაიშლება (არქივი, პაიპლაინი, გეგმები, ტარიფები, მომხმარებლები), ჯერ აქ ინახება.
          აღდგენა ბრუნებს ჩანაწერს იმავე იდენტიფიკატორით. ეს გვერდი მხოლოდ თქვენ გიჩანთ.
        </p>
        <div className="flex flex-wrap gap-2">
          <Select value={table} onValueChange={setTable}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ყველა წყარო ({items.length})</SelectItem>
              {tables.map((t) => (
                <SelectItem key={t} value={t}>{tLabel(t)} ({items.filter((i) => i.table_name === t).length})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input className="w-64" placeholder="ძებნა: დასახელება / ვინ წაშალა" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>დასახელება</TableHead>
                <TableHead>წყარო</TableHead>
                <TableHead>წაშლის დრო</TableHead>
                <TableHead>ვინ წაშალა</TableHead>
                <TableHead className="text-right">ზომა</TableHead>
                <TableHead className="text-right">მოქმედება</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
              ) : shown.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">სანაგვე ცარიელია</TableCell></TableRow>
              ) : shown.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.label}</TableCell>
                  <TableCell>{tLabel(it.table_name)}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(it.deleted_at)}</TableCell>
                  <TableCell>{it.deleted_by || "—"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{fmtSize(it.size_bytes)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="outline" className="mr-2" disabled={busy !== null} onClick={() => onRestore(it)}>
                      {busy === it.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />} აღდგენა
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="საბოლოო წაშლა" disabled={busy !== null} onClick={() => onPurge(it)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
