import { useEffect, useState } from "react";
import { listActivityLog, type ActivityLogEntry } from "@/lib/activityLog";
import { listUsers, createUser, updateUser, deleteUser, type AppUser, type AccessRole } from "@/lib/access";
import { useAccessRole } from "@/components/AccessGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TextInput } from "./sheet-ui";
import { Loader2, RefreshCw, Plus, Trash2 } from "lucide-react";
import { logActivity } from "@/lib/activityLog";

const ROLE_LABEL: Record<string, string> = { full: "ფინანსები", partial: "პარტნიორი" };
const PAGE_COLS: Array<{ key: "input" | "economics" | "payment" | "tariffs" | "analytics" | "comparison"; label: string }> = [
  { key: "input", label: "შესატანი" },
  { key: "economics", label: "ეკონომიკა" },
  { key: "comparison", label: "შედარება" },
  { key: "payment", label: "გადახდები" },
  { key: "tariffs", label: "ტარიფები" },
  { key: "analytics", label: "ანალიტიკა" },
];

function UsersPanel() {
  const { actorName, role: myRole } = useAccessRole();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (e) {
      console.error("[users] load failed", e);
      setError("მომხმარებლების ჩატვირთვა ვერ მოხერხდა.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleAdd = async () => {
    const name = prompt("ახალი მომხმარებლის სახელი და გვარი:");
    if (!name || !name.trim()) return;
    const code = prompt("მისანიჭებელი კოდი:");
    if (!code || !code.trim()) return;
    try {
      await createUser(name.trim(), code.trim(), "partial");
      await refresh();
      logActivity(actorName, myRole, "ახალი მომხმარებლის დამატება", name.trim());
    } catch (e: any) {
      console.error("[users] create failed", e);
      alert("მომხმარებლის დამატება ვერ მოხერხდა — შესაძლოა კოდი უკვე დაკავებულია.");
    }
  };

  const handleUpdate = async (u: AppUser, patch: Parameters<typeof updateUser>[1], logNote?: string) => {
    try {
      await updateUser(u.id, patch);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? {
        ...x,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.code !== undefined ? { code: patch.code } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        pageVisibility: {
          input: patch.input ?? x.pageVisibility.input,
          economics: patch.economics ?? x.pageVisibility.economics,
          payment: patch.payment ?? x.pageVisibility.payment,
          tariffs: patch.tariffs ?? x.pageVisibility.tariffs,
          analytics: patch.analytics ?? x.pageVisibility.analytics,
          comparison: patch.comparison ?? x.pageVisibility.comparison,
        },
      } : x)));
      if (logNote) logActivity(actorName, myRole, logNote, u.name);
    } catch (e) {
      console.error("[users] update failed", e);
      alert("განახლება ვერ მოხერხდა — შესაძლოა კოდი უკვე დაკავებულია.");
      refresh();
    }
  };

  const handleDelete = async (u: AppUser) => {
    if (!confirm(`წავშალო მომხმარებელი "${u.name}"? ამის შემდეგ მისი კოდი აღარ იმუშავებს.`)) return;
    try {
      await deleteUser(u.id);
      await refresh();
      logActivity(actorName, myRole, "მომხმარებლის წაშლა", u.name);
    } catch (e) {
      console.error("[users] delete failed", e);
      alert("წაშლა ვერ მოხერხდა.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>მომხმარებლები, კოდები და გვერდების ხედვები</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            განახლება
          </Button>
          <Button size="sm" onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> მომხმარებელი</Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <p className="text-xs text-muted-foreground mb-3">
          კოდის შეცვლა და მომხმარებლების მართვა — მხოლოდ ფინანსების ხელმისაწვდომობაშია. „ფინანსები" როლის
          მომხმარებელი ყოველთვის ხედავს ყველა გვერდს, მიუხედავად checkbox-ების მდგომარეობისა.
        </p>
        {error && <p className="text-sm text-destructive mb-2">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>სახელი</TableHead>
              <TableHead>კოდი</TableHead>
              <TableHead>როლი</TableHead>
              {PAGE_COLS.map((c) => <TableHead key={c.key} className="text-center">{c.label}</TableHead>)}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="p-1 min-w-[160px]">
                  <TextInput value={u.name} onChange={(v) => handleUpdate(u, { name: v })} />
                </TableCell>
                <TableCell className="p-1 min-w-[160px]">
                  <TextInput value={u.code} onChange={(v) => handleUpdate(u, { code: v }, "მომხმარებლის კოდის შეცვლა")} />
                </TableCell>
                <TableCell className="p-1 min-w-[140px]">
                  <Select value={u.role} onValueChange={(v) => handleUpdate(u, { role: v as AccessRole }, "მომხმარებლის როლის შეცვლა")}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">ფინანსები</SelectItem>
                      <SelectItem value="partial">პარტნიორი</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                {PAGE_COLS.map((c) => (
                  <TableCell key={c.key} className="text-center p-1">
                    <Checkbox
                      checked={u.pageVisibility[c.key]}
                      disabled={u.role === "full"}
                      onCheckedChange={(v) => handleUpdate(u, { [c.key]: !!v } as any)}
                    />
                  </TableCell>
                ))}
                <TableCell className="p-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(u)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && !loading && (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">მომხმარებელი არ არის.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function LogSheet() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listActivityLog());
    } catch (e) {
      console.error("[log] load failed", e);
      setError("ლოგის ჩატვირთვა ვერ მოხერხდა.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  return (
    <div className="space-y-4">
      <UsersPanel />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          ვინ, როდის, რა მოქმედება შეასრულა. ჩვეულებრივი ველების რედაქტირება (ავტომატური შენახვა) აქ არ ილოგება —
          მხოლოდ მნიშვნელოვანი მოქმედებები (დასრულება/შენახვა, ახალი პროექტი, არქივის გახსნა/წაშლა, სტატუსის
          ცვლილება, მომხმარებლების მართვა).
        </p>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          განახლება
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader><CardTitle>მოქმედებების ლოგი</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> იტვირთება…
            </div>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">ლოგი ცარიელია.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>თარიღი/დრო</TableHead>
                  <TableHead>ვინ</TableHead>
                  <TableHead>როლი</TableHead>
                  <TableHead>მოქმედება</TableHead>
                  <TableHead>დეტალები</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString("ka-GE")}</TableCell>
                    <TableCell className="font-medium">{e.actor_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ROLE_LABEL[e.role] ?? e.role}</TableCell>
                    <TableCell>{e.action}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.details}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
