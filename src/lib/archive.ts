import { supabase } from "@/integrations/supabase/client";
import { adminWrite } from "./adminWrite";
import type { AppState } from "./econ-types";

export interface ArchiveEntry {
  id: string;
  name: string;
  created_at: string;
  size_bytes: number;
  include_in_analytics: boolean;
}

export async function saveToArchive(name: string, state: AppState): Promise<void> {
  const json = JSON.stringify(state);
  const { error } = await supabase.from("app_backups").insert({
    name,
    data: state as any,
    size_bytes: json.length,
  });
  if (error) throw error;
}

// პოულობს ზუსტად იმავე სახელის ბოლო არქივირებულ ჩანაწერს (თუ არსებობს) —
// "შენახვა და დასრულება"-ს გამოსაყენებლად, რომ სახელის დამთხვევისას
// გადაწერა შესთავაზოს ახალი ჩანაწერის შექმნის ნაცვლად.
export async function findArchiveByName(name: string): Promise<ArchiveEntry | null> {
  const { data, error } = await supabase
    .from("app_backups")
    .select("id, name, created_at, size_bytes, include_in_analytics")
    .eq("name", name)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data[0]) ? (data[0] as ArchiveEntry) : null;
}

export async function updateArchiveEntry(id: string, state: AppState): Promise<void> {
  const json = JSON.stringify(state);
  const { error } = await supabase
    .from("app_backups")
    .update({ data: state as any, size_bytes: json.length })
    .eq("id", id);
  if (error) throw error;
}

export async function listArchive(): Promise<ArchiveEntry[]> {
  const { data, error } = await supabase
    .from("app_backups")
    .select("id, name, created_at, size_bytes, include_in_analytics")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ArchiveEntry[];
}

export async function loadArchiveEntry(id: string): Promise<AppState> {
  const { data, error } = await supabase
    .from("app_backups")
    .select("data")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data.data as unknown as AppState;
}

export async function deleteArchiveEntry(id: string): Promise<void> {
  await adminWrite("app_backups", "delete", {}, id);
}

// წაშლის არქივის ყველა ჩანაწერს — გამოიყენება "არქივის გასუფთავება" ღილაკით.
export async function clearArchive(): Promise<void> {
  await adminWrite("app_backups", "delete", {}, "*"); // ყველა ჩანაწერი
}

// "ანალიტიკაში ჩართვის" checkbox — მხოლოდ ფინანსების ხელმისაწვდომობით.
export async function setIncludeInAnalytics(id: string, include: boolean): Promise<void> {
  const { error } = await supabase.from("app_backups").update({ include_in_analytics: include }).eq("id", id);
  if (error) throw error;
}

export interface ArchiveEntryFull extends ArchiveEntry {
  data: AppState;
}

// "სახელების ჩასწორება" — ყველა არქივის ჩანაწერში, დანადგარების მითითებულ
// ტექსტურ ველში (brand/kind/model/type/country) ზუსტ სახელს ჩაანაცვლებს ახლით.
// აბრუნებს რამდენ ჩანაწერში მოხდა ცვლილება. სახელი (created_at) არ ინახება ხელახლა
// — მხოლოდ data ნახლდება, ე.ი. თარიღი უცვლელი რჩება.
export type RenameField = "brand" | "kind" | "model" | "type" | "country";

export async function renameAcrossArchive(
  field: RenameField, oldValue: string, newValue: string
): Promise<number> {
  const oldV = oldValue.trim();
  const newV = newValue.trim();
  if (!oldV) return 0;

  const all = await listArchiveFull();
  let changed = 0;
  for (const entry of all) {
    const units = entry.data?.project?.units ?? [];
    let touched = false;
    for (const u of units) {
      if ((u as any)[field]?.trim?.() === oldV) {
        (u as any)[field] = newV;
        touched = true;
      }
    }
    if (touched) {
      const json = JSON.stringify(entry.data);
      const { error } = await supabase
        .from("app_backups")
        .update({ data: entry.data as any, size_bytes: json.length })
        .eq("id", entry.id);
      if (error) throw error;
      changed++;
    }
  }
  return changed;
}

// ანალიტიკის დაშბორდისთვის — არქივის ყველა ჩანაწერი სრული მონაცემით.
export async function listArchiveFull(): Promise<ArchiveEntryFull[]> {
  const { data, error } = await supabase
    .from("app_backups")
    .select("id, name, created_at, size_bytes, include_in_analytics, data")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ArchiveEntryFull[];
}
