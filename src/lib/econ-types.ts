// Types matching the Excel template "განფასება_შაბლონი_GT_v3.xlsx"

export type EquipmentCategory = "lift" | "escalator" | "travelator" | "parking" | "platform";

export const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  lift: "ლიფტი",
  escalator: "ესკალატორი",
  travelator: "ტრაველატორი",
  parking: "საპარკინგე სისტემა",
  platform: "შშმ პლატფორმა",
};

// კატეგორია → ID-ის პრეფიქსი. კატეგორიის შეცვლისას დანადგარის ID ავტომატურად
// ერგება ამ კონვენციას (მაგ. ესკალატორი → E1, E2...).
export const EQUIPMENT_CATEGORY_PREFIX: Record<EquipmentCategory, string> = {
  lift: "L",
  escalator: "E",
  travelator: "T",
  parking: "PK",
  platform: "PL",
};

export interface Unit {
  id: string;           // e.g. "L1"
  category: EquipmentCategory; // მინიმალური მოგების ზღვრების დასათვლელად
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
  materials: number;         // მასალები
  scaffolding: number;       // ხარაჩო
  otherCost: number;         // სხვა ხარჯი
  grounding: number;         // დამიწება/ზედამხედვ.
  brokerCommissionPct: number; // საშუამავლო საკომისიო, % — ემატება საბოლოო ფასს (დღგ+გარანტიის შემდეგ)

  // Labor rates (₾/floor, net take-home) — per unit
  mechRateGel: number;
  elecRateGel: number;

  // Margin & risk parameters — per unit
  equipmentMarkupPct: number;
  installMarkupPct: number;
  contingencyPct: number;
  fxRiskPct: number;
  warrantyPct: number;       // % of factory price
}

export interface TravelGroup {
  headcount: number;
  days: number;
  trips: number;                          // ობიექტზე ჩასვლების რაოდენობა
  accommodationMode: "house" | "hotel";   // "house" = სახლი ქირით (თვის ჯამური ფასი), "hotel" = სასტუმრო (დღიური ტარიფი × დღეები)
  houseRentTotal: number;                 // "house" რეჟიმის თვის ჯამური ღირებულება (₾)
}

export type ProjectStatus = "in_progress" | "won" | "lost" | "stalled";

export interface ProjectData {
  // 0. შიდა ინფო
  responsiblePerson: string;   // მომუშავე პირის სახელი და გვარი
  leadSource: string;          // საიდან მოვიდა პროექტი
  startDate: string;           // მუშაობის დაწყების თარიღი — ავსებს Partner, კორექტირება მხოლოდ Finance-ს შეუძლია
  closeDate: string;           // პროექტის დახურვის თარიღი
  status: ProjectStatus;       // პროექტის სტატუსი
  projectName: string;
  location: string;
  buildingType: string;
  completionYear: number;
  units: Unit[];
  // Purchase-cost items entered once for the whole project (USD) and
  // auto-distributed across active units in proportion to factoryPrice.
  bankCommissionTotal: number;   // საბანკო საკომისიო — ჯამური თანხა
  intTransportTotal: number;     // საერთაშ. ტრანსპ. — ჯამური თანხა
  terminalTotal: number;         // ტერმინალის მომსახურება — ჯამური თანხა
  localTransportTotal: number;   // ადგ. ტრანსპ. და დაცლა — ჯამური თანხა
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
  equipmentVatRate: number; // დანადგარის დღგ — ზოგ შემთხვევაში დანადგარი დღგ-სგან განთავისუფლებულია
  otherVatRate: number;     // დღგ ყველაფერზე, დანადგარის გარდა (მონტაჟი, ფასნამატი, დამატებითი ხარჯები)
  incomeTaxRate: number; // 0.20 (საშემოსავლო)
  pensionRate: number;   // 0.04 (საპენსიო)
  // Travel per-diem rates (GEL)
  mealPerDay: number;
  hotelMechanics: number;   // სასტუმროს დღიური ტარიფი — მექანიკოსები (₾/დღე)
  hotelElectricians: number; // სასტუმროს დღიური ტარიფი — ელექტრიკოსები (₾/დღე)
  hotelAdmin: number;        // სასტუმროს დღიური ტარიფი — ადმინისტრაცია (₾/დღე)
  fuelPricePerL: number;
  // Warranty & service
  warrantyYears: number;
  monthlyServiceUsd: number;
  freeServiceMonths: number;
  guaranteeAmountTotal: number; // გარანტიის ჯამური თანხა (USD) — ერთიანად შეყვანილი, თანაბრად ნაწილდება დანადგარებზე
  // Bank guarantee
  guaranteePct: number;       // % of full amount
  guaranteeDays: number;
  guaranteeAnnualPct: number; // yearly commission %
}

