import { supabase } from "@/integrations/supabase/client";
import { listPagePermissions, updatePagePermission } from "./pagePermissions";
import { listFieldPermissions, updateFieldPermission } from "./fieldPermissions";
import { listFieldVisibility, updateFieldVisibility } from "./fieldVisibility";

export type AccessRole = "full" | "commercial" | "sales" | "technical" | "accounting" | "procurement" | "administration" | "partial";

export const ROLE_LABEL: Record<AccessRole, string> = {
  full: "ფინანსები",
  commercial: "კომერცია",
  sales: "გაყიდვები",
  technical: "ტექნიკური",
  accounting: "ბუღალტერია",
  procurement: "შესყიდვები",
  administration: "ადმინისტრაცია",
  partial: "პარტნიორი", // ძველი როლის სახელი — ახალ მომხმარებლებს აღარ ენიჭება, უკვე არსებულებისთვის შენარჩუნებულია
};

export interface AppUser {
  id: string;
  name: string;
  code: string;
  role: AccessRole;
}

function rowToUser(row: any): AppUser {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    role: (row.role in ROLE_LABEL ? row.role : "partial") as AccessRole,
  };
}

// კოდით ავთენტიფიკაცია — მომხმარებელი (სახელი, როლი) ბაზიდან მოდის, აღარ არის
// ორი ჰარდკოდილი საერთო კოდი. გვერდის/ველის ხედვები როლის მიხედვით მართავს
// page_permissions/field_permissions ცხრილები — არა ცალკეული მომხმარებელი.
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

// სესიის ქეშირებული მომხმარებლის ფონურად განახლებისთვის — რომ Finance-ის მიერ
// შეცვლილი როლი/სახელი დაუყოვნებლივ ეცნობოს უკვე შესულ მომხმარებელს,
// კოდის ხელახლა შეყვანის გარეშე.
export async function getUserById(id: string): Promise<AppUser | null> {
  const { data, error } = await supabase.from("app_users").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[access] refresh failed", error);
    return null;
  }
  return data ? rowToUser(data) : null;
}

export async function listUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase.from("app_users").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToUser);
}

// "გაყიდვები" (sales) როლის პირველად შექმნისას, მას კომერციის (commercial)
// უფლებები ერთჯერადად გადმოაქვს — შემდეგ sales დამოუკიდებელი როლია და ცალკე
// იმართება პანელიდან. seed მხოლოდ მაშინ სრულდება, თუ sales ჯერ არსად არ არის
// დამატებული permission-ცხრილებში (ე.ი. ნამდვილად პირველი sales-მომხმარებელია);
// განმეორებით შექმნა უფლებებს აღარ გადააწერს.
async function seedSalesFromCommercialIfFirstTime(): Promise<void> {
  const [pages, fperms, fvis] = await Promise.all([
    listPagePermissions(),
    listFieldPermissions(),
    listFieldVisibility(),
  ]);
  const salesAlreadyPresent =
    pages.some((p) => p.allowedRoles.includes("sales")) ||
    fperms.some((p) => p.allowedRoles.includes("sales")) ||
    fvis.some((v) => v.allowedRoles.includes("sales"));
  if (salesAlreadyPresent) return; // უკვე დათესილია — ხელს აღარ ვახლებთ

  await Promise.all([
    ...pages
      .filter((p) => p.allowedRoles.includes("commercial"))
      .map((p) => updatePagePermission(p.pageKey, [...p.allowedRoles, "sales"])),
    ...fperms
      .filter((p) => p.allowedRoles.includes("commercial"))
      .map((p) => updateFieldPermission(p.fieldKey, [...p.allowedRoles, "sales"])),
    ...fvis
      .filter((v) => v.allowedRoles.includes("commercial"))
      .map((v) => updateFieldVisibility(v.fieldKey, [...v.allowedRoles, "sales"])),
  ]);
}

export async function createUser(name: string, code: string, role: AccessRole): Promise<void> {
  if (role === "sales") {
    // შესაძლო შეცდომა seed-ში არ უნდა შეაფერხოს მომხმარებლის შექმნა
    try { await seedSalesFromCommercialIfFirstTime(); } catch (e) { console.error("sales seed failed", e); }
  }
  const { error } = await supabase.from("app_users").insert({ name, code, role });
  if (error) throw error;
}

export async function updateUser(id: string, patch: Partial<{ name: string; code: string; role: AccessRole }>): Promise<void> {
  const row: any = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.code !== undefined) row.code = patch.code;
  if (patch.role !== undefined) row.role = patch.role;
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
