import { createContext, useContext, useEffect, useState } from "react";
import { checkAccessCode, getStoredRole, storeRole, clearStoredRole, type AccessRole } from "@/lib/access";

interface AccessContextShape {
  role: AccessRole;
  isFull: boolean;
  logout: () => void;
}

const AccessContext = createContext<AccessContextShape | null>(null);

export function useAccessRole(): AccessContextShape {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccessRole must be used inside <AccessGate>");
  return ctx;
}

export function AccessGate({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<AccessRole | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRole(getStoredRole());
    setReady(true);
  }, []);

  const logout = () => {
    clearStoredRole();
    setRole(null);
  };

  if (!ready) return null;

  if (!role) {
    return <CodeScreen onSuccess={setRole} />;
  }

  return (
    <AccessContext.Provider value={{ role, isFull: role === "full", logout }}>
      {children}
    </AccessContext.Provider>
  );
}

function CodeScreen({ onSuccess }: { onSuccess: (role: AccessRole) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = checkAccessCode(code.trim());
    if (r) {
      storeRole(r);
      onSuccess(r);
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold">ELTEG — განფასების სისტემა</h1>
          <p className="mt-1 text-sm text-muted-foreground">გთხოვთ, შეიყვანოთ წვდომის კოდი</p>
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
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          შესვლა
        </button>
      </form>
    </div>
  );
}
