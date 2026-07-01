export type AccessRole = "full" | "partial";

const ACCESS_CODES: Record<string, AccessRole> = {
  "Elteg_2026_GT!": "full",
  "Elteg_2026!": "partial",
};

const STORAGE_KEY = "elteg-access-role";

export function checkAccessCode(code: string): AccessRole | null {
  return ACCESS_CODES[code] ?? null;
}

export function getStoredRole(): AccessRole | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "full" || v === "partial" ? v : null;
}

export function storeRole(role: AccessRole): void {
  window.localStorage.setItem(STORAGE_KEY, role);
}

export function clearStoredRole(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
