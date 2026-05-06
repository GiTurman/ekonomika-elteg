import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/backup/list")({
  server: {
    handlers: {
      GET: async () => {
        const sb = admin();
        const { data, error } = await sb
          .from("app_backups")
          .select("name, size_bytes, created_at")
          .order("created_at", { ascending: false });
        if (error) return Response.json([], { status: 500 });
        return Response.json(
          (data || []).map((b) => ({
            name: b.name,
            size: b.size_bytes,
            modified: new Date(b.created_at).toISOString().replace("T", " ").slice(0, 19),
          }))
        );
      },
    },
  },
});
