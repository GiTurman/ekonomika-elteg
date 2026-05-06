import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Unit = Record<string, number | string>;
type Currency = { usd_gel: number; eur_gel: number; eur_usd: number };

function num(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : d;
}

function calcUnit(u: Unit, cur: Currency) {
  const c = (u.currency as string) || "EUR";
  const unit_cost =
    num(u.factory_price) + num(u.bank_fee) + num(u.intl_transport) + num(u.terminal_fee) + num(u.local_transport);
  const install_cost =
    num(u.install_labor) + num(u.electrical) + num(u.accommodation) + num(u.food) + num(u.fuel) + num(u.materials);

  const lift_markup = unit_cost * (num(u.lift_markup_pct) / 100);
  const install_markup = install_cost * (num(u.install_markup_pct) / 100);
  const total_markup = lift_markup + install_markup;

  const unit_price = unit_cost + lift_markup;
  const install_price = install_cost + install_markup;
  const total_price = unit_price + install_price;

  const lm_pct = unit_price ? (lift_markup / unit_price) * 100 : 0;
  const im_pct = install_price ? (install_markup / install_price) * 100 : 0;
  const tm_pct = total_price ? (total_markup / total_price) * 100 : 0;

  const contingency = total_price * (num(u.contingency_pct) / 100);
  const bank_risk = total_price * (num(u.bank_risk_cent) / 100);
  const grounding = num(u.grounding);
  const intermediary = num(u.intermediary);

  const guar_pct = num(u.guarantee_pct);
  const guar_days = num(u.guarantee_days, 175);
  const guar_apct = num(u.guarantee_annual_pct, 4);
  const guar_amount = total_price * (guar_pct / 100);
  const guar_daily = guar_apct / 100 / 365;
  const guar_cost = guar_amount * guar_daily * guar_days;

  const free_svc = num(u.monthly_service) * num(u.free_service_months);
  const other_costs =
    contingency + bank_risk + num(u.other_expense) + grounding + intermediary + guar_cost + free_svc;

  const customs_pct = num(u.customs_pct);
  const customs_val = unit_price * (customs_pct / 100);

  const price_ex_vat = total_price + other_costs + customs_val;
  const vat_pct = num(u.vat_pct, 18);
  const vat_val = price_ex_vat * (vat_pct / 100);
  const price_inc_vat = price_ex_vat + vat_val;

  const round = (n: number, p = 4) => Math.round(n * 10 ** p) / 10 ** p;
  const conv = (v: number) => {
    if (c === "EUR") return { eur: v, usd: round(v * cur.eur_usd), gel: round(v * cur.eur_gel) };
    if (c === "USD") return { eur: round(v / cur.eur_usd), usd: v, gel: round(v * cur.usd_gel) };
    return { eur: round(v / cur.eur_gel), usd: round(v / cur.usd_gel), gel: v };
  };

  return {
    id: u.id,
    type: u.type ?? "lift",
    unit_cost: conv(unit_cost),
    install_cost: conv(install_cost),
    total_cost: conv(unit_cost + install_cost),
    lift_markup: conv(lift_markup),
    install_markup: conv(install_markup),
    total_markup: conv(total_markup),
    unit_price: conv(unit_price),
    install_price: conv(install_price),
    total_price: conv(total_price),
    lm_pct: round(lm_pct, 3),
    im_pct: round(im_pct, 3),
    tm_pct: round(tm_pct, 3),
    contingency: conv(contingency),
    bank_risk: conv(bank_risk),
    customs: conv(customs_val),
    other_costs: conv(other_costs),
    price_ex_vat: conv(price_ex_vat),
    vat: conv(vat_val),
    price_inc_vat: conv(price_inc_vat),
    revenue: conv(total_markup),
    currency: c,
    vat_pct,
  };
}

export const Route = createFileRoute("/api/calculate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const p = (await request.json()) as { units: Unit[]; currency: Currency };
        const results = (p.units || []).map((u) => calcUnit(u, p.currency));
        return Response.json(results);
      },
    },
  },
});

export const _admin = admin;
