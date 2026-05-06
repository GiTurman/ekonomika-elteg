import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import defaultData from "@/server/default-data.json";

const SINGLETON = "singleton";

function admin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export const Route = createFileRoute("/api/data")({
  server: {
    handlers: {
      GET: async () => {
        const sb = admin();
        const { data, error } = await sb
          .from("app_state")
          .select("data")
          .eq("id", SINGLETON)
          .maybeSingle();
        if (error) return new Response(error.message, { status: 500 });
        if (!data) {
          await sb.from("app_state").insert({ id: SINGLETON, data: defaultData });
          return Response.json(defaultData);
        }
        return Response.json(data.data);
      },
      POST: async ({ request }) => {
        const body = await request.json();
        const sb = admin();
        const { error } = await sb
          .from("app_state")
          .upsert({ id: SINGLETON, data: body, updated_at: new Date().toISOString() });
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ status: "ok" });
      },
    },
  },
});
