import { createFileRoute } from "@tanstack/react-router";
import { requireFull } from "@/server/apiAuth";
import { createClient } from "@supabase/supabase-js";

const SINGLETON = "singleton";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/backup/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireFull(request);
        if (denied) return denied;
        try {
          const fd = await request.formData();
          const f = fd.get("file");
          if (!f || typeof f === "string") {
            return Response.json({ status: "error", message: "ფაილი არ არის" }, { status: 400 });
          }
          const text = await (f as File).text();
          const json = JSON.parse(text);
          const sb = admin();
          await sb
            .from("app_state")
            .upsert({ id: SINGLETON, data: json, updated_at: new Date().toISOString() });
          return Response.json({ status: "ok" });
        } catch (e) {
          return Response.json(
            { status: "error", message: e instanceof Error ? e.message : String(e) },
            { status: 400 }
          );
        }
      },
    },
  },
});
