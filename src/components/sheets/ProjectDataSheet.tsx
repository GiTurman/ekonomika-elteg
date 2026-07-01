import { useEconStore } from "@/lib/econ-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { NumberInput, TextInput } from "./sheet-ui";
import { Plus, Trash2 } from "lucide-react";

const UNIT_COLS: Array<{ key: keyof import("@/lib/econ-types").Unit; label: string; kind: "text" | "num" }> = [
  { key: "id", label: "#", kind: "text" },
  { key: "capacity", label: "ტვირთ. (კგ)", kind: "num" },
  { key: "floors", label: "სართ.", kind: "num" },
  { key: "currency", label: "ვალუტა", kind: "text" },
  { key: "brand", label: "ბრენდი", kind: "text" },
  { key: "model", label: "მოდელი", kind: "text" },
  { key: "country", label: "ქვეყანა", kind: "text" },
  { key: "kind", label: "სახეობა", kind: "text" },
  { key: "type", label: "ტიპი", kind: "text" },
  { key: "delivery", label: "მიწოდება", kind: "text" },
  { key: "mrType", label: "MR/MRL", kind: "text" },
  { key: "specDate", label: "სპეც. თარიღი", kind: "text" },
  { key: "variant", label: "ვარიანტი", kind: "num" },
  { key: "productionWeeks", label: "წარმოება (კვ)", kind: "num" },
  { key: "transportWeeks", label: "ტრანსპ. (კვ)", kind: "num" },
  { key: "reserveWeeks", label: "რეზერვი (კვ)", kind: "num" },
  { key: "installWeeks", label: "მონტაჟი (კვ)", kind: "num" },
];

export function ProjectDataSheet() {
  const { state, updateProject, updateUnit, addUnit, removeUnit } = useEconStore();
  const p = state.project;
  const t = p.travel;

  const setTravel = (patch: Partial<typeof t>) =>
    updateProject({ travel: { ...t, ...patch } });
  const setGroup = (k: "mechanics" | "electricians" | "admin", patch: Partial<typeof t.mechanics>) =>
    setTravel({ [k]: { ...t[k], ...patch } } as any);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>1. ზოგადი ინფორმაცია</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">პროექტის დასახელება</span>
            <TextInput value={p.projectName} onChange={(v) => updateProject({ projectName: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">მონტაჟის ადგილმდებარეობა</span>
            <TextInput value={p.location} onChange={(v) => updateProject({ location: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">ნაგებობის ტიპი</span>
            <TextInput value={p.buildingType} onChange={(v) => updateProject({ buildingType: v })} /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">პროექტის ჩაბარების წელი</span>
            <NumberInput value={p.completionYear} onChange={(v) => updateProject({ completionYear: v })} /></label>
          <div className="md:col-span-2 text-sm text-muted-foreground">
            დანადგარების რაოდენობა (ავტომატურად): <span className="font-mono font-semibold">{p.units.length}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>2. დანადგარების ცხრილი — ერთი სტრიქონი = ერთი დანადგარი</CardTitle>
          <Button size="sm" onClick={addUnit}><Plus className="h-4 w-4 mr-1" /> ახალი დანადგარი</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {UNIT_COLS.map((c) => <TableHead key={c.key} className="whitespace-nowrap text-xs">{c.label}</TableHead>)}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.units.map((u) => (
                <TableRow key={u.id}>
                  {UNIT_COLS.map((c) => (
                    <TableCell key={c.key} className="p-1 min-w-[92px]">
                      {c.kind === "num"
                        ? <NumberInput value={u[c.key] as number} onChange={(v) => updateUnit(u.id, { [c.key]: v } as any)} />
                        : <TextInput value={String(u[c.key] ?? "")} onChange={(v) => updateUnit(u.id, { [c.key]: v } as any)} />
                      }
                    </TableCell>
                  ))}
                  <TableCell className="p-1">
                    <Button variant="ghost" size="icon" onClick={() => removeUnit(u.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. მივლინების მონაცემები — პერსონალი და ლოჯისტიკა</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ჯგუფი</TableHead>
                <TableHead>რაოდენობა (კაცი)</TableHead>
                <TableHead>მივლინების დღეები</TableHead>
                <TableHead>ჩასვლების რაოდენობა</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {([["მექანიკოსები", "mechanics"], ["ელექტრიკოსები", "electricians"], ["ადმინისტრაცია", "admin"]] as const).map(([label, key]) => (
                <TableRow key={key}>
                  <TableCell>{label}</TableCell>
                  <TableCell><NumberInput value={t[key].headcount} onChange={(v) => setGroup(key, { headcount: v })} /></TableCell>
                  <TableCell><NumberInput value={t[key].days} onChange={(v) => setGroup(key, { days: v })} /></TableCell>
                  <TableCell><NumberInput value={t[key].trips} onChange={(v) => setGroup(key, { trips: v })} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">მანძილი ოფისიდან ობიექტამდე, კმ (ერთი მიმართულებით)</span>
              <NumberInput value={t.distanceKm} onChange={(v) => setTravel({ distanceKm: v })} /></label>
            <label className="grid gap-1"><span className="text-xs text-muted-foreground">ავტომობილის საწვავის ხარჯი, ლ/100კმ</span>
              <NumberInput value={t.fuelConsumption} onChange={(v) => setTravel({ fuelConsumption: v })} /></label>
            <label className="grid gap-1 md:col-span-2"><span className="text-xs text-muted-foreground">სამუშაო დღეები კვირაში</span>
              <TextInput value={t.workDays} onChange={(v) => setTravel({ workDays: v })} /></label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
