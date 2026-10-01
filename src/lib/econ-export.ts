// Excel-ის ექსპორტი — სრულად ფორმულებზე აგებული, ფორმატირებული ფაილი.
//
// სტრუქტურა (5 ფურცელი):
//   1. დაშვებები        — ყველა გლობალური/პროექტის პარამეტრი (ლურჯი = შესატანი)
//   2. პროექტი          — ზოგადი ინფო + მივლინების გაანგარიშება (ფორმულები)
//   3. დანადგარები      — დანადგარების შესატანი მონაცემები + ხარჯების გადანაწილება
//   4. ეკონომიკა        — დანადგარების ეკონომიკა, ჯამები, დეტალური ანგარიში, შემოწმება
//   5. გადახდის გრაფიკი — ტრანშები და ფულადი ნაკადი (ნაშთი ფორმულით)
//
// ფორმულები ზუსტად იმეორებს econ-calc.ts-ს (computeEconomics). თითო ფორმულას
// ახლავს აპის მიერ გამოთვლილი შედეგი (cached result), ამიტომ ფაილი გახსნისთანავე
// სწორ რიცხვებს აჩვენებს, ხოლო ნებისმიერი შესატანი უჯრის შეცვლისას Excel ყველაფერს
// თავიდან ითვლის. ფერები: ლურჯი = შესატანი, შავი = ფორმულა, მწვანე = სხვა ფურცლიდან.
// „ეკონომიკა" ფურცლის ბოლოს — შემოწმების ხაზი (დანადგარების ჯამი − ანგარიში ≈ 0).

import type { AppState, Unit, EquipmentCategory } from "./econ-types";
import { PROJECT_STATUS_LABEL, EQUIPMENT_CATEGORY_LABEL } from "./econ-types";
import { computeEconomics, allocateProjectCosts } from "./econ-calc";
import { defaultProfitThresholds } from "./econ-defaults";

type ExcelNS = typeof import("exceljs");
type Worksheet = import("exceljs").Worksheet;
type Cell = import("exceljs").Cell;

// ---------- სტილები ----------
const FMT_USD = '"$"#,##0.00;[Red]-"$"#,##0.00';
const FMT_GEL = '#,##0.00" ₾";[Red]-#,##0.00" ₾"';
const FMT_PCT = "0.00%";
const FMT_NUM = "#,##0";
const FMT_DEC = "#,##0.00";
const FMT_RATE = "0.0000";

const C_INPUT = "FF0000FF";   // ლურჯი — შესატანი
const C_LINK = "FF008000";    // მწვანე — სხვა ფურცლიდან
const C_FORMULA = "FF000000"; // შავი — ფორმულა
const FILL_TITLE = "FF1F3864";
const FILL_SECTION = "FFD9E1F2";
const FILL_HEADER = "FF2F5496";
const FILL_INPUT = "FFFFF2CC";
const FILL_TOTAL = "FFE7E6E6";
const FONT = "Calibri";

const S_ASSUMP = "დაშვებები";
const S_PROJECT = "პროექტი";
const S_UNITS = "დანადგარები";
const S_ECO = "ეკონომიკა";
const S_PAY = "გადახდის გრაფიკი";
const ref = (sheet: string, addr: string) => `'${sheet}'!${addr}`;

const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

