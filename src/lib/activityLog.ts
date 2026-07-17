import { supabase } from "@/integrations/supabase/client";

export interface ActivityLogEntry {
  id: string;
  actor_name: string;
  role: string;
  action: string;
  details: string | null;
  created_at: string;
}

export async function logActivity(actorName: string, role: string, action: string, details?: string): Promise<void> {
  try {
    const { error } = await supabase.from("activity_log").insert({
      actor_name: actorName,
      role,
      action,
      details: details ?? null,
    });
    if (error) console.error("[activity_log] insert failed", error);
  } catch (e) {
    // ლოგირების ჩავარდნამ არასდროს არ უნდა შეაფერხოს რეალური მოქმედება
    console.error("[activity_log] insert failed", e);
  }
}

export async function listActivityLog(limit = 200): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, actor_name, role, action, details, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityLogEntry[];
}
