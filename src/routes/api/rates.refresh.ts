import { createFileRoute } from "@tanstack/react-router";
import { requireFull } from "@/server/apiAuth";
import { createClient } from "@supabase/supabase-js";

const SINGLETON = "singleton";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/rates/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireFull(request);
        if (denied) return denied;
        try {
          const r = await fetch(
            "https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json",
            { signal: AbortSignal.timeout(8000) }
          );
          if (!r.ok) throw new Error(`NBG ${r.status}`);
          const json = (await r.json()) as Array<{ currencies: Array<{ code: string; rate: number; quantity: number }> }>;
          const curs = json[0].currencies;
          const round = (n: number, p = 4) => Math.round(n * 10 ** p) / 10 ** p;
          const rates: Record<string, number | string> = {};
          for (const c of curs) {
            if (c.code === "USD") rates.usd_gel = round(c.rate / c.quantity);
            if (c.code === "EUR") rates.eur_gel = round(c.rate / c.quantity);
          }
          if (rates.usd_gel && rates.eur_gel) {
            rates.eur_usd = round((rates.eur_gel as number) / (rates.usd_gel as number), 6);
          }
          rates.last_updated = new Date().toISOString().slice(0, 16).replace("T", " ");

          const sb = admin();
          const { data } = await sb.from("app_state").select("data").eq("id", SINGLETON).maybeSingle();
          const newData = { ...(data?.data || {}) } as Record<string, unknown>;
          newData.currency = { ...((newData.currency as object) || {}), ...rates };
          await sb
            .from("app_state")
            .upsert({ id: SINGLETON, data: newData, updated_at: new Date().toISOString() });
          return Response.json({ status: "ok", rates });
        } catch (e) {
          return Response.json(
            { status: "error", message: e instanceof Error ? e.message : String(e) },
            { status: 500 }
          );
        }
      },
    },
  },
});