function setInput(c: Cell, value: unknown, fmt?: string) {
  c.value = (value ?? "") as any;
  c.font = { name: FONT, color: { argb: C_INPUT } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_INPUT } };
  c.border = BORDER;
  if (fmt) c.numFmt = fmt;
}
function setFormula(c: Cell, formula: string, result: unknown, fmt?: string, color: string = C_FORMULA, bold = false) {
  const r = typeof result === "number" && !Number.isFinite(result) ? 0 : result;
  c.value = { formula, result: r as any };
  c.font = { name: FONT, color: { argb: color }, bold };
  c.border = BORDER;
  if (fmt) c.numFmt = fmt;
}
function setLink(c: Cell, formula: string, result: unknown, fmt?: string) {
  setFormula(c, formula, result, fmt, C_LINK);
}
function setLabel(c: Cell, text: string, bold = false) {
  c.value = text;
  c.font = { name: FONT, bold };
  c.border = BORDER;
  c.alignment = { vertical: "middle", wrapText: true };
}
function title(ws: Worksheet, text: string, sub: string, span: number) {
  ws.mergeCells(1, 1, 1, span);
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { name: FONT, size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_TITLE } };
  c.alignment = { vertical: "middle" };
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, span);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { name: FONT, italic: true, size: 9, color: { argb: "FF595959" } };
}
function section(ws: Worksheet, row: number, text: string, span: number) {
  ws.mergeCells(row, 1, row, span);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { name: FONT, bold: true, color: { argb: FILL_TITLE } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_SECTION } };
}
function header(ws: Worksheet, row: number, labels: string[]) {
  labels.forEach((l, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = l;
    c.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_HEADER } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = BORDER;
  });
  ws.getRow(row).height = 42;
}
function totalStyle(ws: Worksheet, row: number, fromCol: number, toCol: number) {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_TOTAL } };
    cell.font = { ...(cell.font ?? {}), name: FONT, bold: true };
    cell.border = { ...BORDER, top: { style: "medium", color: { argb: "FF000000" } } };
  }
}
function legend(ws: Worksheet, row: number) {
  const items: [string, string][] = [
    ["შესატანი (შეგიძლიათ შეცვალოთ)", C_INPUT],
    ["ფორმულა", C_FORMULA],
    ["სხვა ფურცლიდან", C_LINK],
  ];
  items.forEach(([t, color], i) => {
    const c = ws.getCell(row, 1 + i * 2);
    c.value = "■ " + t;
    c.font = { name: FONT, size: 9, color: { argb: color } };
  });
}
function colLetter(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export async function exportToXlsx(state: AppState, opts: { isFull?: boolean } = {}) {
  const isFull = opts.isFull ?? false;
  const ExcelJS: ExcelNS = ((await import("exceljs")) as any).default ?? (await import("exceljs"));
  const eco = computeEconomics(state);
  const alloc = allocateProjectCosts(state);
  const p = state.project;
  const f = state.finance;
  const units: Unit[] = p.units.filter((u) => u.id && u.id.trim() !== "");
  const N = units.length;
  const thresholds = state.profitThresholds ?? defaultProfitThresholds;

  const wb = new ExcelJS.Workbook();
  wb.creator = "ELTEG — განფასების სისტემა";
  wb.created = new Date();
  (wb as any).calcProperties = { fullCalcOnLoad: true };
  const name = (n: string, sheet: string, addr: string) => wb.definedNames.add(`'${sheet}'!${addr}`, n);

  const today = new Date().toISOString().slice(0, 10);
  const sub = `${p.projectName || "პროექტი"} · ექსპორტი ${today}`;

  // =====================================================================
  // 1. დაშვებები
  // =====================================================================
  const wa = wb.addWorksheet(S_ASSUMP, { views: [{ state: "frozen", ySplit: 3 }] });
  wa.columns = [{ width: 46 }, { width: 18 }, { width: 50 }];
  title(wa, "ფინანსური დაშვებები", sub, 3);
  legend(wa, 3);
  let r = 5;
  const A: Record<string, string> = {}; // სახელი → მისამართი
  const inputRow = (label: string, key: string, value: number | string, fmt?: string, note = "") => {
    setLabel(wa.getCell(r, 1), label);
    setInput(wa.getCell(r, 2), value, fmt);
    if (note) { const c = wa.getCell(r, 3); c.value = note; c.font = { name: FONT, size: 9, color: { argb: "FF7F7F7F" } }; }
    A[key] = `$B$${r}`;
    name(key, S_ASSUMP, `$B$${r}`);
    r++;
  };
  const formulaRow = (label: string, key: string, formula: string, result: number, fmt?: string, note = "") => {
    setLabel(wa.getCell(r, 1), label);
    setFormula(wa.getCell(r, 2), formula, result, fmt);
    if (note) { const c = wa.getCell(r, 3); c.value = note; c.font = { name: FONT, size: 9, color: { argb: "FF7F7F7F" } }; }
    A[key] = `$B$${r}`;
    name(key, S_ASSUMP, `$B$${r}`);
    r++;
  };

  section(wa, r++, "1. სავალუტო კურსები", 3);
  setLabel(wa.getCell(r, 1), "კურსის თარიღი"); setInput(wa.getCell(r, 2), f.rateDate); r++;
  inputRow("USD → GEL", "USD_RATE", f.usdRate, FMT_RATE, "1 USD = ? ₾ (nbg.gov.ge)");
  inputRow("EUR → GEL", "EUR_RATE", f.eurRate, FMT_RATE);
  r++;
  section(wa, r++, "2. საგადასახადო პარამეტრები", 3);
  inputRow("დანადგარის დღგ", "VAT_EQ", f.equipmentVatRate, FMT_PCT, "დანადგარი + მისი ფასნამატი");
  inputRow("დღგ (გარდა დანადგარისა)", "VAT_OTHER", f.otherVatRate, FMT_PCT, "მონტაჟი, ფასნამატი, დამატებითი ხარჯები");
  inputRow("საშემოსავლო", "INC_TAX", f.incomeTaxRate, FMT_PCT);
  inputRow("საპენსიო", "PENSION", f.pensionRate, FMT_PCT);
  const grossRes = 1 / ((1 - Math.min(Math.max(f.incomeTaxRate || 0, 0), 0.95)) * (1 - Math.min(Math.max(f.pensionRate || 0, 0), 0.95)));
  formulaRow("ხელფასის დარიცხვის კოეფიციენტი", "GROSS",
    "1/((1-MIN(MAX(INC_TAX,0),0.95))*(1-MIN(MAX(PENSION,0),0.95)))", grossRes, FMT_RATE,
    "1 / ((1 − საშემოსავლო) × (1 − საპენსიო))");
  r++;
  section(wa, r++, "3. მივლინების განაკვეთები (₾)", 3);
  inputRow("კვება — მექანიკოსები (₾/დღე, 1 კაცზე)", "MEAL_M", f.mealMechanics ?? f.mealPerDay ?? 0, FMT_GEL);
  inputRow("კვება — ელექტრიკოსები (₾/დღე, 1 კაცზე)", "MEAL_E", f.mealElectricians ?? f.mealPerDay ?? 0, FMT_GEL);
  inputRow("კვება — ადმინისტრაცია (₾/დღე, 1 კაცზე)", "MEAL_A", f.mealAdmin ?? f.mealPerDay ?? 0, FMT_GEL);
  inputRow("სასტუმრო — მექანიკოსები (₾/დღე)", "HOTEL_M", f.hotelMechanics, FMT_GEL);
  inputRow("სასტუმრო — ელექტრიკოსები (₾/დღე)", "HOTEL_E", f.hotelElectricians, FMT_GEL);
  inputRow("სასტუმრო — ადმინისტრაცია (₾/დღე)", "HOTEL_A", f.hotelAdmin, FMT_GEL);
  inputRow("საწვავის ფასი (₾/ლ)", "FUEL_PRICE", f.fuelPricePerL, FMT_GEL);
  r++;
  section(wa, r++, "4. პროექტის შესყიდვის ხარჯები (ჯამურად, $)", 3);
  const nUnitsRow = r++;
  inputRow("საბანკო საკომისიო — პროექტის ჯამი", "BANK_TOTAL", p.bankCommissionTotal, FMT_USD, "თანაბრად, თითო დანადგარზე მინიმუმით");
  inputRow("საბანკო საკომისიო — მინ. თითო დანადგარზე", "BANK_MIN", state.defaultRates?.bankCommissionMinPerUnit ?? 25, FMT_USD);
  inputRow("საერთაშორისო ტრანსპორტი — ჯამი", "INTT_TOTAL", p.intTransportTotal, FMT_USD, "ნაწილდება ქარხნული ფასის წილით");
  inputRow("ტერმინალი — ჯამი", "TERM_TOTAL", p.terminalTotal, FMT_USD, "ნაწილდება ქარხნული ფასის წილით");
  inputRow("ადგილობრივი ტრანსპორტი და დაცლა — ჯამი", "LOCT_TOTAL", p.localTransportTotal, FMT_USD, "ნაწილდება ქარხნული ფასის წილით");
  r++;
  section(wa, r++, "5. გარანტია და მომსახურება", 3);
  inputRow("თვიური სერვისი ($/თვე)", "SERV_MONTHLY", f.monthlyServiceUsd, FMT_USD);
  inputRow("უფასო სერვისი (თვე)", "SERV_MONTHS", f.freeServiceMonths, FMT_NUM);
  inputRow("გარანტიის თანხა — ჯამურად ($)", "GUAR_AMOUNT", f.guaranteeAmountTotal ?? 0, FMT_USD, "თანაბრად ნაწილდება დანადგარებზე");
  r++;
  section(wa, r++, "6. საბანკო გარანტია", 3);
  inputRow("გარანტიის მოცულობა (% ფასიდან დღგ-ით)", "BG_PCT", f.guaranteePct, FMT_PCT);
  inputRow("მოქმედების ვადა (დღე)", "BG_DAYS", f.guaranteeDays, FMT_NUM);
  inputRow("წლიური საკომისიო %", "BG_ANNUAL", f.guaranteeAnnualPct, FMT_PCT, "Act/365");
  r++;
  section(wa, r++, "7. მინიმალური მოგების ზღვრები (კატეგორიის მიხედვით)", 3);
  const thrHeader = r;
  ["კატეგორია", "მინ. მარჟა %", "მინ. მოგების თანხა ($)"].forEach((t, i) => {
    const c = wa.getCell(r, i + 1);
    c.value = t; c.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_HEADER } }; c.border = BORDER;
  });
  r++;
  const thrStart = r;
  (Object.keys(EQUIPMENT_CATEGORY_LABEL) as EquipmentCategory[]).forEach((cat) => {
    const th = thresholds[cat] ?? { minAmount: 0, minMarginPct: 0 };
    setLabel(wa.getCell(r, 1), EQUIPMENT_CATEGORY_LABEL[cat]);
    setInput(wa.getCell(r, 2), th.minMarginPct, FMT_PCT);
    setInput(wa.getCell(r, 3), th.minAmount, FMT_USD);
    r++;
  });
  const thrEnd = r - 1;
  void thrHeader;
  name("THR_CAT", S_ASSUMP, `$A$${thrStart}:$A$${thrEnd}`);
  name("THR_MARGIN", S_ASSUMP, `$B$${thrStart}:$B$${thrEnd}`);
  name("THR_AMOUNT", S_ASSUMP, `$C$${thrStart}:$C$${thrEnd}`);

  // =====================================================================
  // 3. დანადგარები (ჯერ ვქმნით, რომ N_UNITS ჰქონდეს მისამართი)
  // =====================================================================
  const wp = wb.addWorksheet(S_PROJECT, { views: [{ state: "frozen", ySplit: 3 }] });
  const wu = wb.addWorksheet(S_UNITS, { views: [{ state: "frozen", xSplit: 2, ySplit: 5 }] });
  const U0 = 6;                       // პირველი დანადგარის სტრიქონი
  const UL = U0 + Math.max(N, 1) - 1; // ბოლო სტრიქონი
  const unitCols = [
    ["#", 8], ["კატეგორია", 14], ["ბრენდი", 14], ["მოდელი", 14], ["სართ.", 7],
    ["ქარხნული ფასი $", 14], ["მასალები $", 12], ["ხარაჩო $", 11], ["სხვა ხარჯი $", 12], ["დამიწება / ზედამხ. $", 13],
    ["საშუამავლო %", 11], ["მონტაჟი $/სართ.", 11], ["ელ.მონტაჟი $/სართ.", 11],
    ["მონტაჟი გაყიდვ. $/სართ.", 11], ["ელ.მონტ. გაყიდვ. $/სართ.", 11],
    ["დანადგ. ფასნამატი %", 11], ["მონტ. ფასნამატი %", 11], ["გაუთვალისწ. %", 10], ["ზედნადები %", 10], ["სავალ. რისკი %", 10], ["გარანტია % (ქარხნ.)", 10],
    ["საბანკო საკომ. $", 12], ["საერთ. ტრანსპ. $", 12], ["ტერმინალი $", 12], ["ადგ. ტრანსპ. $", 12], ["გაყიდვ. ბუფერი $", 12],
  ] as const;
  wu.columns = unitCols.map(([, w]) => ({ width: w }));
  title(wu, "დანადგარები — შესატანი მონაცემები და ხარჯების გადანაწილება", sub, unitCols.length);
  legend(wu, 3);
  header(wu, 5, unitCols.map(([l]) => l));
  // სვეტების ასოები
  const UC = {
    id: "A", cat: "B", brand: "C", model: "D", floors: "E", factory: "F", materials: "G", scaff: "H", other: "I", ground: "J",
    broker: "K", mech: "L", elec: "M", mechS: "N", elecS: "O", eqMk: "P", instMk: "Q", cont: "R", ovh: "S", fx: "T", warr: "U",
    bank: "V", intT: "W", term: "X", locT: "Y", buf: "Z",
  };
  // დანადგარების რაოდენობა — „დაშვებები" ფურცელზე (განაწილების მნიშვნელი)
  setLabel(wa.getCell(nUnitsRow, 1), "დანადგარების რაოდენობა (ავტომატურად)");
  setLink(wa.getCell(nUnitsRow, 2), `MAX(COUNTA(${ref(S_UNITS, `$A$${U0}:$A$${UL}`)}),1)`, Math.max(N, 1), FMT_NUM);
  name("N_UNITS", S_ASSUMP, `$B$${nUnitsRow}`);
  const factRange = `$${UC.factory}$${U0}:$${UC.factory}$${UL}`;
  units.forEach((u, i) => {
    const row = U0 + i;
    const isLast = i === N - 1;
    setInput(wu.getCell(`${UC.id}${row}`), u.id);
    setInput(wu.getCell(`${UC.cat}${row}`), EQUIPMENT_CATEGORY_LABEL[u.category ?? "lift"]);
    setInput(wu.getCell(`${UC.brand}${row}`), u.brand);
    setInput(wu.getCell(`${UC.model}${row}`), u.model);
    setInput(wu.getCell(`${UC.floors}${row}`), u.floors, FMT_NUM);
    setInput(wu.getCell(`${UC.factory}${row}`), u.factoryPrice, FMT_USD);
    setInput(wu.getCell(`${UC.materials}${row}`), u.materials, FMT_USD);
    setInput(wu.getCell(`${UC.scaff}${row}`), u.scaffolding ?? 0, FMT_USD);
    setInput(wu.getCell(`${UC.other}${row}`), u.otherCost, FMT_USD);
    setInput(wu.getCell(`${UC.ground}${row}`), u.grounding, FMT_USD);
    setInput(wu.getCell(`${UC.broker}${row}`), u.brokerCommissionPct, FMT_PCT);
    setInput(wu.getCell(`${UC.mech}${row}`), u.mechRateGel, FMT_DEC);
    setInput(wu.getCell(`${UC.elec}${row}`), u.elecRateGel, FMT_DEC);
    setInput(wu.getCell(`${UC.eqMk}${row}`), u.equipmentMarkupPct, FMT_PCT);
    setInput(wu.getCell(`${UC.instMk}${row}`), u.installMarkupPct, FMT_PCT);
    setInput(wu.getCell(`${UC.cont}${row}`), u.contingencyPct, FMT_PCT);
    setInput(wu.getCell(`${UC.ovh}${row}`), u.overheadPct ?? 0, FMT_PCT);
    setInput(wu.getCell(`${UC.fx}${row}`), u.fxRiskPct, FMT_PCT);
    setInput(wu.getCell(`${UC.warr}${row}`), u.warrantyPct, FMT_PCT);

    // გაყიდვების ტარიფის ბუფერი: ფინანსებს — ფორმულით, სხვა როლებს — მხოლოდ თანხა
    const bufRes = u.floors * grossRes * (
      Math.max((u.mechRateSalesGel ?? 0) - u.mechRateGel, 0) + Math.max((u.elecRateSalesGel ?? 0) - u.elecRateGel, 0));
    if (isFull) {
      setInput(wu.getCell(`${UC.mechS}${row}`), u.mechRateSalesGel ?? 0, FMT_DEC);
      setInput(wu.getCell(`${UC.elecS}${row}`), u.elecRateSalesGel ?? 0, FMT_DEC);
      setFormula(wu.getCell(`${UC.buf}${row}`),
        `${UC.floors}${row}*GROSS*(MAX(${UC.mechS}${row}-${UC.mech}${row},0)+MAX(${UC.elecS}${row}-${UC.elec}${row},0))`,
        bufRes, FMT_USD);
    } else {
      wu.getCell(`${UC.mechS}${row}`).border = BORDER;
      wu.getCell(`${UC.elecS}${row}`).border = BORDER;
      setInput(wu.getCell(`${UC.buf}${row}`), Math.round(bufRes * 100) / 100, FMT_USD);
    }

    // ხარჯების გადანაწილება (იგივე წესი, რაც აპში)
    setFormula(wu.getCell(`${UC.bank}${row}`), `ROUND(MAX(BANK_TOTAL/N_UNITS,BANK_MIN),2)`, alloc.bank.get(u.id) ?? 0, FMT_USD);
    const share = `IF(SUM(${factRange})>0,${UC.factory}${row}/SUM(${factRange}),1/N_UNITS)`;
    const byShare = (col: string, total: string, res: number) => {
      const formula = isLast && N > 1
        ? `ROUND(${total}-SUM(${col}$${U0}:${col}${row - 1}),2)`
        : `ROUND(${total}*${share},2)`;
      setFormula(wu.getCell(`${col}${row}`), formula, res, FMT_USD);
    };
    byShare(UC.intT, "INTT_TOTAL", alloc.intTransport.get(u.id) ?? 0);
    byShare(UC.term, "TERM_TOTAL", alloc.terminal.get(u.id) ?? 0);
    byShare(UC.locT, "LOCT_TOTAL", alloc.localTransport.get(u.id) ?? 0);
  });
  if (!isFull) {
    wu.getColumn(UC.mechS).hidden = true;
    wu.getColumn(UC.elecS).hidden = true;
    const c = wu.getCell(`${UC.buf}5`); c.value = "ზედნადების დანამატი $";
  }
  // ჯამის სტრიქონი
  const UT = UL + 1;
  setLabel(wu.getCell(`A${UT}`), "სულ", true);
  ([UC.factory, UC.materials, UC.scaff, UC.other, UC.ground, UC.bank, UC.intT, UC.term, UC.locT, UC.buf] as string[]).forEach((col) => {
    let res = 0;
    for (let rr = U0; rr <= UL; rr++) {
      const v: any = wu.getCell(`${col}${rr}`).value;
      res += typeof v === "number" ? v : (v && typeof v.result === "number" ? v.result : 0);
    }
    setFormula(wu.getCell(`${col}${UT}`), `SUM(${col}${U0}:${col}${UL})`, res, FMT_USD);
  });
  setFormula(wu.getCell(`${UC.floors}${UT}`), `SUM(${UC.floors}${U0}:${UC.floors}${UL})`, units.reduce((s, u) => s + u.floors, 0), FMT_NUM);
  totalStyle(wu, UT, 1, unitCols.length);
  wu.autoFilter = { from: { row: 5, column: 1 }, to: { row: UL, column: unitCols.length } };

  // =====================================================================
  // 2. პროექტი + მივლინება
  // =====================================================================
  wp.columns = [{ width: 30 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 15 }];
  title(wp, `${p.projectName || "პროექტი"} — პროექტის მონაცემები`, sub, 10);
  legend(wp, 3);
  r = 5;
  section(wp, r++, "0. შიდა ინფორმაცია", 10);
  const infoRow = (label: string, value: unknown, fmt?: string) => {
    setLabel(wp.getCell(r, 1), label);
    wp.mergeCells(r, 2, r, 5);
    setInput(wp.getCell(r, 2), value, fmt);
    r++;
  };
  infoRow("მომუშავე პირი", p.responsiblePerson);
  infoRow("საიდან მოვიდა პროექტი", p.leadSource);
  infoRow("დაწყების თარიღი", p.startDate);
  infoRow("დახურვის თარიღი", p.closeDate);
  infoRow("კონტრაქტის თარიღი", p.contractDate);
  infoRow("სტატუსი", PROJECT_STATUS_LABEL[p.status]);
  r++;
  section(wp, r++, "1. ზოგადი ინფორმაცია", 10);
  infoRow("პროექტის დასახელება", p.projectName);
  infoRow("მონტაჟის ადგილმდებარეობა", p.location);
  infoRow("ნაგებობის ტიპი", p.buildingType);
  infoRow("ჩაბარების წელი", p.completionYear);
  setLabel(wp.getCell(r, 1), "დანადგარების რაოდენობა");
  wp.mergeCells(r, 2, r, 5);
  setLink(wp.getCell(r, 2), `COUNTA(${ref(S_UNITS, `$A$${U0}:$A$${UL}`)})`, N, FMT_NUM);
  r += 2;

  section(wp, r++, "2. მივლინება", 10);
  setLabel(wp.getCell(r, 1), "მანძილი ერთი მიმართულებით (კმ)"); setInput(wp.getCell(r, 2), p.travel.distanceKm, FMT_NUM);
  name("DIST_KM", S_PROJECT, `$B$${r}`); r++;
  setLabel(wp.getCell(r, 1), "საწვავის ხარჯი (ლ/100კმ)"); setInput(wp.getCell(r, 2), p.travel.fuelConsumption, FMT_DEC);
  name("FUEL_CONS", S_PROJECT, `$B$${r}`); r++;
  setLabel(wp.getCell(r, 1), "საწვავი ₾/კმ");
  setFormula(wp.getCell(r, 2), "FUEL_PRICE*FUEL_CONS/100", eco.travel.fuelPerKm, FMT_GEL);
  name("FUEL_PER_KM", S_PROJECT, `$B$${r}`); r += 2;

  header(wp, r, ["ჯგუფი", "კაცი", "დღეები", "ჩასვლები", "საცხოვრებელი (hotel / house)", "სახლის ქირა ₾ (თვე)", "კვება ₾", "საცხოვრებელი ₾", "საწვავი ₾", "სულ ₾"]);
  r++;
  const tStart = r;
  const groups: [string, keyof typeof eco.travel.meals, typeof p.travel.mechanics, string, string][] = [
    ["მექანიკოსები", "mechanics", p.travel.mechanics, "MEAL_M", "HOTEL_M"],
    ["ელექტრიკოსები", "electricians", p.travel.electricians, "MEAL_E", "HOTEL_E"],
    ["ადმინისტრაცია", "admin", p.travel.admin, "MEAL_A", "HOTEL_A"],
  ];
  groups.forEach(([label, key, g, meal, hotel]) => {
    setLabel(wp.getCell(r, 1), label);
    setInput(wp.getCell(r, 2), g.headcount, FMT_NUM);
    setInput(wp.getCell(r, 3), g.days, FMT_NUM);
    setInput(wp.getCell(r, 4), g.trips, FMT_NUM);
    setInput(wp.getCell(r, 5), g.accommodationMode);
    wp.getCell(r, 5).dataValidation = { type: "list", allowBlank: false, formulae: ['"hotel,house"'] };
    setInput(wp.getCell(r, 6), g.houseRentTotal, FMT_GEL);
    setFormula(wp.getCell(r, 7), `${meal}*B${r}*C${r}`, eco.travel.meals[key], FMT_GEL);
    setFormula(wp.getCell(r, 8), `IF(E${r}="hotel",${hotel}*C${r},F${r})`, eco.travel.hotel[key], FMT_GEL);
    setFormula(wp.getCell(r, 9), `DIST_KM*2*D${r}*FUEL_PER_KM`, eco.travel.fuel[key], FMT_GEL);
    setFormula(wp.getCell(r, 10), `G${r}+H${r}+I${r}`, eco.travel.meals[key] + eco.travel.hotel[key] + eco.travel.fuel[key], FMT_GEL);
    r++;
  });
  const tEnd = r - 1;
  setLabel(wp.getCell(r, 1), "სულ ₾", true);
  const tg = eco.travel.totalsGel;
  [[7, tg.meals], [8, tg.hotel], [9, tg.fuel], [10, tg.grand]].forEach(([c, v]) => {
    const L = colLetter(c);
    setFormula(wp.getCell(r, c), `SUM(${L}${tStart}:${L}${tEnd})`, v, FMT_GEL);
  });
  totalStyle(wp, r, 1, 10);
  const tTot = r;
  r += 2;
  setLabel(wp.getCell(r, 1), "მივლინება სულ ($)", true);
  setFormula(wp.getCell(r, 2), `J${tTot}/USD_RATE`, eco.travel.totalUsd, FMT_USD, C_FORMULA, true);
  wp.mergeCells(r, 2, r, 3);
  name("TRAVEL_USD", S_PROJECT, `$B$${r}`); r++;
  setLabel(wp.getCell(r, 1), "მივლინება — თითო დანადგარზე ($)", true);
  setFormula(wp.getCell(r, 2), `TRAVEL_USD/N_UNITS`, eco.travel.perUnitUsd, FMT_USD, C_FORMULA, true);
  wp.mergeCells(r, 2, r, 3);
  name("TRAVEL_PER_UNIT", S_PROJECT, `$B$${r}`);

  // =====================================================================
  // 4. ეკონომიკა
  // =====================================================================
  const we = wb.addWorksheet(S_ECO, { views: [{ state: "frozen", xSplit: 1, ySplit: 5 }] });
  const ecoCols = [
    ["#", 8], ["სართ.", 7], ["შესყიდვის თვითღირ.", 14], ["მონტაჟის თვითღირ.", 14], ["სულ თვითღირ.", 14],
    ["ფასნამატი", 13], ["ფასი დამატ. ხარჯ. გარეშე", 15], ["გაუთვალისწ.", 12], ["ზედნადები", 12], ["სავალ. რისკი", 12],
    ["სხვა / დამიწება / გარანტია / სერვისი", 18], ["დამატ. ხარჯები სულ", 14], ["ფასი დღგ-ს გარეშე", 15], ["დღგ", 13],
    ["საბანკო გარანტია", 13], ["საშუამავლო", 12], ["საბოლოო ფასი", 15], ["მარჟა %", 9], ["წილი %", 9], ["მინ. მარჟა %", 9], ["სტატუსი", 17],
  ] as const;
  we.columns = ecoCols.map(([, w]) => ({ width: w }));
  title(we, "ეკონომიკა — დანადგარების მიხედვით (USD)", sub, ecoCols.length);
  legend(we, 3);
  header(we, 5, ecoCols.map(([l]) => l));
  const E0 = U0;
  const EL = UL;
  const u = (col: string, row: number) => ref(S_UNITS, `${col}${row}`);
  const colSum = { cont: 0, ovh: 0, fx: 0, misc: 0, broker: 0 };
  units.forEach((unit, i) => {
    const row = E0 + i;
    const rr = eco.units[i];
    const bank = alloc.bank.get(unit.id) ?? 0;
    const H = rr.priceNoExtras;
    const cont = H * unit.contingencyPct;
    const bufRes = unit.floors * grossRes * (
      Math.max((unit.mechRateSalesGel ?? 0) - unit.mechRateGel, 0) + Math.max((unit.elecRateSalesGel ?? 0) - unit.elecRateGel, 0));
    const ovh = H * (unit.overheadPct ?? 0) + bufRes;
    const fx = (unit.factoryPrice + bank) * unit.fxRiskPct;
    const misc = rr.extras - cont - ovh - fx;
    const M = rr.priceNoVat + rr.vat + rr.bankGuarantee;
    colSum.cont += cont; colSum.ovh += ovh; colSum.fx += fx; colSum.misc += misc; colSum.broker += rr.finalPrice - M;
    const minM = (thresholds[unit.category ?? "lift"] ?? { minMarginPct: 0 }).minMarginPct;

    setLink(we.getCell(`A${row}`), u(UC.id, row), unit.id);
    setLink(we.getCell(`B${row}`), u(UC.floors, row), unit.floors, FMT_NUM);
    setFormula(we.getCell(`C${row}`),
      `${u(UC.factory, row)}+${u(UC.bank, row)}+${u(UC.intT, row)}+${u(UC.term, row)}+${u(UC.locT, row)}`, rr.purchaseCost, FMT_USD);
    setFormula(we.getCell(`D${row}`),
      `${u(UC.floors, row)}*(${u(UC.mech, row)}+${u(UC.elec, row)})*GROSS+${u(UC.materials, row)}+${u(UC.scaff, row)}+TRAVEL_PER_UNIT`,
      rr.installCost, FMT_USD);
    setFormula(we.getCell(`E${row}`), `C${row}+D${row}`, rr.totalCost, FMT_USD);
    setFormula(we.getCell(`F${row}`), `C${row}*${u(UC.eqMk, row)}+D${row}*${u(UC.instMk, row)}`, rr.markup, FMT_USD);
    setFormula(we.getCell(`G${row}`), `E${row}+F${row}`, H, FMT_USD);
    setFormula(we.getCell(`H${row}`), `G${row}*${u(UC.cont, row)}`, cont, FMT_USD);
    setFormula(we.getCell(`I${row}`), `G${row}*${u(UC.ovh, row)}+${u(UC.buf, row)}`, ovh, FMT_USD);
    setFormula(we.getCell(`J${row}`), `(${u(UC.factory, row)}+${u(UC.bank, row)})*${u(UC.fx, row)}`, fx, FMT_USD);
    setFormula(we.getCell(`K${row}`),
      `${u(UC.other, row)}+${u(UC.ground, row)}+${u(UC.factory, row)}*${u(UC.warr, row)}+SERV_MONTHLY*SERV_MONTHS/N_UNITS+GUAR_AMOUNT/N_UNITS`,
      misc, FMT_USD);
    setFormula(we.getCell(`L${row}`), `SUM(H${row}:K${row})`, rr.extras, FMT_USD);
    setFormula(we.getCell(`M${row}`), `G${row}+L${row}`, rr.priceNoVat, FMT_USD);
    setFormula(we.getCell(`N${row}`),
      `C${row}*(1+${u(UC.eqMk, row)})*VAT_EQ+(M${row}-C${row}*(1+${u(UC.eqMk, row)}))*VAT_OTHER`, rr.vat, FMT_USD);
    setFormula(we.getCell(`O${row}`), `(M${row}+N${row})*BG_PCT*BG_ANNUAL*BG_DAYS/365*(1+VAT_OTHER)`, rr.bankGuarantee, FMT_USD);
    setFormula(we.getCell(`P${row}`), `(M${row}+N${row}+O${row})*${u(UC.broker, row)}`, rr.finalPrice - M, FMT_USD);
    setFormula(we.getCell(`Q${row}`), `M${row}+N${row}+O${row}+P${row}`, rr.finalPrice, FMT_USD, C_FORMULA, true);
    setFormula(we.getCell(`R${row}`), `IF(M${row}=0,0,F${row}/M${row})`, rr.marginPct, FMT_PCT);
    setFormula(we.getCell(`S${row}`), `IF($Q$${EL + 1}=0,0,Q${row}/$Q$${EL + 1})`, rr.projectShare, FMT_PCT);
    setFormula(we.getCell(`T${row}`), `IFERROR(INDEX(THR_MARGIN,MATCH(${u(UC.cat, row)},THR_CAT,0)),0)`, minM, FMT_PCT, C_LINK);
    const bad = rr.belowMinMargin || rr.belowMinAmount;
    setFormula(we.getCell(`U${row}`),
      `IF(OR(R${row}<T${row},F${row}<IFERROR(INDEX(THR_AMOUNT,MATCH(${u(UC.cat, row)},THR_CAT,0)),0)),"⚠ ზღვარს ქვემოთ","✓")`,
      bad ? "⚠ ზღვარს ქვემოთ" : "✓");
  });
  const ET = EL + 1;
  setLabel(we.getCell(`A${ET}`), "სულ", true);
  const sumCol = (L: string, res: number, fmt = FMT_USD) => setFormula(we.getCell(`${L}${ET}`), `SUM(${L}${E0}:${L}${EL})`, res, fmt);
  sumCol("B", units.reduce((s, x) => s + x.floors, 0), FMT_NUM);
  const T = eco.totals;
  sumCol("C", T.purchaseCost); sumCol("D", T.installCost); sumCol("E", T.totalCost); sumCol("F", T.markup);
  sumCol("G", T.priceNoExtras); sumCol("H", colSum.cont); sumCol("I", colSum.ovh); sumCol("J", colSum.fx); sumCol("K", colSum.misc);
  sumCol("L", T.extras); sumCol("M", T.priceNoVat); sumCol("N", T.vat); sumCol("O", T.bankGuarantee); sumCol("P", colSum.broker);
  sumCol("Q", T.finalPrice);
  setFormula(we.getCell(`R${ET}`), `IF(M${ET}=0,0,F${ET}/M${ET})`, T.marginPct, FMT_PCT);
  setFormula(we.getCell(`S${ET}`), `SUM(S${E0}:S${EL})`, N ? 1 : 0, FMT_PCT);
  totalStyle(we, ET, 1, ecoCols.length);
  name("CONTRACT_PRICE", S_ECO, `$Q$${ET}`);

  // სტატუსის ფერი
  we.addConditionalFormatting({
    ref: `U${E0}:U${EL}`,
    rules: [
      { type: "containsText", operator: "containsText", text: "⚠", priority: 1,
        style: { font: { color: { argb: "FFC00000" }, bold: true }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } } } } as any,
    ],
  });
  we.addConditionalFormatting({
    ref: `R${E0}:R${EL}`,
    rules: [
      { type: "expression", formulae: [`R${E0}<T${E0}`], priority: 2,
        style: { font: { color: { argb: "FFC00000" }, bold: true } } } as any,
    ],
  });

  // ---------- დეტალური ანგარიში ----------
  const rep = eco.report;
  r = ET + 3;
  section(we, r++, "დეტალური ანგარიში (დამოუკიდებელი გადაანგარიშება)", 7);
  const repCol = 6; // F — თანხა
  const R: Record<string, string> = {};
  const repLine = (key: string, label: string, formula: string, res: number, opts2: { bold?: boolean; fmt?: string; indent?: boolean } = {}) => {
    we.mergeCells(r, 1, r, repCol - 1);
    setLabel(we.getCell(r, 1), (opts2.indent ? "   " : "") + label, !!opts2.bold);
    we.getCell(r, 1).alignment = { vertical: "middle", wrapText: false };
    setFormula(we.getCell(r, repCol), formula, res, opts2.fmt ?? FMT_USD, C_FORMULA, !!opts2.bold);
    R[key] = `F${r}`;
    if (opts2.bold) totalStyle(we, r, 1, repCol);
    r++;
  };
  const rng = (col: string) => ref(S_UNITS, `$${col}$${U0}:$${col}$${UL}`);
  const erng = (col: string) => `$${col}$${E0}:$${col}$${EL}`;
  repLine("fac", "ქარხნული ფასი", `SUM(${rng(UC.factory)})`, rep.factoryTotal, { indent: true });
  repLine("bank", "საბანკო საკომისიო", `SUM(${rng(UC.bank)})`, rep.bankCommTotal, { indent: true });
  repLine("intt", "საერთაშორისო ტრანსპორტი", `INTT_TOTAL`, rep.intTransportTotal, { indent: true });
  repLine("term", "ტერმინალი", `TERM_TOTAL`, rep.terminalTotal, { indent: true });
  repLine("loct", "ადგილობრივი ტრანსპორტი", `LOCT_TOTAL`, rep.localTransportTotal, { indent: true });
  repLine("purch", "შესყიდვის თვითღირებულება", `SUM(${R.fac}:${R.loct})`, rep.purchaseTotal, { bold: true });
  repLine("mechp", "მონტაჟი (ხელფასი დარიცხვებით)", `SUMPRODUCT(${rng(UC.floors)},${rng(UC.mech)})*GROSS`, rep.mechPayroll, { indent: true });
  repLine("elecp", "ელექტრომონტაჟი (ხელფასი დარიცხვებით)", `SUMPRODUCT(${rng(UC.floors)},${rng(UC.elec)})*GROSS`, rep.elecPayroll, { indent: true });
  repLine("trav", "მივლინება", `TRAVEL_USD`, rep.travelTotal, { indent: true });
  repLine("mat", "მასალები", `SUM(${rng(UC.materials)})`, rep.materialsTotal, { indent: true });
  repLine("scaf", "ხარაჩო", `SUM(${rng(UC.scaff)})`, rep.scaffoldingTotal, { indent: true });
  repLine("inst", "მონტაჟის თვითღირებულება", `SUM(${R.mechp}:${R.scaf})`, rep.installTotal, { bold: true });
  repLine("cost", "სულ თვითღირებულება", `${R.purch}+${R.inst}`, rep.costTotal, { bold: true });
  repLine("eqmk", "დანადგარის ფასნამატი", `SUMPRODUCT(${erng("C")},${rng(UC.eqMk)})`, rep.equipmentMarkup, { indent: true });
  repLine("inmk", "მონტაჟის ფასნამატი", `SUMPRODUCT(${erng("D")},${rng(UC.instMk)})`, rep.installMarkup, { indent: true });
  repLine("mk", "ფასნამატი სულ", `${R.eqmk}+${R.inmk}`, rep.markupTotal, { bold: true });
  repLine("pne", "ფასი დამატებითი ხარჯების გარეშე", `${R.cost}+${R.mk}`, rep.priceNoExtras, { bold: true });
  repLine("cont", "გაუთვალისწინებელი ხარჯი", `SUMPRODUCT(${erng("G")},${rng(UC.cont)})`, rep.contingency, { indent: true });
  repLine("ovh", "ზედნადები ხარჯი", `SUMPRODUCT(${erng("G")},${rng(UC.ovh)})+SUM(${rng(UC.buf)})`, rep.overhead, { indent: true });
  repLine("fx", "სავალუტო რისკი", `SUMPRODUCT(${rng(UC.factory)}+${rng(UC.bank)},${rng(UC.fx)})`, rep.fxRisk, { indent: true });
  repLine("oth", "სხვა ხარჯი", `SUM(${rng(UC.other)})`, rep.otherTotal, { indent: true });
  repLine("grd", "დამიწება / ზედამხედველობა", `SUM(${rng(UC.ground)})`, rep.groundingTotal, { indent: true });
  repLine("war", "გარანტიის ხარჯი", `SUMPRODUCT(${rng(UC.factory)},${rng(UC.warr)})`, rep.warrantyCost, { indent: true });
  repLine("srv", "უფასო სერვისი", `SERV_MONTHLY*SERV_MONTHS`, rep.freeServiceCost, { indent: true });
  repLine("gam", "გარანტიის თანხა (ჯამურად)", `GUAR_AMOUNT`, rep.guaranteeAmountCost, { indent: true });
  repLine("ext", "დამატებითი ხარჯები სულ", `SUM(${R.cont}:${R.gam})`, rep.extrasTotal, { bold: true });
  repLine("pnv", "ფასი დღგ-ს გარეშე", `${R.pne}+${R.ext}`, rep.priceNoVat, { bold: true });
  const eqPortion = units.reduce((s, x, i) => s + eco.units[i].purchaseCost * (1 + x.equipmentMarkupPct), 0);
  repLine("eqp", "დღგ-ს ბაზა — დანადგარის ნაწილი", `SUMPRODUCT(${erng("C")},1+${rng(UC.eqMk)})`, eqPortion, { indent: true });
  repLine("vat", "დღგ", `${R.eqp}*VAT_EQ+(${R.pnv}-${R.eqp})*VAT_OTHER`, rep.vat, { indent: true });
  repLine("pwv", "ფასი დღგ-ით", `${R.pnv}+${R.vat}`, rep.priceWithVat, { bold: true });
  repLine("gb", "საბანკო გარანტიის ბაზა", `${R.pwv}*BG_PCT`, rep.guaranteeBase, { indent: true });
  repLine("gf", "საბანკო გარანტიის საკომისიო", `${R.gb}*BG_ANNUAL*BG_DAYS/365`, rep.guaranteeFee, { indent: true });
  repLine("brk", "საშუამავლო საკომისიო", `SUM(${erng("P")})`, rep.brokerTotal, { indent: true });
  repLine("fin", "საბოლოო საკონტრაქტო ფასი", `${R.pwv}+${R.gf}*(1+VAT_OTHER)+${R.brk}`, rep.finalContractPrice, { bold: true });
  repLine("mrg", "ჯამური მარჟა %", `IF(${R.pnv}=0,0,${R.mk}/${R.pnv})`, rep.totalMarginPct, { bold: true, fmt: FMT_PCT });
  r++;
  we.mergeCells(r, 1, r, repCol - 1);
  setLabel(we.getCell(r, 1), "შემოწმება: დანადგარების ჯამი − ანგარიში (უნდა იყოს 0)", true);
  we.getCell(r, 1).alignment = { vertical: "middle", wrapText: false };
  setFormula(we.getCell(r, repCol), `ROUND(Q${ET}-${R.fin},2)`, rep.checkDiff, FMT_USD, C_FORMULA, true);
  setFormula(we.getCell(r, repCol + 1), `IF(ABS(F${r})<0.05,"✓ OK","✗ შეცდომა")`, Math.abs(rep.checkDiff) < 0.05 ? "✓ OK" : "✗ შეცდომა", undefined, C_FORMULA, true);
  we.addConditionalFormatting({
    ref: `F${r}:G${r}`,
    rules: [
      { type: "expression", formulae: [`ABS($F$${r})<0.05`], priority: 3,
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC6EFCE" } }, font: { color: { argb: "FF006100" }, bold: true } } } as any,
      { type: "expression", formulae: [`ABS($F$${r})>=0.05`], priority: 4,
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } }, font: { color: { argb: "FF9C0006" }, bold: true } } } as any,
    ],
  });

  // =====================================================================
  // 5. გადახდის გრაფიკი
  // =====================================================================
  const wpay = wb.addWorksheet(S_PAY, { views: [{ state: "frozen", ySplit: 3 }] });
  wpay.columns = [{ width: 40 }, { width: 16 }, { width: 18 }];
  title(wpay, "გადახდის გრაფიკი", sub, 3);
  legend(wpay, 3);
  r = 5;
  setLabel(wpay.getCell(r, 1), "სრული საკონტრაქტო ფასი", true);
  setLink(wpay.getCell(r, 2), `CONTRACT_PRICE`, T.finalPrice, FMT_USD);
  const priceAddr = `$B$${r}`; r++;
  setLabel(wpay.getCell(r, 1), "მომწოდებლისთვის ავანსი %");
  setInput(wpay.getCell(r, 2), state.payment.procurementAdvancePct, FMT_PCT); r += 2;

  const scenario = (which: "A" | "B") => {
    const sc = which === "A" ? state.payment.scenarioA : state.payment.scenarioB;
    const repS = which === "A" ? eco.scenarioA : eco.scenarioB;
    if (!sc || sc.tranches.length === 0) return;
    section(wpay, r++, `სცენარი ${which}: ${sc.name}`, 3);
    header(wpay, r++, ["ტრანში", "% ფასიდან", "თანხა"]);
    const trStart = r;
    const trAddr: string[] = [];
    sc.tranches.forEach((t, i) => {
      setInput(wpay.getCell(r, 1), t.label);
      setInput(wpay.getCell(r, 2), t.pct, FMT_PCT);
      setFormula(wpay.getCell(r, 3), `B${r}*${priceAddr}`, repS.tranches[i].amount, FMT_USD);
      trAddr.push(`C${r}`);
      r++;
    });
    const trEnd = r - 1;
    setLabel(wpay.getCell(r, 1), "სულ", true);
    setFormula(wpay.getCell(r, 2), `SUM(B${trStart}:B${trEnd})`, repS.pctSum, FMT_PCT);
    setFormula(wpay.getCell(r, 3), `SUM(C${trStart}:C${trEnd})`, repS.tranches.reduce((s, t) => s + t.amount, 0), FMT_USD);
    totalStyle(wpay, r, 1, 3);
    wpay.addConditionalFormatting({
      ref: `B${r}`,
      rules: [{ type: "expression", formulae: [`ABS(B${r}-1)>0.0001`], priority: 5,
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } } } } as any],
    });
    r += 2;
    header(wpay, r++, ["ფულადი ნაკადი", "თანხა (+ შემოსვლა / − გასვლა)", "ნაშთი"]);
    const evStart = r;
    const before = sc.expenses.filter((e) => e.afterTranche < 0);
    const raw: { label: string; amount: number; trancheIdx?: number }[] = before.map((e) => ({ label: e.label, amount: e.amount }));
    sc.tranches.forEach((t, i) => {
      raw.push({ label: t.label + " მიღება", amount: repS.tranches[i].amount, trancheIdx: i });
      sc.expenses.filter((e) => e.afterTranche === i).forEach((e) => raw.push({ label: e.label, amount: e.amount }));
    });
    raw.forEach((ev, k) => {
      const evt = repS.events[k];
      if (ev.trancheIdx !== undefined) {
        setLabel(wpay.getCell(r, 1), ev.label, true);
        setFormula(wpay.getCell(r, 2), trAddr[ev.trancheIdx], ev.amount, FMT_USD);
      } else {
        setInput(wpay.getCell(r, 1), ev.label);
        setInput(wpay.getCell(r, 2), ev.amount, FMT_USD);
      }
      setFormula(wpay.getCell(r, 3), r === evStart ? `B${r}` : `C${r - 1}+B${r}`, evt?.balance ?? 0, FMT_USD);
      r++;
    });
    const evEnd = r - 1;
    setLabel(wpay.getCell(r, 1), "საბოლოო ნაშთი", true);
    setFormula(wpay.getCell(r, 3), raw.length ? `C${evEnd}` : "0", repS.finalBalance, FMT_USD);
    totalStyle(wpay, r, 1, 3);
    if (raw.length) {
      wpay.addConditionalFormatting({
        ref: `C${evStart}:C${evEnd}`,
        rules: [{ type: "cellIs", operator: "lessThan", formulae: ["0"], priority: 6,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } } } } as any],
      });
    }
    r += 3;
  };
  scenario("A");
  scenario("B");

  // ფურცლების თანმიმდევრობა და ბეჭდვა
  for (const ws of [wa, wp, wu, we, wpay]) {
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    ws.properties.defaultRowHeight = 16;
  }
  // გახსნისას აქტიური — „ეკონომიკა"
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 3, visibility: "visible" }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const fileName = `${(p.projectName || "პროექტი").replace(/[\\/:*?"<>|]/g, "_")}_განფასება.xlsx`;
  if (typeof window === "undefined" || typeof document === "undefined") return { buffer: buf, fileName };
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { buffer: buf, fileName };
}
