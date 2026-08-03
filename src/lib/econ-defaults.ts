import type { AppState, Unit, InstallTariffs, EquipmentCategory, ProfitThreshold, PaymentScenario } from "./econ-types";

const mkUnit = (id: string, floors = 19): Unit => ({
  id,
  category: "lift",
  capacity: 1600,
  floors,
  currency: "USD",
  brand: "FUJI HITECH",
  model: "MR",
  country: "China",
  kind: "Passenger",
  type: "ელექტრული",
  delivery: "EXW",
  mrType: "MRL",
  specDate: "2026-06-15",
  variant: 1,
  productionWeeks: 8,
  transportWeeks: 13,
  reserveWeeks: 1,
  installWeeks: 9,
  factoryPrice: 18180,
  materials: 100,
  scaffolding: 0,
  otherCost: 0,
  grounding: 180,
  brokerCommissionPct: 0,
  mechRateGel: 280,
  elecRateGel: 80,
  equipmentMarkupPct: 0.03,
  installMarkupPct: 0.50,
  contingencyPct: 0.03,
  fxRiskPct: 0.02,
  warrantyPct: 0,
});

export const defaultTariffs: InstallTariffs = {
  capUnder1000: [
    { label: "სართულები ≤ 4 (ჯამური ფასი)", usdNet: 600 },
    { label: "სართულები ≥ 5 (დამატებითი ფასი 1 სართულზე)", usdNet: 150 },
  ],
  capOver1000: [
    { label: "სართულები ≤ 4 (ჯამური ფასი)", usdNet: 800 },
    { label: "სართულები ≥ 5 (დამატებითი ფასი 1 სართულზე)", usdNet: 200 },
  ],
  elec: [
    { label: "სართულები ≤ 4 (ჯამური ფასი)", usdNet: 300 },
    { label: "სართულები ≥ 5 (დამატებითი ფასი 1 სართულზე)", usdNet: 50 },
  ],
  helper: [
    { label: "დამხმარეს ანაზღაურება", usdNet: 20 },
  ],
};

const zeroThreshold: ProfitThreshold = { minAmount: 0, minMarginPct: 0 };
export const defaultProfitThresholds: Record<EquipmentCategory, ProfitThreshold> = {
  lift: { ...zeroThreshold },
  escalator: { ...zeroThreshold },
  travelator: { ...zeroThreshold },
  parking: { ...zeroThreshold },
  platform: { ...zeroThreshold },
};

export const defaultAppState: AppState = {
  project: {
    responsiblePerson: "",
    salesPersonId: "",
    contractDate: "",
    firstTrancheDate: "",
    leadSource: "",
    startDate: "",
    closeDate: "",
    status: "in_progress",
    projectName: "GTB დიდი დიღომი",
    location: "თბილისი",
    buildingType: "საცხოვრებელი კომპლექსი",
    completionYear: 2026,
    units: [mkUnit("L1"), mkUnit("L2")],
    // Parity with the previous per-unit defaults (50 + 4400 + 100 + 350) × 2 units.
    // Distributed back across units in proportion to factoryPrice by the calc engine.
    bankCommissionTotal: 100,
    intTransportTotal: 8800,
    terminalTotal: 200,
    localTransportTotal: 700,
    travel: {
      mechanics:    { headcount: 2, days: 30, trips: 1, accommodationMode: "hotel", houseRentTotal: 0 },
      electricians: { headcount: 2, days: 10, trips: 1, accommodationMode: "hotel", houseRentTotal: 0 },
      admin:        { headcount: 1, days: 10, trips: 4, accommodationMode: "hotel", houseRentTotal: 0 },
      distanceKm: 400,
      fuelConsumption: 10,
      workDays: "ორშაბათი – პარასკევი",
    },
  },
  finance: {
    rateDate: "2026-06-15",
    usdRate: 2.6577,
    eurRate: 3.0768,
    equipmentVatRate: 0.18,
    otherVatRate: 0.18,
    incomeTaxRate: 0.20,
    pensionRate: 0.04,
    mealPerDay: 0,
    hotelMechanics: 0,
    hotelElectricians: 0,
    hotelAdmin: 0,
    fuelPricePerL: 0,
    warrantyYears: 1,
    monthlyServiceUsd: 0,
    freeServiceMonths: 0,
    guaranteeAmountTotal: 0,
    guaranteePct: 0,
    guaranteeDays: 0,
    guaranteeAnnualPct: 0,
  },
  payment: {
    procurementAdvancePct: 0.30,
    scenarioA: {
      name: "სცენარი V1 (25/30/35/10)",
      tranches: [
        { label: "I ტრანში", pct: 0.25 },
        { label: "II ტრანში", pct: 0.30 },
        { label: "III ტრანში", pct: 0.35 },
        { label: "IV ტრანში (ნაშთი)", pct: 0.10 },
      ],
      expenses: [],
    },
    scenarioB: {
      name: "სცენარი V2 (20/30/35/15)",
      tranches: [
        { label: "I ტრანში", pct: 0.20 },
        { label: "II ტრანში", pct: 0.30 },
        { label: "III ტრანში", pct: 0.35 },
        { label: "IV ტრანში (ნაშთი)", pct: 0.15 },
      ],
      expenses: [],
    },
  },
  tariffs: defaultTariffs,
  profitThresholds: defaultProfitThresholds,
  pageVisibility: { input: true, economics: true, payment: true, tariffs: false, analytics: false },
  manualColumns: { finalOffer: {}, factual: {} },
  defaultRates: { equipmentMarkupPct: 0.03, installMarkupPct: 0.50, fxRiskPct: 0.02 },
};

