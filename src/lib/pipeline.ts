import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminWrite } from "./adminWrite";

// გაყიდვების პაიპლაინის (ფორმა 505) ჩანაწერები — ინახება Lovable Cloud-ის
// pipeline_projects ცხრილში: id + data (JSON). ცვლილება დაუყოვნებლივ იწერება.
export interface PipelineProject {
  id: string;
  [key: string]: any;
}

export async function listPipelineProjects(): Promise<PipelineProject[]> {
  const { data, error } = await supabase
    .from("pipeline_projects")
    .select("id, data")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, ...(r.data ?? {}) }));
}

export async function upsertPipelineProject(p: PipelineProject): Promise<void> {
  const { id, ...rest } = p;
  const { error } = await supabase
    .from("pipeline_projects")
    .upsert({ id, data: rest as any }, { onConflict: "id" });
  if (error) throw error;
}

export async function deletePipelineProject(id: string): Promise<void> {
  await adminWrite("pipeline_projects", "delete", {}, id);
}

// ჰუკი — მასივის სახით აბრუნებს ჩანაწერებს და setProjects-ს, რომელიც
// განსხვავებას ავტომატურად წერს ბაზაში (დამატება/ცვლილება/წაშლა).
export function usePipelineProjects() {
  const [projects, setLocal] = useState<PipelineProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listPipelineProjects()
      .then((rows) => { if (alive) setLocal(rows); })
      .catch((e) => console.error("[pipeline] load failed", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const setProjects = useCallback((next: PipelineProject[]) => {
    setLocal((prev) => {
      const prevById = new Map(prev.map((p) => [p.id, p]));
      const nextIds = new Set(next.map((p) => p.id));

      // წაშლილები
      for (const p of prev) {
        if (!nextIds.has(p.id)) {
          deletePipelineProject(p.id).catch((e) => console.error("[pipeline] delete failed", e));
        }
      }
      // ახლები და შეცვლილები
      for (const p of next) {
        const before = prevById.get(p.id);
        if (!before || JSON.stringify(before) !== JSON.stringify(p)) {
          upsertPipelineProject(p).catch((e) => console.error("[pipeline] save failed", e));
        }
      }
      return next;
    });
  }, []);

  return { projects, setProjects, loading };
}
