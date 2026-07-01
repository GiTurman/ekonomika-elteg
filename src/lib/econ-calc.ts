// Calculation engine — mirrors the Excel template
// "განფასება_შაბლონი_GT_v3.xlsx" (Fuji Hitech / KLEEMANN Economic Model)

import type { AppState, Unit, FinancialAssumptions, PaymentScenario } from "./econ-types";

export interface UnitEconomics {
  id: string;
  floors: number;
  purchaseCost: number;   // D  = factory + bank + intT + terminal + localT
  installCost: number;    // E  = floors*(mech+elec)/(1-inc)/(1-pen) + materials  (in GEL — as per template)
  totalCost: number;      // F  = D + E
  markup: number;         // G  = D*eqMk + E*instMk
  priceNoExtras: number;  // H  = F + G
  extras: number;         // I  = H*cont + (factory+bank)*fx + other + grounding + broker + factory*warranty + monthlyService*freeMonths
  priceNoVat: number;     // J  = H + I
  vat: number;            // K  = J * vatRate
  bankGuarantee: number;  // L
  finalPrice: number;     // M  = J + K + L
  marginPct: number;      // N  = G / J
  projectShare: number;   // O  = M / total_M
}

export interface TravelBreakdown {
  meals: { mechanics: number; electricians: number; admin: number; total: number };
  hotel: { mechanics: number; electricians: number; admin: number; total: number };
  fuel:  { mechanics: number; electricians: number; admin: number; total: number };
  totalsGel: { meals: number; hotel: number; fuel: number; grand: number };
  totalUsd: number;         // C30
  hotelUsd: number;         // C31
  mealsUsd: number;         // C32
  fuelUsd: number;          // C33
  perUnitUsd: number;       // C34
  fuelPerKm: number;        // C24
}

export interface ProjectReport {
  // Purchase
  factoryTotal: number;    // D43
  bankCommTotal: number;   // D44
  intTransportTotal: number; // D45
  terminalTotal: number;   // D46
  localTransportTotal: number; // D47
  purchaseTotal: number;   // D48
  // Install
  mechPayroll: number;     // D50
  elecPayroll: number;     // D51
  travelTotal: number;     // D52
  materialsTotal: number;  // D53
  installTotal: number;    // D54
  costTotal: number;       // D55
  // Markup
  equipmentMarkup: number; // D57
  installMarkup: number;   // D58
  markupTotal: number;     // D59
  priceNoExtras: number;   // D60
  // Extras
  contingency: number;     // D62
  fxRisk: number;          // D63
  otherTotal: number;      // D64
  groundingTotal: number;  // D65
  brokerTotal: number;     // D66
  warrantyCost: number;    // D67
  freeServiceCost: number; // D68
  extrasTotal: number;     // D69
  // Final
  priceNoVat: number;      // D71
  vat: number;             // D72
  priceWithVat: number;    // D73
  guaranteeBase: number;   // D75
  guaranteeFee: number;    // D76
  finalContractPrice: number; // D77
  totalMarginPct: number;  // D78
  // Verification
  checkDiff: number;       // D81  (should be ~0)
}

