// Calculation engine — mirrors the Excel template
// "განფასება_შაბლონი_GT_v3.xlsx" (Fuji Hitech / KLEEMANN Economic Model)

import type { AppState, Unit, FinancialAssumptions, PaymentScenario, TravelGroup, EquipmentCategory, ProfitThreshold } from "./econ-types";
import { defaultProfitThresholds } from "./econ-defaults";

export interface UnitEconomics {
  id: string;
  category: EquipmentCategory;
  floors: number;
  purchaseCost: number; // D = factory + allocated(bank + intT + terminal + localT)
  installCost: number; // E = floors*(mech+elec)/(1-inc)/(1-pen) + materials + per-unit travel share
  totalCost: number; // F = D + E
  markup: number; // G = D*eqMk + E*instMk (unit's own markup rates)
  priceNoExtras: number; // H = F + G
  extras: number; // I = H*cont + (factory+allocatedBank)*fx + other + grounding + factory*warranty + monthlyService*freeMonths
  priceNoVat: number; // J = H + I
  vat: number; // K = J * vatRate
  bankGuarantee: number; // L
  finalPrice: number; // M_final = (J + K + L) * (1 + brokerCommissionPct)
  marginPct: number; // N = G / J
  projectShare: number; // O = M_final / total_M_final
  belowMinAmount: boolean; // G < profitThresholds[category].minAmount
  belowMinMargin: boolean; // marginPct < profitThresholds[category].minMarginPct
}

export interface TravelBreakdown {
  meals: { mechanics: number; electricians: number; admin: number; total: number };
  hotel: { mechanics: number; electricians: number; admin: number; total: number };
  fuel: { mechanics: number; electricians: number; admin: number; total: number };
  totalsGel: { meals: number; hotel: number; fuel: number; grand: number };
  totalUsd: number; // C30
  hotelUsd: number; // C31
  mealsUsd: number; // C32
  fuelUsd: number; // C33
  perUnitUsd: number; // C34
  fuelPerKm: number; // C24
}

export interface ProjectReport {
  // Purchase
  factoryTotal: number; // D43
  bankCommTotal: number; // D44
  intTransportTotal: number; // D45
  terminalTotal: number; // D46
  localTransportTotal: number; // D47
  purchaseTotal: number; // D48
  // Install
  mechPayroll: number; // D50
  elecPayroll: number; // D51
  travelTotal: number; // D52
  materialsTotal: number; // D53
  installTotal: number; // D54
  costTotal: number; // D55
  // Markup
  equipmentMarkup: number; // D57
  installMarkup: number; // D58
  markupTotal: number; // D59
  priceNoExtras: number; // D60
  // Extras
  contingency: number; // D62
  fxRisk: number; // D63
  otherTotal: number; // D64
  groundingTotal: number; // D65
  brokerTotal: number; // D66 — now derived from per-unit % applied at the final stage
  warrantyCost: number; // D67
  freeServiceCost: number; // D68
  extrasTotal: number; // D69
  // Final
  priceNoVat: number; // D71
  vat: number; // D72
  priceWithVat: number; // D73
  guaranteeBase: number; // D75
  guaranteeFee: number; // D76
  finalContractPrice: number; // D77
  totalMarginPct: number; // D78
  // Verification
  checkDiff: number; // D81 (should be ~0)
}

export interface PaymentEvent {
  label: string;
  amount: number; // + inflow / − outflow
  balance: number;
}

export interface PaymentReport {
  contractPrice: number;
  procurementAdvancePct: number;
  scenario: PaymentScenario & { tranche4: number };
  tranches: { label: string; pct: number; amount: number }[];
  events: PaymentEvent[];
  finalBalance: number;
}

export interface FullEconomics {
  units: UnitEconomics[];
  totals: {
    purchaseCost: number;
    installCost: number;
    totalCost: number;
    markup: number;
    priceNoExtras: number;
    extras: number;
    priceNoVat: number;
    vat: number;
    bankGuarantee: number;
    finalPrice: number;
    marginPct: number;
  };
  travel: TravelBreakdown;
  report: ProjectReport;
  scenarioA: PaymentReport;
  scenarioB: PaymentReport;
}

function activeUnits(units: Unit[]) {
  return units.filter((u) => u.id && u.id.trim() !== "");
}

