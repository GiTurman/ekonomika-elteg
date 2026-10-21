import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminWrite } from "./adminWrite";

// პაიპლაინის ნორმატივები — რამდენ პატარა/საშუალო/დიდ პროექტზე უნდა მუშაობდეს
// თითოეული გაყიდვების წარმომადგენელი ერთდროულად. ინახება app_settings ცხრილში
// (id = "pipeline_norms"), იცვლება მხოლოდ ფინანსების მიერ „ლოგი" ტაბიდან.

export const PROJECT_SIZES = ["პატარა", "საშუალო", "დიდი"] as const;
export type ProjectSize = (typeof PROJECT_SIZES)[number];

export interface PipelineNorms {
  sizeCounts: Record<ProjectSize, number>;
}

export const DEFAULT_PIPELINE_NORMS: PipelineNorms = {
  sizeCounts: { "პატარა": 14, "საშუალო": 8, "დიდი": 3 },
};

const ROW_ID = "pipeline_norms";

function normalize(raw: any): PipelineNorms {
  const src = raw?.sizeCounts ?? {};
  const sizeCounts = { ...DEFAULT_PIPELINE_NORMS.sizeCounts };
  for (const s of PROJECT_SIZES) {
    const v = Number(src[s]);
    if (Number.isFinite(v) && v >= 0) sizeCounts[s] = v;
  }
  return { sizeCounts };
}

export async function loadPipelineNorms(): Promise<PipelineNorms> {
  const { data, error } = await (supabase as any)
    .from("app_settings")
    .select("data")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return normalize(data?.data);
}

export async function savePipelineNorms(n: PipelineNorms): Promise<void> {
  await adminWrite("app_settings", "upsert",
    { id: ROW_ID, data: normalize(n), updated_at: new Date().toISOString() }, null, "id");
}

export function usePipelineNorms() {
  const [norms, setNorms] = useState<PipelineNorms>(DEFAULT_PIPELINE_NORMS);
  useEffect(() => {
    let alive = true;
    loadPipelineNorms()
      .then((n) => { if (alive) setNorms(n); })
      .catch((e) => console.error("[pipeline-norms] load failed", e));
    return () => { alive = false; };
  }, []);
  return norms;
}
