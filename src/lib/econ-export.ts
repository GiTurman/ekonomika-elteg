// Export the current state + computed economics to an Excel file
// mirroring the original template structure.

import * as XLSX from "xlsx";
import type { AppState } from "./econ-types";
import { computeEconomics } from "./econ-calc";

export function exportToXlsx(state: AppState) {
  const eco = computeEconomics(state);
  const wb = XLSX.utils.book_new();
  const p = state.project;
  const f = state.finance;

  // Sheet 1: Project data
  const s1: any[][] = [
    [`${p.projectName} — პროექტის მონაცემები`],
    [],
    ["1. ზოგადი ინფორმაცია"],
    ["პროექტის დასახელება", p.projectName],
    ["მონტაჟის ადგილმდებარეობა", p.location],
    ["ნაგებობის ტიპი", p.buildingType],
    ["ჩაბარების წელი", p.completionYear],
    ["დანადგარების რაოდენობა", p.units.length],
    [],
    ["2. დანადგარები"],
    ["#", "ტვირთ.(კგ)", "სართ.", "ვალუტა", "ბრენდი", "მოდელი", "ქვეყანა", "სახეობა", "ტიპი", "მიწოდება", "MR/MRL", "სპეც.თარიღი"],
    ...p.units.map(u => [u.id, u.capacity, u.floors, u.currency, u.brand, u.model, u.country, u.kind, u.type, u.delivery, u.mrType, u.specDate]),
    [],
    ["3. მივლინება"],
    ["ჯგუფი", "კაცი", "დღეები", "ჩასვლები"],
    ["მექანიკოსები", p.travel.mechanics.headcount, p.travel.mechanics.days, p.travel.mechanics.trips],
    ["ელექტრიკოსები", p.travel.electricians.headcount, p.travel.electricians.days, p.travel.electricians.trips],
    ["ადმინისტრაცია", p.travel.admin.headcount, p.travel.admin.days, p.travel.admin.trips],
    ["მანძილი, კმ", p.travel.distanceKm],
    ["საწვავი, ლ/100კმ", p.travel.fuelConsumption],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1), "პროექტის მონაცემები");

  // Sheet 2: Financial assumptions
  const s2: any[][] = [
    ["ფინანსური დაშვებები"], [],
    ["USD → GEL", f.usdRate], ["EUR → GEL", f.eurRate], ["თარიღი", f.rateDate], [],
    ["დღგ", f.vatRate], ["საშემოსავლო", f.incomeTaxRate], ["საპენსიო", f.pensionRate], [],
    ["კვება/დღე", f.mealPerDay], ["საწვავი ₾/ლ", f.fuelPricePerL],
    ["სასტუმრო-მექანიკოსები", f.hotelMechanics], ["სასტუმრო-ელექტრიკოსები", f.hotelElectricians], ["სასტუმრო-ადმინი", f.hotelAdmin], [],
    ["მონტაჟი ₾/სართული", f.mechRateGel], ["ელექტრომონტაჟი ₾/სართული", f.elecRateGel], [],
    ["დანადგარის ფასნამატი %", f.equipmentMarkupPct], ["მონტაჟის ფასნამატი %", f.installMarkupPct],
    ["გაუთვალისწინებელი %", f.contingencyPct], ["FX რისკი %", f.fxRiskPct], [],
    ["გარანტიის %", f.warrantyPct], ["თვიური სერვისი USD", f.monthlyServiceUsd], ["უფასო სერვისი, თვე", f.freeServiceMonths], [],
    ["საბანკო გარანტიის %", f.guaranteePct], ["დღეები", f.guaranteeDays], ["წლიური საკომ. %", f.guaranteeAnnualPct], [],
    ["დანადგარების ხარჯები (USD)"],
    ["#", "ქარხნული", "საბანკო", "საერთ.ტრანსპ.", "ტერმინალი", "ადგ.ტრანსპ.", "მასალები", "სხვა", "დამიწება", "საშუამავლო"],
    ...p.units.map(u => [u.id, u.factoryPrice, u.bankCommission, u.intTransport, u.terminal, u.localTransport, u.materials, u.otherCost, u.grounding, u.brokerCommission]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s2), "ფინანსური დაშვებები");

  // Sheet 3: Economics
  const s3: any[][] = [
    ["ეკონომიკა"], [],
    ["#", "სართ.", "შესყ.თვითღ.", "მონტ.თვითღ.", "სულ თვითღ.", "ფასნამატი", "ფასი დამ.გარეშე", "დამატ.ხარჯ.", "ფასი დღგ-ს გარეშე", "დღგ", "საბ.გარანტია", "საბოლოო ფასი", "მარჟა %", "წილი %"],
    ...eco.units.map(r => [r.id, r.floors, r.purchaseCost, r.installCost, r.totalCost, r.markup, r.priceNoExtras, r.extras, r.priceNoVat, r.vat, r.bankGuarantee, r.finalPrice, r.marginPct, r.projectShare]),
    ["სულ", "", eco.totals.purchaseCost, eco.totals.installCost, eco.totals.totalCost, eco.totals.markup, eco.totals.priceNoExtras, eco.totals.extras, eco.totals.priceNoVat, eco.totals.vat, eco.totals.bankGuarantee, eco.totals.finalPrice, eco.totals.marginPct, 1],
    [],
    ["დეტალური ანგარიში"],
    ["ქარხნული ჯამი", eco.report.factoryTotal],
    ["საბანკო საკომისიო ჯამი", eco.report.bankCommTotal],
    ["საერთ. ტრანსპ. ჯამი", eco.report.intTransportTotal],
    ["ტერმინალი ჯამი", eco.report.terminalTotal],
    ["ადგ. ტრანსპ. ჯამი", eco.report.localTransportTotal],
    ["შესყიდვის თვითღ.", eco.report.purchaseTotal],
    ["მონტაჟი (payroll)", eco.report.mechPayroll],
    ["ელექტრომონტ. (payroll)", eco.report.elecPayroll],
    ["მივლინება (USD)", eco.report.travelTotal],
    ["მასალები", eco.report.materialsTotal],
    ["მონტ. თვითღ.", eco.report.installTotal],
    ["სულ თვითღ.", eco.report.costTotal],
    ["ფასნამატი", eco.report.markupTotal],
    ["ფასი დღგ-ს გარეშე", eco.report.priceNoVat],
    ["დღგ", eco.report.vat],
    ["ფასი დღგ-ით", eco.report.priceWithVat],
    ["საბანკო გარანტიის საკომისიო", eco.report.guaranteeFee],
    ["საბოლოო კონტრაქტის ფასი", eco.report.finalContractPrice],
    ["ჯამური მარჟა %", eco.report.totalMarginPct],
    ["შემოწმება (უნდა იყოს ≈0)", eco.report.checkDiff],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s3), "ეკონომიკა");

  // Sheet 4: Payment schedule
  const buildScSheet = (label: string, rep: typeof eco.scenarioA): any[][] => [
    [label],
    ["ტრანში", "%", "თანხა"],
    ...rep.tranches.map(t => [t.label, t.pct, t.amount]),
    [],
    ["ფულადი ნაკადი", "თანხა", "ნაშთი"],
    ...rep.events.map(e => [e.label, e.amount, e.balance]),
    ["საბოლოო ნაშთი", "", rep.finalBalance],
  ];
  const s4 = [
    ["გადახდის გრაფიკი"], [],
    ["სრული საკონტრაქტო ფასი", eco.totals.finalPrice],
    ["მომწოდებლისთვის ავანსი %", state.payment.procurementAdvancePct],
    [],
    ...buildScSheet(state.payment.scenarioA.name, eco.scenarioA),
    [],
    ...buildScSheet(state.payment.scenarioB.name, eco.scenarioB),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s4), "გადახდის გრაფიკი");

  XLSX.writeFile(wb, `${p.projectName || "პროექტი"}_განფასება.xlsx`);
}