// Distributes a project-level total (e.g. bank commission) across active units
// in proportion to each unit's factoryPrice. If no unit has a factory price,
// falls back to an even split. Any rounding remainder is assigned to the last
// unit so the allocated amounts always sum EXACTLY to `total` — this keeps
// report.checkDiff at 0 regardless of rounding.
export function distributeByFactoryPrice(units: Unit[], total: number): Map<string, number> {
  const map = new Map<string, number>();
  if (units.length === 0) return map;
  const totalFactory = units.reduce((s, u) => s + u.factoryPrice, 0);
  let allocated = 0;
  units.forEach((u, i) => {
    const isLast = i === units.length - 1;
    if (isLast) {
      map.set(u.id, Math.round((total - allocated) * 100) / 100);
      return;
    }
    const share = totalFactory > 0 ? u.factoryPrice / totalFactory : 1 / units.length;
    const amount = Math.round(total * share * 100) / 100;
    allocated += amount;
    map.set(u.id, amount);
  });
  return map;
}

export interface UnitAllocations {
  bank: number;
  intTransport: number;
  terminal: number;
  localTransport: number;
}

// Convenience: allocation maps for all 4 project-level purchase-cost totals at once.
export function allocateProjectCosts(state: AppState): {
  bank: Map<string, number>;
  intTransport: Map<string, number>;
  terminal: Map<string, number>;
  localTransport: Map<string, number>;
} {
  const units = activeUnits(state.project.units);
  const p = state.project;
  return {
    bank: distributeByFactoryPrice(units, p.bankCommissionTotal),
    intTransport: distributeByFactoryPrice(units, p.intTransportTotal),
    terminal: distributeByFactoryPrice(units, p.terminalTotal),
    localTransport: distributeByFactoryPrice(units, p.localTransportTotal),
  };
}

export function computeTravel(state: AppState): TravelBreakdown {
  const f = state.finance;
  const t = state.project.travel;
  const nUnits = activeUnits(state.project.units).length || 1;

  const fuelPerKm = (f.fuelPricePerL * t.fuelConsumption) / 100; // C24

  const meal = (g: { headcount: number; days: number }) =>
    f.mealPerDay * g.headcount * g.days;
  const fuel = (g: { trips: number }) =>
    t.distanceKm * 2 * g.trips * fuelPerKm;
  // "hotel" mode: daily tariff (finance.hotelX) × days. "house" mode: flat monthly total.
  const accommodation = (g: TravelGroup, dailyRate: number) =>
    g.accommodationMode === "hotel" ? dailyRate * g.days : g.houseRentTotal;

  const meals = {
    mechanics: meal(t.mechanics),
    electricians: meal(t.electricians),
    admin: meal(t.admin),
    total: 0,
  };
  meals.total = meals.mechanics + meals.electricians + meals.admin;

  const hotel = {
    mechanics: accommodation(t.mechanics, f.hotelMechanics),
    electricians: accommodation(t.electricians, f.hotelElectricians),
    admin: accommodation(t.admin, f.hotelAdmin),
    total: 0,
  };
  hotel.total = hotel.mechanics + hotel.electricians + hotel.admin;

  const fuelBd = {
    mechanics: fuel(t.mechanics),
    electricians: fuel(t.electricians),
    admin: fuel(t.admin),
    total: 0,
  };
  fuelBd.total = fuelBd.mechanics + fuelBd.electricians + fuelBd.admin;

  const grand = meals.total + hotel.total + fuelBd.total;
  const usd = f.usdRate || 1;

  return {
    meals,
    hotel,
    fuel: fuelBd,
    totalsGel: {
      meals: meals.total,
      hotel: hotel.total,
      fuel: fuelBd.total,
      grand,
    },
    totalUsd: grand / usd,
    hotelUsd: hotel.total / usd,
    mealsUsd: meals.total / usd,
    fuelUsd: fuelBd.total / usd,
    perUnitUsd: grand / usd / nUnits,
    fuelPerKm,
  };
}

