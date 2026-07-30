import { createContext, useContext, useEffect, useState } from "react";
import { checkAccessCode, getStoredUser, storeUser, clearStoredUser, getUserById, type AppUser, type AccessRole } from "@/lib/access";
import { listFieldPermissions, type FieldPermission } from "@/lib/fieldPermissions";
import { listFieldVisibility, type FieldVisibility } from "@/lib/fieldVisibility";
import { listPagePermissions, type PagePermission } from "@/lib/pagePermissions";

interface AccessContextShape {
  userId: string;
  role: AccessRole;
  isFull: boolean;
  actorName: string;
  logout: () => void;
  // ველის დონის უფლება — თუ ეს კონკრეტული ველი ცნობილი არაა matrix-ში,
  // ნაგულისხმევად რედაქტირებადია (რომ ახალმა ველებმა შემთხვევით არ დაბლოკოს).
  canEditField: (fieldKey: string) => boolean;
  refreshFieldPermissions: () => void;
  // ველის ხედვადობა — თუ ეს ცრუა, ველი საერთოდ არ ჩანს (არც readonly).
  // ცნობილი არაა matrix-ში → ნაგულისხმევად ხილვადია.
  canSeeField: (fieldKey: string) => boolean;
  refreshFieldVisibility: () => void;
  // გვერდის ხედვადობა — როლის მიხედვით (არა ცალკეული მომხმარებლის). თუ გვერდი
  // ცნობილი არაა matrix-ში, ნაგულისხმევად ხილვადია.
  canViewPage: (pageKey: string) => boolean;
  refreshPagePermissions: () => void;
}

const AccessContext = createContext<AccessContextShape | null>(null);

export function useAccessRole(): AccessContextShape {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccessRole must be used inside <AccessGate>");
  return ctx;
}

export function AccessGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);
  const [fieldPerms, setFieldPerms] = useState<FieldPermission[]>([]);
  const [fieldVis, setFieldVis] = useState<FieldVisibility[]>([]);
  const [pagePerms, setPagePerms] = useState<PagePermission[]>([]);

  const loadFieldPermissions = () => {
    listFieldPermissions().then(setFieldPerms).catch((e) => console.error("[permissions] field load failed", e));
  };
  const loadFieldVisibility = () => {
    listFieldVisibility().then(setFieldVis).catch((e) => console.error("[permissions] field visibility load failed", e));
  };
  const loadPagePermissions = () => {
    listPagePermissions().then(setPagePerms).catch((e) => console.error("[permissions] page load failed", e));
  };

  useEffect(() => {
    const cached = getStoredUser();
    setUser(cached);
    setReady(true);
    if (cached) {
      // ქეშირებული სესია მაშინვე გამოისახება (სწრაფი, მოციმციმების გარეშე),
      // ფონში კი ბაზიდან ახლდება — თუ Finance-მ როლი/სახელი შეცვალა,
      // ან მომხმარებელი წაშალა, ეს დაუყოვნებლივ აისახება ხელახლა შესვლის გარეშე.
      getUserById(cached.id).then((fresh) => {
        if (fresh) {
          storeUser(fresh);
          setUser(fresh);
        } else {
          clearStoredUser();
          setUser(null);
        }
      });
      loadFieldPermissions();
      loadFieldVisibility();
      loadPagePermissions();
    }
  }, []);

  const logout = () => {
    clearStoredUser();
    setUser(null);
  };

  if (!ready) return null;

  if (!user) {
    return <CodeScreen onSuccess={(u) => { storeUser(u); setUser(u); loadFieldPermissions(); loadFieldVisibility(); loadPagePermissions(); }} />;
  }

  const canEditField = (fieldKey: string): boolean => {
    if (user.role === "full") return true; // ფინანსებს ყოველთვის შეუძლია ყველაფრის რედაქტირება
    const perm = fieldPerms.find((p) => p.fieldKey === fieldKey);
    if (!perm) return true; // უცნობი/ჯერ არარეგისტრირებული ველი — ნაგულისხმევად ღიაა
    return perm.allowedRoles.includes(user.role);
  };

  const canSeeField = (fieldKey: string): boolean => {
    if (user.role === "full") return true; // ფინანსები ყოველთვის ხედავს ყველაფერს
    const vis = fieldVis.find((v) => v.fieldKey === fieldKey);
    if (!vis) return true; // უცნობი/ჯერ არარეგისტრირებული ველი — ნაგულისხმევად ხილვადია
    return vis.allowedRoles.includes(user.role);
  };

  const canViewPage = (pageKey: string): boolean => {
    if (user.role === "full") return true; // ფინანსები ყოველთვის ხედავს ყველა გვერდს
    const perm = pagePerms.find((p) => p.pageKey === pageKey);
    if (!perm) {
      // "ანალიტიკა მუშა" — მუშა/დაუმთავრებელი მონაცემებია; სანამ ცალსახად არ
      // ჩაირთვება პანელიდან, არა-ფინანსებს ნაგულისხმევად დამალული აქვთ.
      if (pageKey === "analytics_working") return false;
      return true; // სხვა უცნობი/ჯერ არარეგისტრირებული გვერდი — ნაგულისხმევად ხილვადი
    }
    return perm.allowedRoles.includes(user.role);
  };

  return (
    <AccessContext.Provider value={{
      userId: user.id, role: user.role, isFull: user.role === "full", actorName: user.name,
      logout, canEditField, refreshFieldPermissions: loadFieldPermissions,
      canSeeField, refreshFieldVisibility: loadFieldVisibility,
      canViewPage, refreshPagePermissions: loadPagePermissions,
    }}>
      {children}
    </AccessContext.Provider>
  );
}

function CodeScreen({ onSuccess }: { onSuccess: (user: AppUser) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError(false);
    try {
      const user = await checkAccessCode(code);
      if (user) {
        onSuccess(user);
      } else {
        setError(true);
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold">ELTEG — განფასების სისტემა</h1>
          <p className="mt-1 text-sm text-muted-foreground">გთხოვთ, შეიყვანოთ თქვენი პირადი წვდომის კოდი</p>
        </div>
        <input
          type="password"
          autoFocus
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(false); }}
          placeholder="კოდი"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="text-sm text-destructive">არასწორი კოდი. სცადეთ ხელახლა.</p>}
        <button
          type="submit"
          disabled={checking}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {checking ? "მოწმდება…" : "შესვლა"}
        </button>
      </form>
    </div>
  );
}
