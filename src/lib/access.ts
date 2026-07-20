import { supabase } from "@/integrations/supabase/client";

export type AccessRole = "full" | "partial";

export interface UserPageVisibility {
  input: boolean;
  economics: boolean;
  payment: boolean;
  tariffs: boolean;
  analytics: boolean;
}

export interface AppUser {
  id: string;
  name: string;
  code: string;
  role: AccessRole;
  pageVisibility: UserPageVisibility;
}

function rowToUser(row: any): AppUser {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    role: row.role === "full" ? "full" : "partial",
    pageVisibility: {
      input: row.page_input,
      economics: row.page_economics,
      payment: row.page_payment,
      tariffs: row.page_tariffs,
      analytics: row.page_analytics,
    },
  };
}

// კოდით ავთენტიფიკაცია — მომხმარებელი (სახელი, როლი, ხედვები) ბაზიდან მოდის,
// აღარ არის ორი ჰარდკოდილი საერთო კოდი.
export async function checkAccessCode(code: string): Promise<AppUser | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.from("app_users").select("*").eq("code", trimmed).maybeSingle();
  if (error) {
    console.error("[access] code check failed", error);
    return null;
  }
  return data ? rowToUser(data) : null;
}

export async function listUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase.from("app_users").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToUser);
}

export async function createUser(name: string, code: string, role: AccessRole): Promise<void> {
  const { error } = await supabase.from("app_users").insert({
    name, code, role,
    page_input: true, page_economics: true, page_payment: true,
    page_tariffs: false, page_analytics: false,
  });
  if (error) throw error;
}

export async function updateUser(id: string, patch: Partial<{ name: string; code: string; role: AccessRole } & UserPageVisibility>): Promise<void> {
  const row: any = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.code !== undefined) row.code = patch.code;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.input !== undefined) row.page_input = patch.input;
  if (patch.economics !== undefined) row.page_economics = patch.economics;
  if (patch.payment !== undefined) row.page_payment = patch.payment;
  if (patch.tariffs !== undefined) row.page_tariffs = patch.tariffs;
  if (patch.analytics !== undefined) row.page_analytics = patch.analytics;
  const { error } = await supabase.from("app_users").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await supabase.from("app_users").delete().eq("id", id);
  if (error) throw error;
}

// მიმდინარე სესიის cache — რომ ყოველ გვერდის გახსნაზე ხელახლა არ მოვითხოვოთ კოდი.
const SESSION_KEY = "elteg-session-user";

export function getStoredUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

export function storeUser(user: AppUser): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
  window.localStorage.removeItem(SESSION_KEY);
  // ძველი ფორმატის გასუფთავებაც — რომ წინა სესიის ნაშთმა არ იხელმძღვანელოს.
  window.localStorage.removeItem("elteg-access-role");
  window.localStorage.removeItem("elteg-actor-name");
}