// Per-unit install cost (matches template E-column)
// Note: template uses labor rates in GEL directly without USD conversion —
// preserved verbatim for parity with the spreadsheet. mechRateGel/elecRateGel
// are now per-unit fields (previously global assumptions).
function unitInstallCost(u: Unit, f: FinancialAssumptions) {
  const grossFactor = 1 / ((1 - f.incomeTaxRate) * (1 - f.pensionRate));
  return u.floors * u.mechRateGel * grossFactor
    + u.floors * u.elecRateGel * grossFactor
    + u.materials;
}

function unitPurchaseCost(u: Unit, allocated: UnitAllocations) {
  return u.factoryPrice + allocated.bank + allocated.intTransport + allocated.terminal + allocated.localTransport;
}

export function computeEconomics(state: AppState): FullEconomics {
  const f = state.finance;
  const p = state.project;
  const units = activeUnits(p.units);
  const travel = computeTravel(state);

  const alloc = allocateProjectCosts(state);
  const allocationOf = (u: Unit): UnitAllocations => ({
    bank: alloc.bank.get(u.id) ?? 0,
    intTransport: alloc.intTransport.get(u.id) ?? 0,
    terminal: alloc.terminal.get(u.id) ?? 0,
    localTransport: alloc.localTransport.get(u.id) ?? 0,
  });
  // Shared per-unit purchase/install cost helpers — used both by the primary
  // per-unit pass (rows) and the independent "check row" report below, so the
  // underlying D/E formulas can never drift out of sync between the two.
  const purchaseCostOf = (u: Unit) => unitPurchaseCost(u, allocationOf(u));
  const installCostOf = (u: Unit) => unitInstallCost(u, f) + travel.perUnitUsd;
  // "თავისუფალი სერვისი" (monthlyServiceUsd × freeServiceMonths) — ეს პროექტის
  // დონის ერთჯერადი ჯამია, არა თითოეული დანადგარისთვის ცალ-ცალკე გამეორებადი.
  // ვანაწილებთ დანადგარებზე თანაბრად, რომ ჯამში ზუსტად პროექტის ჯამს გაუტოლდეს
  // (ისევე, როგორც მოგზაურობის ხარჯი perUnitUsd-ით ნაწილდება).
  const freeServicePerUnit = (f.monthlyServiceUsd * f.freeServiceMonths) / (units.length || 1);

  // ძველ (არქივირებულ) პროექტებს შესაძლოა არ ჰქონდეთ profitThresholds/category —
  // დაცვის მიზნით ნაგულისხმევებზე ვბრუნდებით, რომ გაანგარიშება არასდროს ავარდეს.
  const thresholds = state.profitThresholds ?? defaultProfitThresholds;

  // First pass — compute everything except projectShare
  const rows: UnitEconomics[] = units.map((u) => {
    const category: EquipmentCategory = u.category ?? "lift";
    const allocated = allocationOf(u);
    const D = purchaseCostOf(u);
    const E = installCostOf(u);
    const F = D + E;
    const G = D * u.equipmentMarkupPct + E * u.installMarkupPct;
    const H = F + G;
    const I =
      H * u.contingencyPct +
      (u.factoryPrice + allocated.bank) * u.fxRiskPct +
      u.otherCost +
      u.grounding +
      u.factoryPrice * u.warrantyPct +
      freeServicePerUnit;
    const J = H + I;
    const K = J * f.vatRate;
    const L = (((J + K) * f.guaranteePct) * f.guaranteeAnnualPct * f.guaranteeDays / 365) * (1 + f.vatRate);
    const M = J + K + L;
    const finalPrice = M * (1 + u.brokerCommissionPct);
    const marginPct = J ? G / J : 0;
    const threshold: ProfitThreshold = thresholds[category] ?? { minAmount: 0, minMarginPct: 0 };
    return {
      id: u.id,
      category,
      floors: u.floors,
      purchaseCost: D,
      installCost: E,
      totalCost: F,
      markup: G,
      priceNoExtras: H,
      extras: I,
      priceNoVat: J,
      vat: K,
      bankGuarantee: L,
      finalPrice,
      marginPct,
      projectShare: 0,
      belowMinAmount: G < threshold.minAmount,
      belowMinMargin: marginPct < threshold.minMarginPct,
    };
  });
  const totalM = rows.reduce((s, r) => s + r.finalPrice, 0);
  rows.forEach((r) => (r.projectShare = totalM ? r.finalPrice / totalM : 0));

  const sum = (k: keyof UnitEconomics) =>
    rows.reduce((s, r) => s + (r[k] as number), 0);

  const totals = {
    purchaseCost: sum("purchaseCost"),
    installCost: sum("installCost"),
    totalCost: sum("totalCost"),
    markup: sum("markup"),
    priceNoExtras: sum("priceNoExtras"),
    extras: sum("extras"),
    priceNoVat: sum("priceNoVat"),
    vat: sum("vat"),
    bankGuarantee: sum("bankGuarantee"),
    finalPrice: totalM,
    marginPct: sum("priceNoExtras") ? sum("markup") / sum("priceNoVat") : 0,
  };

  // Detailed project report (independent recomputation from raw unit/finance
  // data, "check row"). Purchase-cost totals now come directly from the
  // project-level input fields (by construction equal to the sum of the
  // allocated per-unit amounts). Labor rates and margin/risk % are per-unit,
  // so those sub-totals are summed per unit rather than aggregate×rate.
  const grossFactor = 1 / ((1 - f.incomeTaxRate) * (1 - f.pensionRate));

  const factoryTotal = units.reduce((s, u) => s + u.factoryPrice, 0);
  const bankCommTotal = p.bankCommissionTotal;
  const intTransportTotal = p.intTransportTotal;
  const terminalTotal = p.terminalTotal;
  const localTransportTotal = p.localTransportTotal;
  const purchaseTotal = factoryTotal + bankCommTotal + intTransportTotal + terminalTotal + localTransportTotal;

  const mechPayroll = units.reduce((s, u) => s + u.floors * u.mechRateGel * grossFactor, 0);
  const elecPayroll = units.reduce((s, u) => s + u.floors * u.elecRateGel * grossFactor, 0);
  const reportTravelTotal = travel.totalUsd;
  const materialsTotal = units.reduce((s, u) => s + u.materials, 0);
  const installTotal = mechPayroll + elecPayroll + reportTravelTotal + materialsTotal;
  const costTotal = purchaseTotal + installTotal;

  const equipmentMarkup = units.reduce((s, u) => s + purchaseCostOf(u) * u.equipmentMarkupPct, 0);
  const installMarkup = units.reduce((s, u) => s + installCostOf(u) * u.installMarkupPct, 0);
  const markupTotal = equipmentMarkup + installMarkup;
  const reportPriceNoExtras = costTotal + markupTotal;

  const contingency = units.reduce((s, u) => {
    const D = purchaseCostOf(u);
    const E = installCostOf(u);
    const H = D + E + D * u.equipmentMarkupPct + E * u.installMarkupPct;
    return s + H * u.contingencyPct;
  }, 0);
  const fxRisk = units.reduce((s, u) => s + (u.factoryPrice + (alloc.bank.get(u.id) ?? 0)) * u.fxRiskPct, 0);
  const otherTotal = units.reduce((s, u) => s + u.otherCost, 0);
  const groundingTotal = units.reduce((s, u) => s + u.grounding, 0);
  const warrantyCost = units.reduce((s, u) => s + u.factoryPrice * u.warrantyPct, 0);
  const freeServiceCost = f.monthlyServiceUsd * f.freeServiceMonths;
  // Broker commission no longer sits in the extras/cost stack — it's applied
  // multiplicatively at the very end (see rows above). Recomputed here from
  // each unit's own pre-broker final price (M) and % for the check row.
  const brokerTotal = rows.reduce((s, r, i) => {
    const pct = units[i].brokerCommissionPct;
    if (!pct) return s;
    const M = r.finalPrice / (1 + pct);
    return s + (r.finalPrice - M);
  }, 0);
  const extrasTotal = contingency + fxRisk + otherTotal + groundingTotal + warrantyCost + freeServiceCost;

  const reportPriceNoVat = reportPriceNoExtras + extrasTotal;
  const reportVat = reportPriceNoVat * f.vatRate;
  const priceWithVat = reportPriceNoVat + reportVat;
  const guaranteeBase = priceWithVat * f.guaranteePct;
  const guaranteeFee = (guaranteeBase * f.guaranteeAnnualPct * f.guaranteeDays) / 365;
  const finalContractPriceExBroker = (reportPriceNoVat + guaranteeFee) * (1 + f.vatRate);
  const finalContractPrice = finalContractPriceExBroker + brokerTotal;
  const totalMarginPct = reportPriceNoVat ? markupTotal / reportPriceNoVat : 0;

  const report: ProjectReport = {
    factoryTotal,
    bankCommTotal,
    intTransportTotal,
    terminalTotal,
    localTransportTotal,
    purchaseTotal,
    mechPayroll,
    elecPayroll,
    travelTotal: reportTravelTotal,
    materialsTotal,
    installTotal,
    costTotal,
    equipmentMarkup,
    installMarkup,
    markupTotal,
    priceNoExtras: reportPriceNoExtras,
    contingency,
    fxRisk,
    otherTotal,
    groundingTotal,
    brokerTotal,
    warrantyCost,
    freeServiceCost,
    extrasTotal,
    priceNoVat: reportPriceNoVat,
    vat: reportVat,
    priceWithVat,
    guaranteeBase,
    guaranteeFee,
    finalContractPrice,
    totalMarginPct,
    checkDiff: Math.round((totals.finalPrice - finalContractPrice) * 100) / 100,
  };

  const scenarioA = buildPaymentReport(state, "A", totals.finalPrice, report);
  const scenarioB = buildPaymentReport(state, "B", totals.finalPrice, report);

  return { units: rows, totals, travel, report, scenarioA, scenarioB };
}

