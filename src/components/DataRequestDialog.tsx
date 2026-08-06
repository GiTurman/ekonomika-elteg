import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, MailQuestion, Loader2 } from "lucide-react";
import { useEconStore } from "@/lib/econ-store";
import { saveToArchive, findArchiveByName, updateArchiveEntry } from "@/lib/archive";

interface RequestCategory {
  key: string;
  title: string;
  subject: string;
  body: string;
}

const STORAGE_PREFIX = "elteg-data-request-email:";

const CATEGORIES: RequestCategory[] = [
  {
    key: "montazhi",
    title: "მონტაჟი",
    subject: "მონაცემთა მოთხოვნა — მონტაჟი",
    body: [
      "გამარჯობა,",
      "",
      "გთხოვთ, მოგვაწოდოთ შემდეგი მონაცემები პროექტის განფასებისთვის:",
      "",
      "ა) სართულის მონტაჟის ხარჯი (მექანიკა, ელექტროობა)?",
      "ბ) მასალის ხარჯი?",
      "გ) ხარაჩოს ხარჯი (ქირაობა თუ საკუთარი ლულკები)?",
      "დ) მონტაჟი აზერებით დავაკომპლექტოთ თუ ქართველებით?",
      "ე) აზერების შემთხვევაში — ბინის ქირა გასათვალისწინებელია?",
      "ვ) მონტაჟის ვადები?",
      "",
      "მადლობა.",
    ].join("\n"),
  },
  {
    key: "shesyidva",
    title: "შესყიდვები",
    subject: "მონაცემთა მოთხოვნა — შესყიდვები",
    body: [
      "გამარჯობა,",
      "",
      "გთხოვთ, მოგვაწოდოთ შემდეგი მონაცემები პროექტის განფასებისთვის:",
      "",
      "ა) ქარხნის ფასი?",
      "ბ) საერთაშორისო ტრანსპორტირება?",
      "გ) შიდა ტრანსპორტირება (პროექტის მდებარეობის/მისასვლელობის მიხედვით)?",
      "დ) ვადები (წარმოება+ლოჯისტიკა+დასაწყობება)?",
      "",
      "მადლობა.",
    ].join("\n"),
  },
  {
    key: "finansebi",
    title: "ფინანსები",
    subject: "მონაცემთა მოთხოვნა — ფინანსები",
    body: [
      "გამარჯობა,",
      "",
      "გთხოვთ, მოგვაწოდოთ შემდეგი მონაცემები პროექტის განფასებისთვის:",
      "",
      "ა) ბანკის მომსახურების საკომისიო?",
      "ბ) ტერმინალის მომსახურება-განბაჟება?",
      "გ) ტექნიკური ზედამხედველობის ხარჯის ცვლილება?",
      "დ) საბანკო გარანტიების საკითხი — რა თანხაზე და რა პირობით?",
      "",
      "მადლობა.",
    ].join("\n"),
  },
  {
    key: "mivlineba",
    title: "მივლინება/ადმინისტრაცია",
    subject: "მონაცემთა მოთხოვნა — მივლინება/ადმინისტრაცია",
    body: [
      "გამარჯობა,",
      "",
      "გთხოვთ, მოგვაწოდოთ შემდეგი მონაცემები პროექტის განფასებისთვის:",
      "",
      "ა) სასტუმროს ხარჯი?",
      "ბ) კვების ხარჯი დადგენილი ტარიფით — ჩვენებს უშვებენ თუ აზერებს?",
      "გ) ბენზინის ხარჯი — რამდენი ვიზიტი და საშუალო წვის ღირებულება?",
      "",
      "მადლობა.",
    ].join("\n"),
  },
  {
    key: "marketingi",
    title: "მარკეტინგი",
    subject: "მონაცემთა მოთხოვნა — მარკეტინგი",
    body: [
      "გამარჯობა,",
      "",
      "გთხოვთ, მოგვაწოდოთ შემდეგი მონაცემები პროექტის განფასებისთვის:",
      "",
      "ა) გაყიდვებთან შეთანხმებული მარკეტინგული ღონისძიებები და მათი ხარჯი?",
      "",
      "მადლობა.",
    ].join("\n"),
  },
];

function loadStoredAddresses(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const cat of CATEGORIES) {
    try {
      result[cat.key] = localStorage.getItem(STORAGE_PREFIX + cat.key) || "";
    } catch {
      result[cat.key] = "";
    }
  }
  return result;
}

export function DataRequestDialog() {
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const { state, loadedArchiveId, setLoadedArchiveId } = useEconStore();

  useEffect(() => {
    if (open) setAddresses(loadStoredAddresses());
  }, [open]);

  const handleAddressChange = (key: string, value: string) => {
    setAddresses((prev) => ({ ...prev, [key]: value }));
    try {
      localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch (e) {
      console.error("[data-request] failed to persist address", e);
    }
  };

  // პროექტის ID-ს უზრუნველყოფა — ლინკისთვის. თუ ჯერ არ არის შენახული,
  // ავტომატურად ინახავს არქივში (სახელით) და აბრუნებს ID-ს.
  const ensureProjectId = async (): Promise<string | null> => {
    if (loadedArchiveId) return loadedArchiveId;
    const name = (state.project.projectName || "").trim();
    if (!name) {
      alert("პროექტს არ აქვს სახელი — ჯერ მიუთითეთ პროექტის სახელი, რომ ლინკი შეიქმნას.");
      return null;
    }
    // ამავე სახელით უკვე არსებობს? — გადავაწეროთ, თორემ ახალი ჩანაწერი.
    const existing = await findArchiveByName(name);
    if (existing) {
      await updateArchiveEntry(existing.id, state);
      setLoadedArchiveId(existing.id);
      return existing.id;
    }
    await saveToArchive(name, state);
    const saved = await findArchiveByName(name);
    if (saved) { setLoadedArchiveId(saved.id); return saved.id; }
    return null;
  };

  const handleSend = async (cat: RequestCategory) => {
    const to = (addresses[cat.key] || "").trim();
    if (!to) {
      alert("გთხოვთ, ჯერ შეიყვანოთ მისამართი.");
      return;
    }
    setSending(cat.key);
    try {
      const id = await ensureProjectId();
      const link = id ? `${window.location.origin}/?project=${id}` : "";
      const body = link
        ? cat.body + `\n\n— — —\nპროექტის პირდაპირი ბმული (დააჭირეთ გასახსნელად):\n${link}`
        : cat.body;
      const mailto =
        `mailto:${encodeURIComponent(to)}` +
        `?subject=${encodeURIComponent(cat.subject)}` +
        `&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
    } catch (e) {
      console.error("[data-request] send failed", e);
      alert("პროექტის შენახვა/ლინკის შექმნა ვერ მოხერხდა. სცადეთ ჯერ პროექტის შენახვა არქივში.");
    } finally {
      setSending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MailQuestion className="h-4 w-4 mr-1" /> მონაცემთა მოთხოვნა
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>მონაცემთა მოთხოვნა</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto space-y-3 pr-1">
          {CATEGORIES.map((cat) => (
            <Card key={cat.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{cat.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`addr-${cat.key}`} className="text-xs text-muted-foreground">
                    ელ. ფოსტის მისამართი
                  </Label>
                  <Input
                    id={`addr-${cat.key}`}
                    type="email"
                    placeholder="name@example.com"
                    value={addresses[cat.key] || ""}
                    onChange={(e) => handleAddressChange(cat.key, e.target.value)}
                  />
                </div>
                <Button size="sm" onClick={() => handleSend(cat)} disabled={sending === cat.key}>
                  {sending === cat.key ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />} გაგზავნა
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
