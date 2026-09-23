import { createFileRoute } from "@tanstack/react-router";
import { requireFull } from "@/server/apiAuth";
import { createClient } from "@supabase/supabase-js";

const SINGLETON = "singleton";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function ts() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export const Route = createFileRoute("/api/backup/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireFull(request);
        if (denied) return denied;
        const body = (await request.json().catch(() => ({}))) as { name?: string };
        const name = (body.name || "").trim();
        const sb = admin();
        const { data: state } = await sb.from("app_state").select("data").eq("id", SINGLETON).maybeSingle();
        const payload = state?.data ?? {};
        const fn = `backup_${ts()}${name ? "_" + name : ""}.json`;
        const size = JSON.stringify(payload).length;
        const { error } = await sb.from("app_backups").insert({ name: fn, data: payload, size_bytes: size });
        if (error) return Response.json({ status: "error", message: error.message }, { status: 500 });
        return Response.json({ status: "ok", file: fn, timestamp: ts() });
      },
    },
  },
});
