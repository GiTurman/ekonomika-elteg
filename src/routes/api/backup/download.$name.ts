import { createFileRoute } from "@tanstack/react-router";
import { requireFull } from "@/server/apiAuth";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/backup/download/$name")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const denied = await requireFull(request);
        if (denied) return denied;
        const sb = admin();
        const { data, error } = await sb
          .from("app_backups")
          .select("data")
          .eq("name", params.name)
          .maybeSingle();
        if (error || !data) return new Response("Not found", { status: 404 });
        return new Response(JSON.stringify(data.data, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="${params.name}"`,
          },
        });
      },
    },
  },
});
