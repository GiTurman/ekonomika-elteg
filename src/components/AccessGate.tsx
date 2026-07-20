import { createContext, useContext, useEffect, useState } from "react";
import { checkAccessCode, getStoredUser, storeUser, clearStoredUser, type AppUser, type AccessRole, type UserPageVisibility } from "@/lib/access";

interface AccessContextShape {
  userId: string;
  role: AccessRole;
  isFull: boolean;
  actorName: string;
  pageVisibility: UserPageVisibility;
  logout: () => void;
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

  useEffect(() => {
    setUser(getStoredUser());
    setReady(true);
  }, []);

  const logout = () => {
    clearStoredUser();
    setUser(null);
  };

  if (!ready) return null;

  if (!user) {
    return <CodeScreen onSuccess={(u) => { storeUser(u); setUser(u); }} />;
  }

  return (
    <AccessContext.Provider value={{ userId: user.id, role: user.role, isFull: user.role === "full", actorName: user.name, pageVisibility: user.pageVisibility, logout }}>
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
