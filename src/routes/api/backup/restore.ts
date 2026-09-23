import { createFileRoute } from "@tanstack/react-router";
import { requireFull } from "@/server/apiAuth";
import { createClient } from "@supabase/supabase-js";

const SINGLETON = "singleton";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/backup/restore")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireFull(request);
        if (denied) return denied;
        const body = (await request.json()) as { name?: string };
        if (!body.name) return Response.json({ status: "error", message: "no name" }, { status: 400 });
        const sb = admin();
        const { data, error } = await sb
          .from("app_backups")
          .select("data")
          .eq("name", body.name)
          .maybeSingle();
        if (error || !data) return Response.json({ status: "error", message: "ვერ მოიძებნა" }, { status: 404 });
        await sb
          .from("app_state")
          .upsert({ id: SINGLETON, data: data.data, updated_at: new Date().toISOString() });
        return Response.json({ status: "ok" });
      },
    },
  },
});
