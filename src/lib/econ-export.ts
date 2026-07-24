// Export the current state + computed economics to an Excel file
// mirroring the original template structure.
//
// Note: the free/community "xlsx" (SheetJS) package used here can write
// per-cell NUMBER FORMATS (currency, percent, thousands separators) and
// column widths, but it cannot write fonts/fills/borders/bold — that requires
// the paid "xlsx" Pro build. So this export is now fully formatted
// (currency/percent, readable column widths, frozen header) but not
// colored/bolded.

import * as XLSX from "xlsx";
import type { AppState } from "./econ-types";
import { PROJECT_STATUS_LABEL } from "./econ-types";
import { computeEconomics, allocateProjectCosts } from "./econ-calc";

const FMT_USD = '"$"#,##0.00';
const FMT_GEL = '"₾"#,##0.00';
const FMT_PCT = "0.00%";
const FMT_NUM = "#,##0";
const FMT_RATE = "0.0000";

// Applies a display format to a numeric column range. aoa_to_sheet only
// accepts raw values (not styled cell objects), so formatting is a
// post-processing pass over the already-built sheet, addressed by exact
// row range — every range below is computed from the actual push() calls,
// never guessed, so it can't drift out of sync with the data.
function fmtCol(ws: XLSX.WorkSheet, col: number, rowStart: number, rowEnd: number, fmt: string) {
  for (let r = rowStart; r <= rowEnd; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: col });
    const cell = ws[ref];
    if (cell && typeof cell.v === "number") cell.z = fmt;
  }
}
function setWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((wch) => ({ wch }));
}
function freezeHeader(ws: XLSX.WorkSheet, row: number) {
  ws["!freeze"] = { xSplit: 0, ySplit: row };
  (ws as any)["!sheetView"] = [{ pane: { ySplit: row, topLeftCell: `A${row + 1}`, state: "frozen" } }];
}