export const emptyUnit = mkUnit;

// ცარიელი დანადგარი — ტექნიკური სტრუქტურა შენარჩუნებულია (id, კატეგორიები),
// მაგრამ ყველა ფინანსური/რაოდენობრივი ველი ნულოვანია.
const blankUnit = (id: string): Unit => ({
  id,
  category: "lift",
  capacity: 0,
  floors: 0,
  currency: "USD",
  brand: "",
  model: "",
  country: "",
  kind: "",
  type: "",
  delivery: "",
  mrType: "",
  specDate: new Date().toISOString().slice(0, 10),
  variant: 1,
  productionWeeks: 0,
  transportWeeks: 0,
  reserveWeeks: 0,
  installWeeks: 0,
  factoryPrice: 0,
  materials: 0,
  scaffolding: 0,
  otherCost: 0,
  grounding: 0,
  brokerCommissionPct: 0,
  mechRateGel: 0,
  elecRateGel: 0,
  equipmentMarkupPct: 0,
  installMarkupPct: 0,
  contingencyPct: 0,
  fxRiskPct: 0,
  warrantyPct: 0,
});

// ძველი შენახული სცენარები იყენებდნენ ფიქსირებულ tranche1/2/3 ველებს — ახალი
// სქემა მოქნილი მასივია. ძველ ფორმატს ვცნობთ tranches ველის არარსებობით და
// ვაკონვერტირებთ, რომ ძველი პროექტები არ დაზიანდეს.
function normalizeScenario(loaded: any, fallback: PaymentScenario): PaymentScenario {
  if (!loaded) return JSON.parse(JSON.stringify(fallback));
  if (Array.isArray(loaded.tranches)) {
    return {
      name: loaded.name ?? fallback.name,
      tranches: loaded.tranches,
      expenses: Array.isArray(loaded.expenses) ? loaded.expenses : [],
    };
  }
  // ძველი ფორმატი: tranche1/2/3 + ნაგულისხმევი IV (ნაშთი)
  if (typeof loaded.tranche1 === "number") {
    const t4 = 1 - loaded.tranche1 - loaded.tranche2 - loaded.tranche3;
    return {
      name: loaded.name ?? fallback.name,
      tranches: [
        { label: "I ტრანში", pct: loaded.tranche1 },
        { label: "II ტრანში", pct: loaded.tranche2 },
        { label: "III ტრანში", pct: loaded.tranche3 },
        { label: "IV ტრანში (ნაშთი)", pct: t4 },
      ],
      expenses: [],
    };
  }
  return JSON.parse(JSON.stringify(fallback));
}