export interface PaymentEvent {
  label: string;
  amount: number;   // + inflow / − outflow
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

export function computeTravel(state: AppState): TravelBreakdown {
  const f = state.finance;
  const t = state.project.travel;
  const nUnits = activeUnits(state.project.units).length || 1;

  const fuelPerKm = (f.fuelPricePerL * t.fuelConsumption) / 100; // C24

  const meal = (g: { headcount: number; days: number }) =>
    f.mealPerDay * g.headcount * g.days;
  const fuel = (g: { trips: number }) =>
    t.distanceKm * 2 * g.trips * fuelPerKm;

  const meals = {
    mechanics: meal(t.mechanics),
    electricians: meal(t.electricians),
    admin: meal(t.admin),
    total: 0,
  };
  meals.total = meals.mechanics + meals.electricians + meals.admin;

  const hotel = {
    mechanics: f.hotelMechanics,
    electricians: f.hotelElectricians,
    admin: f.hotelAdmin,
    total: f.hotelMechanics + f.hotelElectricians + f.hotelAdmin,
  };

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
// preserved verbatim for parity with the spreadsheet.
function unitInstallCost(u: Unit, f: FinancialAssumptions) {
  const grossFactor = 1 / ((1 - f.incomeTaxRate) * (1 - f.pensionRate));
  return u.floors * f.mechRateGel * grossFactor
       + u.floors * f.elecRateGel * grossFactor
       + u.materials;
}

function unitPurchaseCost(u: Unit) {
  return u.factoryPrice + u.bankCommission + u.intTransport + u.terminal + u.localTransport;
}

export function computeEconomics(state: AppState): FullEconomics {
  const f = state.finance;
  const units = activeUnits(state.project.units);

  // First pass — compute everything except projectShare
  const rows: UnitEconomics[] = units.map((u) => {
    const D = unitPurchaseCost(u);
    const E = unitInstallCost(u, f);
    const F = D + E;
    const G = D * f.equipmentMarkupPct + E * f.installMarkupPct;
    const H = F + G;
    const I =
      H * f.contingencyPct +
      (u.factoryPrice + u.bankCommission) * f.fxRiskPct +
      u.otherCost +
      u.grounding +
      u.brokerCommission +
      u.factoryPrice * f.warrantyPct +
      f.monthlyServiceUsd * f.freeServiceMonths;
    const J = H + I;
    const K = J * f.vatRate;
    const L = (((J + K) * f.guaranteePct) * f.guaranteeAnnualPct * f.guaranteeDays / 365) * (1 + f.vatRate);
    const M = J + K + L;
    return {
      id: u.id,
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
      finalPrice: M,
      marginPct: J ? G / J : 0,
      projectShare: 0,
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

  const travel = computeTravel(state);

  // Detailed project report (independent calculation, "check row")
  const grossFactor = 1 / ((1 - f.incomeTaxRate) * (1 - f.pensionRate));
  const sumU = (k: keyof Unit) =>
    units.reduce((s, u) => s + (u[k] as number), 0);
  const sumFloors = units.reduce((s, u) => s + u.floors, 0);

  const D43 = sumU("factoryPrice");
  const D44 = sumU("bankCommission");
  const D45 = sumU("intTransport");
  const D46 = sumU("terminal");
  const D47 = sumU("localTransport");
  const D48 = D43 + D44 + D45 + D46 + D47;

  const D50 = sumFloors * f.mechRateGel * grossFactor;
  const D51 = sumFloors * f.elecRateGel * grossFactor;
  const D52 = travel.totalUsd;
  const D53 = sumU("materials");
  const D54 = D50 + D51 + D52 + D53;
  const D55 = D48 + D54;

  const D57 = D48 * f.equipmentMarkupPct;
  const D58 = D54 * f.installMarkupPct;
  const D59 = D57 + D58;
  const D60 = D55 + D59;

  const D62 = D60 * f.contingencyPct;
  const D63 = (D43 + D44) * f.fxRiskPct;
  const D64 = sumU("otherCost");
  const D65 = sumU("grounding");
  const D66 = sumU("brokerCommission");
  const D67 = D43 * f.warrantyPct;
  const D68 = f.monthlyServiceUsd * f.freeServiceMonths;
  const D69 = D62 + D63 + D64 + D65 + D66 + D67 + D68;

  const D71 = D60 + D69;
  const D72 = D71 * f.vatRate;
  const D73 = D71 + D72;
  const D75 = D73 * f.guaranteePct;
  const D76 = (D75 * f.guaranteeAnnualPct * f.guaranteeDays) / 365;
  const D77 = (D71 + D76) * (1 + f.vatRate);
  const D78 = D71 ? D59 / D71 : 0;

  const report: ProjectReport = {
    factoryTotal: D43,
    bankCommTotal: D44,
    intTransportTotal: D45,
    terminalTotal: D46,
    localTransportTotal: D47,
    purchaseTotal: D48,
    mechPayroll: D50,
    elecPayroll: D51,
    travelTotal: D52,
    materialsTotal: D53,
    installTotal: D54,
    costTotal: D55,
    equipmentMarkup: D57,
    installMarkup: D58,
    markupTotal: D59,
    priceNoExtras: D60,
    contingency: D62,
    fxRisk: D63,
    otherTotal: D64,
    groundingTotal: D65,
    brokerTotal: D66,
    warrantyCost: D67,
    freeServiceCost: D68,
    extrasTotal: D69,
    priceNoVat: D71,
    vat: D72,
    priceWithVat: D73,
    guaranteeBase: D75,
    guaranteeFee: D76,
    finalContractPrice: D77,
    totalMarginPct: D78,
    checkDiff: Math.round((totals.finalPrice - D77) * 100) / 100,
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