export interface PaymentTranche {
  label: string;
  pct: number; // fraction of contract price — ხელით ივსება
}

export interface PaymentExpenseItem {
  label: string;
  amount: number;        // USD, +/- (ჩვეულებრივ უარყოფითი — გასავალი); თავისუფლად კორექტირებადი
  afterTranche: number;  // ამ ინდექსის ტრანშის მიღების შემდეგ ჩნდება ფულად ნაკადში (0-based); -1 = ყველა ტრანშამდე
}

export interface PaymentScenario {
  name: string;
  tranches: PaymentTranche[];       // რაოდენობა ხელით რეგულირდება (დამატება/წაშლა)
  expenses: PaymentExpenseItem[];   // თავისუფლად რედაქტირებადი გასავლების სია
}

export interface PaymentSchedule {
  procurementAdvancePct: number; // fraction (e.g. 0.30)
  scenarioA: PaymentScenario;
  scenarioB: PaymentScenario;
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  in_progress: "პროცესში",
  won: "მოგებული",
  lost: "წაგებული",
  stalled: "გაჩერებული",
};

export interface TariffRow {
  label: string;
  usdNet: number; // მხოლოდ დოლარი — კორექტირებადი
}
export interface InstallTariffs {
  capUnder1000: TariffRow[]; // ტვირთამწეობა < 1000 კგ
  capOver1000: TariffRow[];  // ტვირთამწეობა ≥ 1000 კგ
  elec: TariffRow[];         // ელექტრომონტაჟი
  helper: TariffRow[];       // დამხმარე პერსონალი
}

export interface ProfitThreshold {
  minAmount: number;    // მინიმალური მოგების თანხა დანადგარზე, USD
  minMarginPct: number; // მინიმალური მოგების მარჟა, fraction (0..1)
}

// Finance-ს კონტროლი — რომელი გვერდები უჩანდეს Partner-საც. ცვლილება მყისიერია,
// კოდის რედაქტირება არ სჭირდება. თუ გვერდი Partner-ისთვის ხილვადია, მას იმავე
// რედაქტირების უფლებაც აქვს, რაც Finance-ს (გამონაკლისია გადახდის გრაფიკის
// ტრანშები/გასავლები, რომლებიც ცალკე, ცალსახად Finance-ის კუთვნილებაა).
export interface PageVisibility {
  input: boolean;     // "შესატანი მონაცემები"
  economics: boolean; // "ეკონომიკა"
  payment: boolean;   // "გადახდის გრაფიკი"
  tariffs: boolean;   // "მონტაჟის ტარიფები"
  analytics: boolean; // "ანალიტიკა"
}

// ეკონომიკის დეტალურ ანგარიშში, გამოთვლილი თანხის გვერდით ხელით შესატანი
// ორი დამატებითი სვეტი. key = ანგარიშის ხაზის დასახელება (label).
// ცარიელი (undefined) მნიშვნელობა ნიშნავს, რომ ხაზზე თანხა შეტანილი არ არის.
export interface ManualColumns {
  finalOffer: Record<string, number>; // საბოლოო შეთავაზება
  factual: Record<string, number>;    // ფაქტი — რეალურად გასული თანხები
}

// "ტარიფები" ტაბზე დაყენებული სტანდარტული (default) განაკვეთები. ახალი
// დანადგარი/პროექტი ამ მნიშვნელობებით იწყება; კონკრეტულ დანადგარზე per-unit
// კორექტირება რჩება ("შესატანი მონაცემები" ტაბზე).
export interface DefaultRates {
  equipmentMarkupPct: number; // დანადგარის ფასნამატი %
  installMarkupPct: number;   // მონტაჟის ფასნამატი %
  fxRiskPct: number;          // საბანკო სავალუტო რისკი %
}

export interface AppState {
  project: ProjectData;
  finance: FinancialAssumptions;
  payment: PaymentSchedule;
  tariffs: InstallTariffs;
  profitThresholds: Record<EquipmentCategory, ProfitThreshold>;
  pageVisibility: PageVisibility;
  manualColumns: ManualColumns;
  defaultRates: DefaultRates;
}