// ძველი შენახული/არქივირებული მდგომარეობები შესაძლოა მოკლებული იყვნენ ახლახან
// დამატებულ ველებს (category, tariffs, profitThresholds) — ამ ფუნქციით ნებისმიერი
// ნაწილობრივი AppState ივსება ნაგულისხმევი მნიშვნელობებით, უსაფრთხოდ.
export function normalizeAppState(loaded: Partial<AppState>): AppState {
  const loadedProject = loaded.project ?? defaultAppState.project;
  const units = (loadedProject.units ?? defaultAppState.project.units).map((u: Unit) => ({
    ...u,
    category: u.category ?? "lift",
    scaffolding: u.scaffolding ?? 0,
  }));
  const loadedPayment: any = loaded.payment ?? {};
  const loadedFinance: any = loaded.finance ?? {};
  // ძველ პროექტებს ჰქონდათ ერთიანი vatRate — თუ ახალი გაყოფილი ველები არ
  // არსებობს, ორივეს ძველი მნიშვნელობა ენიჭება (გამოთვლა უცვლელი რჩება).
  const financeMigrated = { ...loadedFinance };
  if (financeMigrated.equipmentVatRate === undefined && typeof financeMigrated.vatRate === "number") {
    financeMigrated.equipmentVatRate = financeMigrated.vatRate;
  }
  if (financeMigrated.otherVatRate === undefined && typeof financeMigrated.vatRate === "number") {
    financeMigrated.otherVatRate = financeMigrated.vatRate;
  }
  return {
    project: { ...defaultAppState.project, ...loadedProject, units },
    finance: { ...defaultAppState.finance, ...financeMigrated },
    payment: {
      procurementAdvancePct: loadedPayment.procurementAdvancePct ?? defaultAppState.payment.procurementAdvancePct,
      scenarioA: normalizeScenario(loadedPayment.scenarioA, defaultAppState.payment.scenarioA),
      scenarioB: normalizeScenario(loadedPayment.scenarioB, defaultAppState.payment.scenarioB),
    },
    tariffs: { ...defaultAppState.tariffs, ...(loaded.tariffs ?? {}) },
    profitThresholds: { ...defaultAppState.profitThresholds, ...(loaded.profitThresholds ?? {}) },
    pageVisibility: { ...defaultAppState.pageVisibility, ...(loaded.pageVisibility ?? {}) },
    manualColumns: {
      finalOffer: { ...((loaded.manualColumns as any)?.finalOffer ?? {}) },
      factual: { ...((loaded.manualColumns as any)?.factual ?? {}) },
    },
    defaultRates: { ...defaultAppState.defaultRates, ...((loaded as any).defaultRates ?? {}) },
  };
}

// ახალი, სუფთა (ნულოვანი) პროექტი — "დასრულება და შენახვა" შემდეგ ამით
// იწყება მუშაობა, ძველი პროექტის სანიმუშო მონაცემების ნაცვლად.
// ფინანსური მუდმივები (კურსი, დღგ, გადასახადები, გადახდის სცენარები) —
// ესენი პროექტისგან დამოუკიდებელი წესებია და მუშა მნიშვნელობებით რჩება.
export function blankAppState(): AppState {
  return {
    project: {
      responsiblePerson: "",
      salesPersonId: "",
      contractDate: "",
      firstTrancheDate: "",
      leadSource: "",
      startDate: "",
      closeDate: "",
      status: "in_progress",
      projectName: "",
      location: "",
      buildingType: "",
      completionYear: new Date().getFullYear(),
      units: [blankUnit("L1"), blankUnit("L2")],
      bankCommissionTotal: 0,
      intTransportTotal: 0,
      terminalTotal: 0,
      localTransportTotal: 0,
      travel: {
        mechanics:    { headcount: 0, days: 0, trips: 0, accommodationMode: "hotel", houseRentTotal: 0 },
        electricians: { headcount: 0, days: 0, trips: 0, accommodationMode: "hotel", houseRentTotal: 0 },
        admin:        { headcount: 0, days: 0, trips: 0, accommodationMode: "hotel", houseRentTotal: 0 },
        distanceKm: 0,
        fuelConsumption: 0,
        workDays: "",
      },
    },
    finance: { ...defaultAppState.finance, rateDate: new Date().toISOString().slice(0, 10) },
    payment: {
      procurementAdvancePct: defaultAppState.payment.procurementAdvancePct,
      scenarioA: JSON.parse(JSON.stringify(defaultAppState.payment.scenarioA)),
      scenarioB: JSON.parse(JSON.stringify(defaultAppState.payment.scenarioB)),
    },
    tariffs: JSON.parse(JSON.stringify(defaultAppState.tariffs)),
    profitThresholds: JSON.parse(JSON.stringify(defaultAppState.profitThresholds)),
    pageVisibility: { ...defaultAppState.pageVisibility },
    manualColumns: { finalOffer: {}, factual: {} },
    defaultRates: { ...defaultAppState.defaultRates },
  };
}
