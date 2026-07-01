import { supabase } from "@/integrations/supabase/client";
import type { AppState } from "./econ-types";

export interface ArchiveEntry {
  id: string;
  name: string;
  created_at: string;
  size_bytes: number;
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

export async function listArchive(): Promise<ArchiveEntry[]> {
  const { data, error } = await supabase
    .from("app_backups")
    .select("id, name, created_at, size_bytes")
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
  const { error } = await supabase.from("app_backups").delete().eq("id", id);
  if (error) throw error;
}