export function exportToXlsx(state: AppState) {
  const eco = computeEconomics(state);
  const alloc = allocateProjectCosts(state);
  const wb = XLSX.utils.book_new();
  const p = state.project;
  const f = state.finance;

  // ---------- Sheet 1: Project data ----------
  const s1: any[][] = [];
  s1.push([`${p.projectName} — პროექტის მონაცემები`]);
  s1.push([]);
  s1.push(["0. შიდა ინფო"]);
  s1.push(["მომუშავე პირი", p.responsiblePerson]);
  s1.push(["საიდან მოვიდა პროექტი", p.leadSource]);
  s1.push(["დაწყების თარიღი", p.startDate]);
  s1.push(["დახურვის თარიღი", p.closeDate]);
  s1.push(["სტატუსი", PROJECT_STATUS_LABEL[p.status]]);
  s1.push([]);
  s1.push(["1. ზოგადი ინფორმაცია"]);
  s1.push(["პროექტის დასახელება", p.projectName]);
  s1.push(["მონტაჟის ადგილმდებარეობა", p.location]);
  s1.push(["ნაგებობის ტიპი", p.buildingType]);
  const yearRow1 = s1.length; s1.push(["ჩაბარების წელი", p.completionYear]);
  const countRow1 = s1.length; s1.push(["დანადგარების რაოდენობა", p.units.length]);
  s1.push([]);
  s1.push(["2. დანადგარები"]);
  s1.push(["#", "ტვირთ.(კგ)", "სართ.", "ვალუტა", "ბრენდი", "მოდელი", "ქვეყანა", "სახეობა", "ტიპი", "მიწოდება", "MR/MRL", "სპეც.თარიღი"]);
  const unitsRowStart1 = s1.length;
  p.units.forEach((u) => s1.push([u.id, u.capacity, u.floors, u.currency, u.brand, u.model, u.country, u.kind, u.type, u.delivery, u.mrType, u.specDate]));
  const unitsRowEnd1 = s1.length - 1;
  s1.push([]);
  s1.push(["3. მივლინება"]);
  s1.push(["ჯგუფი", "კაცი", "დღეები", "ჩასვლები"]);
  const travelRowStart1 = s1.length;
  s1.push(["მექანიკოსები", p.travel.mechanics.headcount, p.travel.mechanics.days, p.travel.mechanics.trips]);
  s1.push(["ელექტრიკოსები", p.travel.electricians.headcount, p.travel.electricians.days, p.travel.electricians.trips]);
  s1.push(["ადმინისტრაცია", p.travel.admin.headcount, p.travel.admin.days, p.travel.admin.trips]);
  const travelRowEnd1 = s1.length - 1;
  const distRow1 = s1.length; s1.push(["მანძილი, კმ", p.travel.distanceKm]);
  const fuelRow1 = s1.length; s1.push(["საწვავი, ლ/100კმ", p.travel.fuelConsumption]);

  const ws1 = XLSX.utils.aoa_to_sheet(s1);
  setWidths(ws1, [26, 16, 22, 10, 14, 14, 12, 12, 12, 12, 10, 14]);
  fmtCol(ws1, 1, countRow1, countRow1, FMT_NUM);
  fmtCol(ws1, 1, unitsRowStart1, unitsRowEnd1, FMT_NUM); // capacity
  fmtCol(ws1, 2, unitsRowStart1, unitsRowEnd1, FMT_NUM); // floors
  fmtCol(ws1, 1, travelRowStart1, travelRowEnd1, FMT_NUM);
  fmtCol(ws1, 2, travelRowStart1, travelRowEnd1, FMT_NUM);
  fmtCol(ws1, 3, travelRowStart1, travelRowEnd1, FMT_NUM);
  fmtCol(ws1, 1, distRow1, fuelRow1, FMT_NUM);
  freezeHeader(ws1, 1);
  XLSX.utils.book_append_sheet(wb, ws1, "პროექტის მონაცემები");

  // ---------- Sheet 2: Financial assumptions ----------
  const s2: any[][] = [];
  s2.push(["ფინანსური დაშვებები"]);
  s2.push([]);
  const rateRowStart2 = s2.length;
  s2.push(["USD → GEL", f.usdRate]);
  s2.push(["EUR → GEL", f.eurRate]);
  const rateRowEnd2 = s2.length - 1;
  s2.push(["თარიღი", f.rateDate]);
  s2.push([]);
  const pctRowStart2 = s2.length;
  s2.push(["დანადგარის დღგ", f.equipmentVatRate]);
  s2.push(["დღგ (გარდა დანადგარისა)", f.otherVatRate]);
  s2.push(["საშემოსავლო", f.incomeTaxRate]);
  s2.push(["საპენსიო", f.pensionRate]);
  const pctRowEnd2 = s2.length - 1;
  s2.push([]);
  const perDiemRowStart2 = s2.length;
  s2.push(["კვება/დღე", f.mealPerDay]);
  s2.push(["საწვავი ₾/ლ", f.fuelPricePerL]);
  s2.push(["სასტუმროს დღიური ტარიფი-მექანიკოსები", f.hotelMechanics]);
  s2.push(["სასტუმროს დღიური ტარიფი-ელექტრიკოსები", f.hotelElectricians]);
  s2.push(["სასტუმროს დღიური ტარიფი-ადმინი", f.hotelAdmin]);
  const perDiemRowEnd2 = s2.length - 1;
  s2.push([]);
  const totalsRowStart2 = s2.length;
  s2.push(["საბანკო საკომისიო — პროექტის ჯამი", p.bankCommissionTotal]);
  s2.push(["საერთაშ. ტრანსპ. — პროექტის ჯამი", p.intTransportTotal]);
  s2.push(["ტერმინალი — პროექტის ჯამი", p.terminalTotal]);
  s2.push(["ადგ. ტრანსპ. — პროექტის ჯამი", p.localTransportTotal]);
  const totalsRowEnd2 = s2.length - 1;
  s2.push([]);
  s2.push(["გარანტიის %", "დანადგარის მიხედვით"]);
  const monthlyServiceRow2 = s2.length; s2.push(["თვიური სერვისი USD", f.monthlyServiceUsd]);
  s2.push(["უფასო სერვისი, თვე", f.freeServiceMonths]);
  const guaranteeAmountRow2 = s2.length; s2.push(["გარანტიის თანხა, ჯამურად USD", f.guaranteeAmountTotal]);
  s2.push([]);
  const guarPctRow2 = s2.length; s2.push(["საბანკო გარანტიის %", f.guaranteePct]);
  s2.push(["დღეები", f.guaranteeDays]);
  const guarAnnualRow2 = s2.length; s2.push(["წლიური საკომ. %", f.guaranteeAnnualPct]);
  s2.push([]);
  s2.push(["დანადგარების ხარჯები (USD)"]);
  s2.push(["#", "ქარხნული", "საბანკო (გადანაწ.)", "საერთ.ტრანსპ.(გადანაწ.)", "ტერმინალი(გადანაწ.)", "ადგ.ტრანსპ.(გადანაწ.)", "მასალები", "ხარაჩო", "სხვა", "დამიწება", "საშუამავლო %", "მონტ.₾/სართ", "ელ.მონტ.₾/სართ", "დანადგ.ფასნამატი%", "მონტ.ფასნამატი%", "გაუთვ.%", "FXრისკი%", "გარანტია%"]);
  const unitsRowStart2 = s2.length;
  p.units.forEach((u) => s2.push([
    u.id, u.factoryPrice,
    alloc.bank.get(u.id) ?? 0, alloc.intTransport.get(u.id) ?? 0, alloc.terminal.get(u.id) ?? 0, alloc.localTransport.get(u.id) ?? 0,
    u.materials, u.scaffolding, u.otherCost, u.grounding, u.brokerCommissionPct,
    u.mechRateGel, u.elecRateGel, u.equipmentMarkupPct, u.installMarkupPct, u.contingencyPct, u.fxRiskPct, u.warrantyPct,
  ]));
  const unitsRowEnd2 = s2.length - 1;

  const ws2 = XLSX.utils.aoa_to_sheet(s2);
  setWidths(ws2, [40, 14, 16, 18, 16, 16, 12, 12, 10, 12, 14, 12, 14, 16, 16, 12, 12, 12]);
  fmtCol(ws2, 1, rateRowStart2, rateRowEnd2, FMT_RATE); // USD/EUR → GEL
  fmtCol(ws2, 1, pctRowStart2, pctRowEnd2, FMT_PCT);     // VAT / income tax / pension
  fmtCol(ws2, 1, perDiemRowStart2, perDiemRowEnd2, FMT_GEL);
  fmtCol(ws2, 1, totalsRowStart2, totalsRowEnd2, FMT_USD); // project-level purchase totals
  fmtCol(ws2, 1, monthlyServiceRow2, monthlyServiceRow2, FMT_USD);
  fmtCol(ws2, 1, guaranteeAmountRow2, guaranteeAmountRow2, FMT_USD);
  fmtCol(ws2, 1, guarPctRow2, guarPctRow2, FMT_PCT);
  fmtCol(ws2, 1, guarAnnualRow2, guarAnnualRow2, FMT_PCT);
  fmtCol(ws2, 1, unitsRowStart2, unitsRowEnd2, FMT_USD);  // factory price
  for (let c = 2; c <= 6; c++) fmtCol(ws2, c, unitsRowStart2, unitsRowEnd2, FMT_USD);  // allocated purchase costs, materials, scaffolding
  for (let c = 7; c <= 9; c++) fmtCol(ws2, c, unitsRowStart2, unitsRowEnd2, FMT_USD);  // other/grounding
  fmtCol(ws2, 10, unitsRowStart2, unitsRowEnd2, FMT_PCT);  // broker commission %
  fmtCol(ws2, 11, unitsRowStart2, unitsRowEnd2, FMT_GEL); // mech ₾/floor
  fmtCol(ws2, 12, unitsRowStart2, unitsRowEnd2, FMT_GEL); // elec ₾/floor
  for (let c = 13; c <= 17; c++) fmtCol(ws2, c, unitsRowStart2, unitsRowEnd2, FMT_PCT); // markup/contingency/fx/warranty %
  freezeHeader(ws2, 1);
  XLSX.utils.book_append_sheet(wb, ws2, "ფინანსური დაშვებები");

  // ---------- Sheet 3: Economics ----------
  const s3: any[][] = [];
  s3.push(["ეკონომიკა"]);
  s3.push([]);
  s3.push(["#", "სართ.", "შესყ.თვითღ.", "მონტ.თვითღ.", "სულ თვითღ.", "ფასნამატი", "ფასი დამ.გარეშე", "დამატ.ხარჯ.", "ფასი დღგ-ს გარეშე", "დღგ", "საბ.გარანტია", "საბოლოო ფასი", "მარჟა %", "წილი %"]);
  const unitsRowStart3 = s3.length;
  eco.units.forEach((r) => s3.push([r.id, r.floors, r.purchaseCost, r.installCost, r.totalCost, r.markup, r.priceNoExtras, r.extras, r.priceNoVat, r.vat, r.bankGuarantee, r.finalPrice, r.marginPct, r.projectShare]));
  const unitsRowEnd3 = s3.length - 1;
  const totalRow3 = s3.length;
  s3.push(["სულ", "", eco.totals.purchaseCost, eco.totals.installCost, eco.totals.totalCost, eco.totals.markup, eco.totals.priceNoExtras, eco.totals.extras, eco.totals.priceNoVat, eco.totals.vat, eco.totals.bankGuarantee, eco.totals.finalPrice, eco.totals.marginPct, 1]);
  s3.push([]);
  s3.push(["დეტალური ანგარიში"]);
  const detailRowStart3 = s3.length;
  s3.push(["ქარხნული ჯამი", eco.report.factoryTotal]);
  s3.push(["საბანკო საკომისიო ჯამი", eco.report.bankCommTotal]);
  s3.push(["საერთ. ტრანსპ. ჯამი", eco.report.intTransportTotal]);
  s3.push(["ტერმინალი ჯამი", eco.report.terminalTotal]);
  s3.push(["ადგ. ტრანსპ. ჯამი", eco.report.localTransportTotal]);
  s3.push(["შესყიდვის თვითღ.", eco.report.purchaseTotal]);
  s3.push(["მონტაჟი (payroll)", eco.report.mechPayroll]);
  s3.push(["ელექტრომონტ. (payroll)", eco.report.elecPayroll]);
  s3.push(["მივლინება (USD)", eco.report.travelTotal]);
  s3.push(["მასალები", eco.report.materialsTotal]);
  s3.push(["მონტ. თვითღ.", eco.report.installTotal]);
  s3.push(["სულ თვითღ.", eco.report.costTotal]);
  s3.push(["ფასნამატი", eco.report.markupTotal]);
  s3.push(["ფასი დღგ-ს გარეშე", eco.report.priceNoVat]);
  s3.push(["დღგ", eco.report.vat]);
  s3.push(["ფასი დღგ-ით", eco.report.priceWithVat]);
  s3.push(["საბანკო გარანტიის საკომისიო", eco.report.guaranteeFee]);
  s3.push(["საბოლოო კონტრაქტის ფასი", eco.report.finalContractPrice]);
  const detailRowEnd3 = s3.length - 1;
  const marginRow3 = s3.length;
  s3.push(["ჯამური მარჟა %", eco.report.totalMarginPct]);
  const checkRow3 = s3.length;
  s3.push(["შემოწმება (უნდა იყოს ≈0)", eco.report.checkDiff]);

  const ws3 = XLSX.utils.aoa_to_sheet(s3);
  setWidths(ws3, [28, 10, 14, 14, 14, 14, 16, 14, 16, 14, 14, 16, 10, 10]);
  fmtCol(ws3, 1, unitsRowStart3, unitsRowEnd3, FMT_NUM); // floors
  for (let c = 2; c <= 11; c++) fmtCol(ws3, c, unitsRowStart3, totalRow3, FMT_USD); // all $ columns incl. total row
  fmtCol(ws3, 12, unitsRowStart3, totalRow3, FMT_PCT); // margin %
  fmtCol(ws3, 13, unitsRowStart3, totalRow3, FMT_PCT); // share %
  fmtCol(ws3, 1, detailRowStart3, detailRowEnd3, FMT_USD); // detailed report $ column
  fmtCol(ws3, 1, marginRow3, marginRow3, FMT_PCT);         // total margin %
  fmtCol(ws3, 1, checkRow3, checkRow3, FMT_USD);           // check diff $
  freezeHeader(ws3, 2);
  XLSX.utils.book_append_sheet(wb, ws3, "ეკონომიკა");

  // ---------- Sheet 4: Payment schedule ----------
  const s4: any[][] = [];
  s4.push(["გადახდის გრაფიკი"]);
  s4.push([]);
  const priceRow4 = s4.length; s4.push(["სრული საკონტრაქტო ფასი", eco.totals.finalPrice]);
  const advRow4 = s4.length; s4.push(["მომწოდებლისთვის ავანსი %", state.payment.procurementAdvancePct]);
  s4.push([]);

  const pushScenario = (label: string, rep: typeof eco.scenarioA) => {
    s4.push([label]);
    s4.push(["ტრანში", "%", "თანხა"]);
    const trStart = s4.length;
    rep.tranches.forEach((t) => s4.push([t.label, t.pct, t.amount]));
    const trEnd = s4.length - 1;
    s4.push([]);
    s4.push(["ფულადი ნაკადი", "თანხა", "ნაშთი"]);
    const evStart = s4.length;
    rep.events.forEach((e) => s4.push([e.label, e.amount, e.balance]));
    const evEnd = s4.length - 1;
    const finalRow = s4.length;
    s4.push(["საბოლოო ნაშთი", "", rep.finalBalance]);
    return { trStart, trEnd, evStart, evEnd, finalRow };
  };
  const rangesA = pushScenario(state.payment.scenarioA.name, eco.scenarioA);

  const ws4 = XLSX.utils.aoa_to_sheet(s4);
  setWidths(ws4, [30, 16, 16]);
  fmtCol(ws4, 1, priceRow4, priceRow4, FMT_USD);
  fmtCol(ws4, 1, advRow4, advRow4, FMT_PCT);
  [rangesA].forEach((r) => {
    fmtCol(ws4, 1, r.trStart, r.trEnd, FMT_PCT);  // tranche %
    fmtCol(ws4, 2, r.trStart, r.trEnd, FMT_USD);  // tranche amount
    fmtCol(ws4, 1, r.evStart, r.finalRow, FMT_USD); // cashflow amount
    fmtCol(ws4, 2, r.evStart, r.finalRow, FMT_USD); // cashflow balance
  });
  freezeHeader(ws4, 1);
  XLSX.utils.book_append_sheet(wb, ws4, "გადახდის გრაფიკი");

  XLSX.writeFile(wb, `${p.projectName || "პროექტი"}_განფასება.xlsx`);
}
