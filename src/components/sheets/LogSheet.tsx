import { useEffect, useState } from "react";
import { listActivityLog, type ActivityLogEntry } from "@/lib/activityLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

const ROLE_LABEL: Record<string, string> = { full: "ფინანსები", partial: "პარტნიორი" };

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
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          ვინ, როდის, რა მოქმედება შეასრულა — ჩანს მხოლოდ ფინანსების წვდომით. ჩვეულებრივი ველების რედაქტირება
          (ავტომატური შენახვა) აქ არ ილოგება — მხოლოდ მნიშვნელოვანი მოქმედებები (დასრულება/შენახვა, ახალი
          პროექტი, არქივის გახსნა/წაშლა, სტატუსის ცვლილება).
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
