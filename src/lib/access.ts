import { supabase } from "@/integrations/supabase/client";
import { listPagePermissions, updatePagePermission } from "./pagePermissions";
import { listFieldPermissions, updateFieldPermission } from "./fieldPermissions";
import { listFieldVisibility, updateFieldVisibility } from "./fieldVisibility";
import { adminWrite } from "./adminWrite";

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
  // სერვერული შემოწმება — კოდები ბრაუზერში აღარ იკითხება.
  const { data, error } = await (supabase as any).rpc("app_login", { p_code: trimmed });
  if (error) {
    console.error("[access] code check failed", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? rowToUser({ ...row, code: trimmed }) : null;
}

// სესიის ქეშირებული მომხმარებლის ფონურად განახლებისთვის — რომ Finance-ის მიერ
// შეცვლილი როლი/სახელი დაუყოვნებლივ ეცნობოს უკვე შესულ მომხმარებელს,
// კოდის ხელახლა შეყვანის გარეშე.
// სესიის განახლება იმავე კოდით (id-ით აღარა — localStorage-ში id-ის ჩანაცვლებით
// სხვის სახელით შესვლა აღარ შეიძლება). კოდი შეიცვალა/მომხმარებელი წაიშალა → null.
// ქსელის შეცდომისას → "error" (სესია არ იშლება).
export async function refreshSession(cached: AppUser): Promise<AppUser | null | "error"> {
  if (!cached.code) return null; // ძველი ფორმატის სესია კოდის გარეშე — თავიდან შესვლა
  const { data, error } = await (supabase as any).rpc("app_login", { p_code: cached.code });
  if (error) {
    console.error("[access] refresh failed", error);
    return "error";
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? rowToUser({ ...row, code: cached.code }) : null;
}

// მომხმარებლების სია კოდების გარეშე (ჩამონათვალებისთვის) — ყველა როლისთვის.
export async function listUsers(): Promise<AppUser[]> {
  const { data, error } = await (supabase as any).rpc("app_users_public");
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => rowToUser({ ...r, code: "" }));
}

// სრული სია კოდებით — მხოლოდ ფინანსებისთვის („ლოგი" → მომხმარებლები და კოდები).
export async function listUsersAdmin(): Promise<AppUser[]> {
  const { data, error } = await (supabase as any).rpc("app_admin_list_users", { p_code: getStoredUser()?.code ?? "" });
  if (error) throw error;
  return ((data ?? []) as any[]).map(rowToUser);
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
  await adminWrite("app_users", "insert", { name, code, role });
}

export async function updateUser(id: string, patch: Partial<{ name: string; code: string; role: AccessRole }>): Promise<void> {
  const row: any = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.code !== undefined) row.code = patch.code;
  if (patch.role !== undefined) row.role = patch.role;
  await adminWrite("app_users", "update", row, id);
}

export async function deleteUser(id: string): Promise<void> {
  await adminWrite("app_users", "delete", {}, id);
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
