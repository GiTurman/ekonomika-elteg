import { createClient } from "@supabase/supabase-js";

// სერვერული /api/* მისამართების დაცვა: მოთხოვნას უნდა ახლდეს
// „ფინანსები" როლის წვდომის კოდი ჰედერში `x-elteg-code`. სხვა შემთხვევაში 401.
// (ადრე ეს მისამართები service-role გასაღებით ავტორიზაციის გარეშე წერდნენ ბაზაში.)
export async function requireFull(request: Request): Promise<Response | null> {
  const code = (request.headers.get("x-elteg-code") ?? "").trim();
  if (!code) return new Response("unauthorized", { status: 401 });
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.from("app_users").select("role").eq("code", code).maybeSingle();
  if (error || !data || data.role !== "full") return new Response("unauthorized", { status: 401 });
  return null;
}
