// Calculation engine — mirrors the Excel template
// "განფასება_შაბლონი_GT_v3.xlsx" (Fuji Hitech / KLEEMANN Economic Model)

import type { AppState, Unit, FinancialAssumptions, TravelGroup, EquipmentCategory, ProfitThreshold } from "./econ-types";
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
  vat: number; // K = equipmentPortion*equipmentVatRate + otherPortion*otherVatRate
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
  scaffoldingTotal: number; // ხარაჩო, ჯამურად
  installTotal: number; // D54
  costTotal: number; // D55
  // Markup
  equipmentMarkup: number; // D57
  installMarkup: number; // D58
  markupTotal: number; // D59
  priceNoExtras: number; // D60
  // Extras
  contingency: number; // D62
  overhead: number; // ზედნადები ხარჯი — H × overheadPct (გაუთვალისწინებელის შემდეგ)
  salesBuffer: number; // გაყიდვების ტარიფის ბუფერი (sales rate − real) — overhead-ში, markup-ნეიტრალური
  fxRisk: number; // D63
  otherTotal: number; // D64
  groundingTotal: number; // D65
  brokerTotal: number; // D66 — now derived from per-unit % applied at the final stage
  warrantyCost: number; // D67
  freeServiceCost: number; // D68
  guaranteeAmountCost: number; // გარანტიის ჯამური თანხა (ისევე, როგორც freeServiceCost — ერთჯერადი პროექტის ჯამი)
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
  tranches: { label: string; pct: number; amount: number }[];
  pctSum: number; // ჯამური % — უნდა იყოს ≈1, თუმცა ხელით ივსება და შეიძლება არ ემთხვეოდეს
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

