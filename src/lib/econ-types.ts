// Types matching the Excel template "განფასება_შაბლონი_GT_v3.xlsx"

export interface Unit {
  id: string;           // e.g. "L1"
  capacity: number;     // ტვირთამწეობა, kg
  floors: number;       // სართულების რაოდენობა
  currency: "USD" | "EUR" | "GEL";
  brand: string;
  model: string;
  country: string;
  kind: string;         // Passenger / Cargo / ...
  type: string;         // ელექტრული / ჰიდრავლიკური
  delivery: string;     // EXW / CIF / ...
  mrType: string;       // MR / MRL
  specDate: string;     // YYYY-MM-DD
  variant: number;
  productionWeeks: number;
  transportWeeks: number;
  reserveWeeks: number;
  installWeeks: number;

  // Financial (per-unit direct costs, USD)
  factoryPrice: number;      // ქარხნული ფასი
  bankCommission: number;    // საბანკო საკომისიო
  intTransport: number;      // საერთაშ. ტრანსპ.
  terminal: number;          // ტერმინალის მომსახურება
  localTransport: number;    // ადგ. ტრანსპ. და დაცლა
  materials: number;         // მასალები
  otherCost: number;         // სხვა ხარჯი
  grounding: number;         // დამიწება/ზედამხედვ.
  brokerCommission: number;  // საშუამავლო საკომისიო
}

export interface TravelGroup {
  headcount: number;
  days: number;
  trips: number;             // ობიექტზე ჩასვლების რაოდენობა
  hotelTotal: number;        // სასტუმროს ჯამური ღირებულება (₾)
}

export interface ProjectData {
  projectName: string;
  location: string;
  buildingType: string;
  completionYear: number;
  units: Unit[];
  travel: {
    mechanics: TravelGroup;
    electricians: TravelGroup;
    admin: TravelGroup;
    distanceKm: number;      // one-way distance
    fuelConsumption: number; // L/100km
    workDays: string;
  };
}

export interface FinancialAssumptions {
  // FX
  rateDate: string;
  usdRate: number;   // 1 USD = ? GEL
  eurRate: number;   // 1 EUR = ? GEL
  // Tax
  vatRate: number;       // 0.18
  incomeTaxRate: number; // 0.20 (საშემოსავლო)
  pensionRate: number;   // 0.04 (საპენსიო)
  // Travel per-diem rates (GEL)
  mealPerDay: number;
  hotelMechanics: number;   // reserved
  hotelElectricians: number;
  hotelAdmin: number;
  fuelPricePerL: number;
  // Labor (GEL/floor, net take-home)
  mechRateGel: number;   // 280
  elecRateGel: number;   // 80
  // Margins & risk
  equipmentMarkupPct: number; // 0.03
  installMarkupPct: number;   // 0.50
  contingencyPct: number;     // 0.03
  fxRiskPct: number;          // 0.02
  // Warranty & service
  warrantyYears: number;
  warrantyPct: number;        // % of factory price
  monthlyServiceUsd: number;
  freeServiceMonths: number;
  // Bank guarantee
  guaranteePct: number;       // % of full amount
  guaranteeDays: number;
  guaranteeAnnualPct: number; // yearly commission %
}

export interface PaymentScenario {
  name: string;
  tranche1: number; // fraction
  tranche2: number;
  tranche3: number;
  // tranche4 = 1 - sum
}

export interface PaymentSchedule {
  procurementAdvancePct: number; // fraction (e.g. 0.30)
  scenarioA: PaymentScenario;
  scenarioB: PaymentScenario;
}

export interface AppState {
  project: ProjectData;
  finance: FinancialAssumptions;
  payment: PaymentSchedule;
}
