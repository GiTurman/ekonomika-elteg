import { useEffect, useState, Fragment } from "react";
import { listActivityLog, type ActivityLogEntry } from "@/lib/activityLog";
import { listUsers, createUser, updateUser, deleteUser, ROLE_LABEL, type AppUser, type AccessRole } from "@/lib/access";
import { listFieldPermissions, updateFieldPermission, type FieldPermission } from "@/lib/fieldPermissions";
import { listFieldVisibility, updateFieldVisibility, type FieldVisibility } from "@/lib/fieldVisibility";
import { listPagePermissions, updatePagePermission, upsertPagePermission, type PagePermission } from "@/lib/pagePermissions";
import { listDropdownOptions, updateDropdownOptions, type DropdownOptions } from "@/lib/dropdownOptions";
import { useAccessRole } from "@/components/AccessGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TextInput } from "./sheet-ui";
import { Loader2, RefreshCw, Plus, Trash2, X } from "lucide-react";
import { logActivity } from "@/lib/activityLog";

const NON_FULL_ROLES: AccessRole[] = ["commercial", "technical", "accounting", "procurement", "administration"];

function DropdownOptionsPanel() {
  const { actorName, role: myRole } = useAccessRole();
  const [items, setItems] = useState<DropdownOptions[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newValue, setNewValue] = useState<Record<string, string>>({});

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listDropdownOptions());
    } catch (e) {
      console.error("[dropdown-options] load failed", e);
      setError("სიების ჩატვირთვა ვერ მოხერხდა.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const commit = async (item: DropdownOptions, nextOptions: string[]) => {
    setItems((prev) => prev.map((x) => (x.fieldKey === item.fieldKey ? { ...x, options: nextOptions } : x)));
    try {
      await updateDropdownOptions(item.fieldKey, nextOptions);
      logActivity(actorName, myRole, "სიის განახლება — " + item.label, nextOptions.join(", "));
    } catch (e) {
      console.error("[dropdown-options] update failed", e);
      alert("განახლება ვერ მოხერხდა.");
      refresh();
    }
  };

  const addOption = (item: DropdownOptions) => {
    const v = (newValue[item.fieldKey] ?? "").trim();
    if (!v || item.options.includes(v)) return;
    commit(item, [...item.options, v]);
    setNewValue((prev) => ({ ...prev, [item.fieldKey]: "" }));
  };

  const removeOption = (item: DropdownOptions, opt: string) => {
    commit(item, item.options.filter((o) => o !== opt));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>ჩამონათვალები — ბრენდი / ქვეყანა / MR-MRL</CardTitle>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          განახლება
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          ეს სიები ივსება drop-down-ებად „შესატანი მონაცემები" გვერდზე (დანადგარების ცხრილი). აქ დამატებული/წაშლილი
          მნიშვნელობა მაშინვე აისახება ფორმაში.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {items.map((item) => (
          <div key={item.fieldKey} className="space-y-2">
            <div className="text-sm font-medium">{item.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {item.options.map((opt) => (
                <Badge key={opt} variant="secondary" className="text-xs cursor-pointer" onClick={() => removeOption(item, opt)}>
                  {opt} <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
              {item.options.length === 0 && <span className="text-xs text-muted-foreground">ცარიელია</span>}
            </div>
            <div className="flex items-center gap-2 max-w-sm">
              <TextInput
                value={newValue[item.fieldKey] ?? ""}
                onChange={(v) => setNewValue((prev) => ({ ...prev, [item.fieldKey]: v }))}
                placeholder="ახალი მნიშვნელობა..."
              />
              <Button size="sm" variant="outline" onClick={() => addOption(item)}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PagePermissionsPanel() {
  const { actorName, role: myRole, refreshPagePermissions } = useAccessRole();
  const [perms, setPerms] = useState<PagePermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await listPagePermissions();
      // "ანალიტიკა მუშა" — თუ ბაზაში row ჯერ არ არსებობს, ვირტუალურად ვამატებთ
      // ცარიელი უფლებებით, რომ პანელში checkbox-ები მაინც გამოჩნდეს და ჩართვა შესაძლებელი იყოს.
      if (!loaded.some((p) => p.pageKey === "analytics_working")) {
        loaded.push({ pageKey: "analytics_working", label: "ანალიტიკა მუშა", allowedRoles: [] });
      }
      setPerms(loaded);
    } catch (e) {
      console.error("[permissions] page load failed", e);
      setError("გვერდების ხედვადობის ჩატვირთვა ვერ მოხერხდა.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const toggleRole = async (perm: PagePermission, role: AccessRole) => {
    const has = perm.allowedRoles.includes(role);
    const nextRoles = has ? perm.allowedRoles.filter((r) => r !== role) : [...perm.allowedRoles, role];
    setPerms((prev) => prev.map((p) => (p.pageKey === perm.pageKey ? { ...p, allowedRoles: nextRoles } : p)));
    try {
      // "analytics_working" შესაძლოა ბაზაში ჯერ არ არსებობდეს — ამიტომ upsert.
      if (perm.pageKey === "analytics_working") {
        await upsertPagePermission(perm.pageKey, perm.label, nextRoles);
      } else {
        await updatePagePermission(perm.pageKey, nextRoles);
      }
      refreshPagePermissions(); // მიმდინარე სესიაშიც დაუყოვნებლივ ამოქმედდეს
      logActivity(actorName, myRole, "გვერდის ხედვადობის ცვლილება", `${perm.label} → ${nextRoles.map((r) => (ROLE_LABEL as Record<string, string>)[r]).join(", ") || "არავინ"}`);
    } catch (e) {
      console.error("[permissions] page update failed", e);
      alert("განახლება ვერ მოხერხდა.");
      refresh();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>გვერდების ხედვადობა — როლის მიხედვით</CardTitle>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          განახლება
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <p className="text-xs text-muted-foreground mb-3">
          ფინანსებს ყოველთვის შეუძლია ყველა გვერდის ნახვა, checkbox-ების მიუხედავად. ეს ცხრილი როლის დონეზეა —
          ერთხელ დააყენებ და ამ როლის ყველა მომხმარებელს ეხება ერთდროულად, ცალკეული მომხმარებლის მორგება აღარ სჭირდება.
        </p>
        {error && <p className="text-sm text-destructive mb-2">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>გვერდი</TableHead>
              {NON_FULL_ROLES.map((r) => <TableHead key={r} className="text-center">{ROLE_LABEL[r]}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {perms.map((perm) => (
              <TableRow key={perm.pageKey}>
                <TableCell className="text-sm font-medium">{perm.label}</TableCell>
                {NON_FULL_ROLES.map((r) => (
                  <TableCell key={r} className="text-center p-1">
                    <Checkbox checked={perm.allowedRoles.includes(r)} onCheckedChange={() => toggleRole(perm, r)} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {perms.length === 0 && !loading && (
              <TableRow><TableCell colSpan={NON_FULL_ROLES.length + 1} className="text-center text-sm text-muted-foreground py-6">გვერდები არ არის რეგისტრირებული.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FieldVisibilityPanel() {
  const { actorName, role: myRole, refreshFieldVisibility } = useAccessRole();
  const [perms, setPerms] = useState<FieldVisibility[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setPerms(await listFieldVisibility());
    } catch (e) {
      console.error("[visibility] load failed", e);
      setError("ხედვადობის ჩატვირთვა ვერ მოხერხდა.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const toggleRole = async (perm: FieldVisibility, role: AccessRole) => {
    const has = perm.allowedRoles.includes(role);
    const nextRoles = has ? perm.allowedRoles.filter((r) => r !== role) : [...perm.allowedRoles, role];
    setPerms((prev) => prev.map((p) => (p.fieldKey === perm.fieldKey ? { ...p, allowedRoles: nextRoles } : p)));
    try {
      await updateFieldVisibility(perm.fieldKey, nextRoles);
      refreshFieldVisibility(); // მიმდინარე სესიაშიც დაუყოვნებლივ ამოქმედდეს
      logActivity(actorName, myRole, "ველის ხედვადობის ცვლილება", `${perm.label} → ${nextRoles.map((r) => (ROLE_LABEL as Record<string, string>)[r]).join(", ") || "არავინ"}`);
    } catch (e) {
      console.error("[visibility] update failed", e);
      alert("განახლება ვერ მოხერხდა.");
      refresh();
    }
  };

  const sections = Array.from(new Set(perms.map((p) => p.section)));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>ველების ხედვადობა — ვინ რას ხედავს „შესატანი მონაცემები" გვერდზე</CardTitle>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          განახლება
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <p className="text-xs text-muted-foreground mb-3">
          ფინანსებს ყოველთვის შეუძლია ყველა ველის ნახვა, checkbox-ების მიუხედავად. თუ როლს ველისთვის მონიშნული
          არა აქვს, ის ველი მისთვის საერთოდ არ ჩანს (არც readonly ხედით) — ეს განსხვავდება ზემოთ „ველების
          უფლებები"-სგან, რომელიც მხოლოდ რედაქტირებას მართავს, ხედვას კი არა.
        </p>
        {error && <p className="text-sm text-destructive mb-2">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>ველი</TableHead>
              {NON_FULL_ROLES.map((r) => <TableHead key={r} className="text-center">{ROLE_LABEL[r]}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.map((section) => (
              <Fragment key={section}>
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={NON_FULL_ROLES.length + 1} className="font-semibold text-xs py-1">{section}</TableCell>
                </TableRow>
                {perms.filter((p) => p.section === section).map((perm) => (
                  <TableRow key={perm.fieldKey}>
                    <TableCell className="text-sm">{perm.label}</TableCell>
                    {NON_FULL_ROLES.map((r) => (
                      <TableCell key={r} className="text-center p-1">
                        <Checkbox checked={perm.allowedRoles.includes(r)} onCheckedChange={() => toggleRole(perm, r)} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </Fragment>
            ))}
            {perms.length === 0 && !loading && (
              <TableRow><TableCell colSpan={NON_FULL_ROLES.length + 1} className="text-center text-sm text-muted-foreground py-6">ველები არ არის რეგისტრირებული.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FieldPermissionsPanel() {
  const { actorName, role: myRole, refreshFieldPermissions } = useAccessRole();
  const [perms, setPerms] = useState<FieldPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setPerms(await listFieldPermissions());
    } catch (e) {
      console.error("[permissions] load failed", e);
      setError("უფლებების ჩატვირთვა ვერ მოხერხდა.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const toggleRole = async (perm: FieldPermission, role: AccessRole) => {
    const has = perm.allowedRoles.includes(role);
    const nextRoles = has ? perm.allowedRoles.filter((r) => r !== role) : [...perm.allowedRoles, role];
    setPerms((prev) => prev.map((p) => (p.fieldKey === perm.fieldKey ? { ...p, allowedRoles: nextRoles } : p)));
    try {
      await updateFieldPermission(perm.fieldKey, nextRoles);
      refreshFieldPermissions(); // მიმდინარე სესიაშიც დაუყოვნებლივ ამოქმედდეს
      logActivity(actorName, myRole, "ველის უფლების ცვლილება", `${perm.label} → ${nextRoles.map((r) => (ROLE_LABEL as Record<string, string>)[r]).join(", ") || "არავინ"}`);
    } catch (e) {
      console.error("[permissions] update failed", e);
      alert("განახლება ვერ მოხერხდა.");
      refresh();
    }
  };

  const sections = Array.from(new Set(perms.map((p) => p.section)));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>ველების უფლებები — ვინ რას ავსებს „შესატანი მონაცემები" გვერდზე</CardTitle>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          განახლება
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <p className="text-xs text-muted-foreground mb-3">
          ფინანსებს ყოველთვის შეუძლია ყველა ველის რედაქტირება, checkbox-ების მიუხედავად. სხვა როლს ველის
          რედაქტირება მხოლოდ მაშინ შეუძლია, თუ მონიშნულია მისთვის — წინააღმდეგ შემთხვევაში ხედავს, მაგრამ ვერ ცვლის.
        </p>
        {error && <p className="text-sm text-destructive mb-2">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>ველი</TableHead>
              {NON_FULL_ROLES.map((r) => <TableHead key={r} className="text-center">{ROLE_LABEL[r]}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.map((section) => (
              <Fragment key={section}>
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={NON_FULL_ROLES.length + 1} className="font-semibold text-xs py-1">{section}</TableCell>
                </TableRow>
                {perms.filter((p) => p.section === section).map((perm) => (
                  <TableRow key={perm.fieldKey}>
                    <TableCell className="text-sm">{perm.label}</TableCell>
                    {NON_FULL_ROLES.map((r) => (
                      <TableCell key={r} className="text-center p-1">
                        <Checkbox checked={perm.allowedRoles.includes(r)} onCheckedChange={() => toggleRole(perm, r)} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </Fragment>
            ))}
            {perms.length === 0 && !loading && (
              <TableRow><TableCell colSpan={NON_FULL_ROLES.length + 1} className="text-center text-sm text-muted-foreground py-6">ველები არ არის რეგისტრირებული.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

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
        <CardTitle>მომხმარებლები და კოდები</CardTitle>
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
          კოდის შეცვლა და მომხმარებლების მართვა — მხოლოდ ფინანსების ხელმისაწვდომობაშია. გვერდების/ველების
          ხედვადობა და რედაქტირების უფლებები ცალკე იმართება, როლის მიხედვით (იხ. ქვემოთ).
        </p>
        {error && <p className="text-sm text-destructive mb-2">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>სახელი</TableHead>
              <TableHead>კოდი</TableHead>
              <TableHead>როლი</TableHead>
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
                      <SelectItem value="commercial">კომერცია</SelectItem>
                      <SelectItem value="technical">ტექნიკური</SelectItem>
                      <SelectItem value="accounting">ბუღალტერია</SelectItem>
                      <SelectItem value="procurement">შესყიდვები</SelectItem>
                      <SelectItem value="administration">ადმინისტრაცია</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="p-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(u)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && !loading && (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">მომხმარებელი არ არის.</TableCell></TableRow>
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
      <PagePermissionsPanel />
      <DropdownOptionsPanel />
      <FieldVisibilityPanel />
      <FieldPermissionsPanel />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          ვინ, როდის, რა მოქმედება შეასრულა. ჩვეულებრივი ველების რედაქტირება (ავტომატური შენახვა) აქ არ ილოგება —
          მხოლოდ მნიშვნელოვანი მოქმედებები (დასრულება/შენახვა, ახალი პროექტი, არქივის გახსნა/წაშლა, სტატუსის
          ცვლილება, მომხმარებლების/უფლებების მართვა).
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
                    <TableCell className="text-xs text-muted-foreground">{(ROLE_LABEL as Record<string, string>)[e.role] ?? e.role}</TableCell>
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