function buildPaymentReport(
  state: AppState,
  which: "A" | "B",
  contractPrice: number,
  report: ProjectReport
): PaymentReport {
  const f = state.finance;
  const p = state.payment;
  const sc = which === "A" ? p.scenarioA : p.scenarioB;
  const t4 = 1 - sc.tranche1 - sc.tranche2 - sc.tranche3;
  const scenario = { ...sc, tranche4: t4 };

  const T1 = sc.tranche1 * contractPrice;
  const T2 = sc.tranche2 * contractPrice;
  const T3 = sc.tranche3 * contractPrice;
  const T4 = t4 * contractPrice;

  const supplierBase = report.factoryTotal + report.bankCommTotal + report.terminalTotal + report.localTransportTotal;
  const advance = -supplierBase * p.procurementAdvancePct;
  const balance = -supplierBase * (1 - p.procurementAdvancePct);
  const intTransport = -report.intTransportTotal;
  const customsVat = -((supplierBase + report.intTransportTotal) * f.vatRate);
  const installMob = -(report.mechPayroll + report.elecPayroll) * 0.6;
  const installFinal = -(report.mechPayroll + report.elecPayroll) * 0.4;
  const vatBudget = (T: number) => -T / (1 + f.vatRate) * f.vatRate;

  const raw: [string, number][] = [
    ["I ტრანშის მიღება", +T1],
    ["მომწოდებლისთვის ავანსი", advance],
    ["დღგ ბიუჯეტში — I ტრანშზე", vatBudget(T1)],
    ["საერთაშორისო ტრანსპორტირება", intTransport],
    ["II ტრანშის მიღება", +T2],
    ["მომწოდებლისთვის ბალანსი", balance],
    ["დღგ ბიუჯეტში — II ტრანშზე", vatBudget(T2)],
    ["III ტრანშის მიღება", +T3],
    ["საბაჟო დღგ იმპორტზე", customsVat],
    ["დღგ ბიუჯეტში — III ტრანშზე", vatBudget(T3)],
    ["მონტაჟი — I და II ფაზა", installMob],
    ["IV ტრანშის მიღება", +T4],
    ["დღგ ბიუჯეტში — IV ტრანშზე", vatBudget(T4)],
    ["მონტაჟი — III და IV ფაზა", installFinal],
  ];

  const events: PaymentEvent[] = [];
  let bal = 0;
  raw.forEach(([label, amount]) => {
    bal += amount;
    events.push({ label, amount, balance: bal });
  });

  return {
    contractPrice,
    procurementAdvancePct: p.procurementAdvancePct,
    scenario,
    tranches: [
      { label: "I ტრანში", pct: sc.tranche1, amount: T1 },
      { label: "II ტრანში", pct: sc.tranche2, amount: T2 },
      { label: "III ტრანში", pct: sc.tranche3, amount: T3 },
      { label: "IV ტრანში (ნაშთი)", pct: t4, amount: T4 },
    ],
    events,
    finalBalance: bal,
  };
}