// ბანკის საკომისიო — თანაბრად იყოფა დანადგარებზე, თითო მინიმუმ minPerUnit ($).
// perUnit = max(total / N, minPerUnit). ჯამი შესაბამისად იზრდება, თუ floor მოქმედებს.
export function distributeEqualWithMin(units: Unit[], total: number, minPerUnit: number): Map<string, number> {
  const map = new Map<string, number>();
  const n = units.length;
  if (n === 0) return map;
  const perUnit = Math.max(total / n, minPerUnit);
  const rounded = Math.round(perUnit * 100) / 100;
  units.forEach((u) => map.set(u.id, rounded));
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
    bank: distributeEqualWithMin(units, p.bankCommissionTotal, state.defaultRates?.bankCommissionMinPerUnit ?? 25),
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

  // per-group meal daily rate (GEL, per person). back-compat: ძველი გლობალური mealPerDay-ზე დაცემა.
  const mealRate = {
    mechanics: f.mealMechanics ?? f.mealPerDay ?? 0,
    electricians: f.mealElectricians ?? f.mealPerDay ?? 0,
    admin: f.mealAdmin ?? f.mealPerDay ?? 0,
  };
  const meal = (g: { headcount: number; days: number }, rate: number) =>
    rate * g.headcount * g.days;
  const fuel = (g: { trips: number }) =>
    t.distanceKm * 2 * g.trips * fuelPerKm;
  // "hotel" mode: daily tariff (finance.hotelX) × days. "house" mode: flat monthly total.
  const accommodation = (g: TravelGroup, dailyRate: number) =>
    g.accommodationMode === "hotel" ? dailyRate * g.days : g.houseRentTotal;

  const meals = {
    mechanics: meal(t.mechanics, mealRate.mechanics),
    electricians: meal(t.electricians, mealRate.electricians),
    admin: meal(t.admin, mealRate.admin),
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
// ხელფასის „გაგროსვა" (საშემოსავლო + საპენსიო). განაკვეთი ≥100% გამოიწვევდა ნულზე
// გაყოფას (ფასი „—") — ამიტომ თითო განაკვეთი 95%-ზე იზღუდება.
function grossOf(f: FinancialAssumptions): number {
  const clamp = (x: number) => Math.min(Math.max(Number(x) || 0, 0), 0.95);
  return 1 / ((1 - clamp(f.incomeTaxRate)) * (1 - clamp(f.pensionRate)));
}

// preserved verbatim for parity with the spreadsheet. mechRateGel/elecRateGel
// are now per-unit fields (previously global assumptions).
function unitInstallCost(u: Unit, f: FinancialAssumptions) {
  const grossFactor = grossOf(f);
  return u.floors * u.mechRateGel * grossFactor
    + u.floors * u.elecRateGel * grossFactor
    + u.materials
    + (u.scaffolding ?? 0);
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
  // გარანტიის ჯამური თანხაც იმავე პრინციპით — ერთიანი ჯამი, თანაბრად განაწილებული.
  // ?? 0 დაცვაა ძველი (არქივირებული) პროექტებისთვის, რომლებსაც ეს ველი ჯერ არ ჰქონდათ.
  const guaranteeAmountPerUnit = (f.guaranteeAmountTotal ?? 0) / (units.length || 1);

  // ძველ (არქივირებულ) პროექტებს შესაძლოა არ ჰქონდეთ profitThresholds/category —
  // დაცვის მიზნით ნაგულისხმევებზე ვბრუნდებით, რომ გაანგარიშება არასდროს ავარდეს.
  const thresholds = state.profitThresholds ?? defaultProfitThresholds;

  const bufGross = grossOf(f);
  // გაყიდვების ტარიფის ბუფერი per unit: (sales rate − real) × სართული × დარიცხვები.
  // მხოლოდ დადებითი (sales ≥ real); sales-განაკვეთის გარეშე default 0 → ქცევა უცვლელი.
  const salesBufferOf = (u: Unit) =>
    u.floors * bufGross * (
      Math.max((u.mechRateSalesGel ?? 0) - u.mechRateGel, 0) +
      Math.max((u.elecRateSalesGel ?? 0) - u.elecRateGel, 0)
    );

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
      H * (u.overheadPct ?? 0) +
      salesBufferOf(u) +
      (u.factoryPrice + allocated.bank) * u.fxRiskPct +
      u.otherCost +
      u.grounding +
      u.factoryPrice * u.warrantyPct +
      freeServicePerUnit +
      guaranteeAmountPerUnit;
    const J = H + I;
    // დღგ გაყოფილია: "დანადგარის" ნაწილი (D + მისი ფასნამატი — ზოგჯერ
    // განთავისუფლებულია) და "დანარჩენი" (მონტაჟი + მისი ფასნამატი + ყველა
    // დამატებითი ხარჯი — ყოველთვის იბეგრება სტანდარტული განაკვეთით).
    const equipmentPortion = D * (1 + u.equipmentMarkupPct);
    const otherPortion = J - equipmentPortion;
    const K = equipmentPortion * f.equipmentVatRate + otherPortion * f.otherVatRate;
    const L = (((J + K) * f.guaranteePct) * f.guaranteeAnnualPct * f.guaranteeDays / 365) * (1 + f.otherVatRate);
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
  const grossFactor = grossOf(f);

  const factoryTotal = units.reduce((s, u) => s + u.factoryPrice, 0);
  // ბანკის საკომისიო: დანადგარებზე გადანაწილებული ჯამი (მინ. თითო დანადგარზე
  // floor-ის ჩათვლით) — რომ ანგარიში და დანადგარების ცხრილი ერთმანეთს ემთხვეოდეს
  // (წინათ აქ ხელით შეყვანილი ჯამი იდგა და floor-ის დროს checkDiff ≠ 0 იყო).
  const bankCommTotal = units.length
    ? units.reduce((s, u) => s + (alloc.bank.get(u.id) ?? 0), 0)
    : p.bankCommissionTotal;
  const intTransportTotal = p.intTransportTotal;
  const terminalTotal = p.terminalTotal;
  const localTransportTotal = p.localTransportTotal;
  const purchaseTotal = factoryTotal + bankCommTotal + intTransportTotal + terminalTotal + localTransportTotal;

  const mechPayroll = units.reduce((s, u) => s + u.floors * u.mechRateGel * grossFactor, 0);
  const elecPayroll = units.reduce((s, u) => s + u.floors * u.elecRateGel * grossFactor, 0);
  const reportTravelTotal = travel.totalUsd;
  const materialsTotal = units.reduce((s, u) => s + u.materials, 0);
  const scaffoldingTotal = units.reduce((s, u) => s + (u.scaffolding ?? 0), 0);
  const installTotal = mechPayroll + elecPayroll + reportTravelTotal + materialsTotal + scaffoldingTotal;
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
  const salesBuffer = units.reduce((s, u) => s + salesBufferOf(u), 0);
  const overhead = units.reduce((s, u) => {
    const D = purchaseCostOf(u);
    const E = installCostOf(u);
    const H = D + E + D * u.equipmentMarkupPct + E * u.installMarkupPct;
    return s + H * (u.overheadPct ?? 0);
  }, 0) + salesBuffer;
  const fxRisk = units.reduce((s, u) => s + (u.factoryPrice + (alloc.bank.get(u.id) ?? 0)) * u.fxRiskPct, 0);
  const otherTotal = units.reduce((s, u) => s + u.otherCost, 0);
  const groundingTotal = units.reduce((s, u) => s + u.grounding, 0);
  const warrantyCost = units.reduce((s, u) => s + u.factoryPrice * u.warrantyPct, 0);
  const freeServiceCost = f.monthlyServiceUsd * f.freeServiceMonths;
  const guaranteeAmountCost = f.guaranteeAmountTotal ?? 0;
  // Broker commission no longer sits in the extras/cost stack — it's applied
  // multiplicatively at the very end (see rows above). Recomputed here from
  // each unit's own pre-broker final price (M) and % for the check row.
  const brokerTotal = rows.reduce((s, r, i) => {
    const pct = units[i].brokerCommissionPct;
    if (!pct) return s;
    const M = r.finalPrice / (1 + pct);
    return s + (r.finalPrice - M);
  }, 0);
  const extrasTotal = contingency + overhead + fxRisk + otherTotal + groundingTotal + warrantyCost + freeServiceCost + guaranteeAmountCost;

  const reportPriceNoVat = reportPriceNoExtras + extrasTotal;
  // იგივე გაყოფა, რაც ცხრილის pass-ში — რომ checkDiff ყოველთვის ~0-ს
  // შეესაბამებოდეს (იხ. ზემოთ "First pass" კომენტარი).
  const equipmentPortionTotal = units.reduce((s, u) => s + purchaseCostOf(u) * (1 + u.equipmentMarkupPct), 0);
  const otherPortionTotal = reportPriceNoVat - equipmentPortionTotal;
  const reportVat = equipmentPortionTotal * f.equipmentVatRate + otherPortionTotal * f.otherVatRate;
  const priceWithVat = reportPriceNoVat + reportVat;
  const guaranteeBase = priceWithVat * f.guaranteePct;
  const guaranteeFee = (guaranteeBase * f.guaranteeAnnualPct * f.guaranteeDays) / 365;
  const finalContractPriceExBroker = priceWithVat + guaranteeFee * (1 + f.otherVatRate);
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
    scaffoldingTotal,
    installTotal,
    costTotal,
    equipmentMarkup,
    installMarkup,
    markupTotal,
    priceNoExtras: reportPriceNoExtras,
    contingency,
    overhead,
    salesBuffer,
    fxRisk,
    otherTotal,
    groundingTotal,
    brokerTotal,
    warrantyCost,
    freeServiceCost,
    guaranteeAmountCost,
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
  const p = state.payment;
  const sc = which === "A" ? p.scenarioA : p.scenarioB;

  const tranches = sc.tranches.map((t) => ({ label: t.label, pct: t.pct, amount: t.pct * contractPrice }));
  const pctSum = sc.tranches.reduce((s, t) => s + t.pct, 0);

  // ქრონოლოგიური ნაკადი: თითოეული ტრანშის მიღების შემდეგ ჩნდება მასზე მიბმული
  // გასავლის სტრიქონები (afterTranche), ამ თანმიმდევრობით — ტრანშის ინდექსი,
  // შემდეგ იმ ინდექსზე მიბმული ხარჯები, დამატების თანმიმდევრობით.
  const before = sc.expenses.filter((e) => e.afterTranche < 0);
  const raw: [string, number][] = before.map((e) => [e.label, e.amount]);
  tranches.forEach((t, i) => {
    raw.push([t.label + " მიღება", t.amount]);
    sc.expenses
      .filter((e) => e.afterTranche === i)
      .forEach((e) => raw.push([e.label, e.amount]));
  });

  const events: PaymentEvent[] = [];
  let bal = 0;
  raw.forEach(([label, amount]) => {
    bal += amount;
    events.push({ label, amount, balance: bal });
  });

  return {
    contractPrice,
    procurementAdvancePct: p.procurementAdvancePct,
    tranches,
    pctSum,
    events,
    finalBalance: bal,
  };
}

// "ავტომატური შევსება" ღილაკისთვის — თანამედროვე პროექტის რეალურ ჯამებზე
// დაფუძნებული საწყისი (suggested) გასავლების ნაკრები. მომხმარებელი შემდეგ
// ამ თანხებს თავისუფლად ასწორებს/შლის/ამატებს — ეს მხოლოდ ერთჯერადი შევსებაა,
// არა ცოცხალი ფორმულა.
export function suggestPaymentExpenses(state: AppState, which: "A" | "B"): { label: string; amount: number; afterTranche: number }[] {
  const eco = computeEconomics(state);
  const f = state.finance;
  const p = state.payment;
  const sc = which === "A" ? p.scenarioA : p.scenarioB;
  const contractPrice = eco.totals.finalPrice;
  const report = eco.report;
  const n = sc.tranches.length;
  if (n === 0) return [];
  const last = n - 1;
  const iAdvance = 0;
  const iTransport = 0;
  const iBalance = Math.min(1, last);
  const iCustoms = Math.min(2, last);
  const iInstallMob = Math.min(2, last);
  const iInstallFinal = last;

  const supplierBase = report.factoryTotal + report.bankCommTotal + report.terminalTotal + report.localTransportTotal;
  const advance = -supplierBase * p.procurementAdvancePct;
  const balance = -supplierBase * (1 - p.procurementAdvancePct);
  const intTransport = -report.intTransportTotal;
  const customsVat = -((supplierBase + report.intTransportTotal) * f.equipmentVatRate);
  const installMob = -(report.mechPayroll + report.elecPayroll) * 0.6;
  const installFinal = -(report.mechPayroll + report.elecPayroll) * 0.4;

  const out: { label: string; amount: number; afterTranche: number }[] = [
    { label: "მომწოდებლისთვის ავანსი", amount: advance, afterTranche: iAdvance },
    { label: "საერთაშორისო ტრანსპორტირება", amount: intTransport, afterTranche: iTransport },
    { label: "მომწოდებლისთვის ბალანსი", amount: balance, afterTranche: iBalance },
    { label: "საბაჟო დღგ იმპორტზე", amount: customsVat, afterTranche: iCustoms },
    { label: "მონტაჟი — მობილიზაცია (60%)", amount: installMob, afterTranche: iInstallMob },
    { label: "მონტაჟი — დასრულება (40%)", amount: installFinal, afterTranche: iInstallFinal },
  ];
  // დღგ ბიუჯეტში — თითოეულ ტრანშზე, ცალკე. ტრანში შერეული (დანადგარი+დანარჩენი)
  // ფასის % არის, ამიტომ აქ საშუალო შეწონილ დღგ-ის განაკვეთს ვიყენებთ.
  const effectiveVatRate = report.priceNoVat ? report.vat / report.priceNoVat : 0;
  sc.tranches.forEach((t, i) => {
    const T = t.pct * contractPrice;
    out.push({ label: `დღგ ბიუჯეტში — ${t.label}`, amount: -T / (1 + effectiveVatRate) * effectiveVatRate, afterTranche: i });
  });
  return out;
}

// გაყიდვების როლისთვის: დანადგარის ფასნამატის კორექტირებისას მიღებული მარჟა
// კატეგორიის მინიმალურ მარჟაზე (profitThresholds[cat].minMarginPct) ვერ უნდა ჩამოვიდეს.
// მარჟა მონოტონურად იზრდება ფასნამატთან ერთად, ამიტომ მინიმალურ დასაშვებ ფასნამატს
// ვპოულობთ ბინარული ძებნით, თვითონ ძრავის (computeEconomics) გამოყენებით — ფორმულის
// ცვლილებაზეც სწორი რჩება. აბრუნებს დასაშვებ ფასნამატს და clamped დროშას.
export function clampEquipmentMarkup(
  state: AppState,
  unitId: string,
  desiredPct: number,
  minMarginPct: number,
): { pct: number; clamped: boolean; minPct: number } {
  if (!(minMarginPct > 0)) return { pct: desiredPct, clamped: false, minPct: 0 };

  const marginAt = (pct: number): number => {
    const next: AppState = {
      ...state,
      project: {
        ...state.project,
        units: state.project.units.map((u) => (u.id === unitId ? { ...u, equipmentMarkupPct: pct } : u)),
      },
    };
    const ue = computeEconomics(next).units.find((x) => x.id === unitId);
    return ue ? ue.marginPct : 1;
  };

  if (marginAt(desiredPct) >= minMarginPct) return { pct: desiredPct, clamped: false, minPct: desiredPct };

  // ზედა ზღვრის მოძებნა, სადაც მარჟა უკვე აკმაყოფილებს მინიმუმს
  let hi = Math.max(desiredPct, 0.0001);
  let guard = 0;
  while (marginAt(hi) < minMarginPct && guard++ < 40) hi = hi * 2 + 0.01;
  let lo = desiredPct;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (marginAt(mid) >= minMarginPct) hi = mid; else lo = mid;
  }
  const minPct = Math.ceil(hi * 10000) / 10000; // ზევით ვამრგვალებთ, რომ იატაკს არ ჩამოსცდეს
  return { pct: minPct, clamped: true, minPct };
}
