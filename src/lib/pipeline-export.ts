// პაიპლაინის „წარმომადგენლების პაიპლაინი" დაშბორდის Excel-ექსპორტი.
// თითო წარმომადგენლის აგრეგატი + ქვემოთ მისი პროექტების ჩაშლილი სია, ჯამით.
// მნიშვნელობებად (აპი უკვე ითვლის); ფაილი გახსნისთანავე მზადაა Excel 2021-ში.
// ავტორი: Giorgi Turmanidze "GT".

type ExcelNS = typeof import("exceljs");

const FMT_USD0 = '"$"#,##0;[Red]-"$"#,##0';
const FMT_PCT0 = "0%";
const C_TITLE = "FF1F3864";
const C_SECTION = "FFD9E1F2";
const C_HEADER = "FF2F5496";
const C_TOTAL = "FFE7E6E6";
const C_SUBHEAD = "FFF2F2F2";

export interface PipelineRepRow {
  manager: string;
  n: number;
  bySize: number[];      // [პატარა, საშუალო, დიდი, —]
  byBrand: number[];     // [Kleemann, Hitachi, Fuji, სხვა]
  value: number;
  potential: number;
  plan: number;
  projects: {
    name: string;
    size: string;
    brand: string;
    bucket: string;      // საბოლოო სტატუსი (დაკონტრაქტებული/90%…)
    probPct: number;     // 0..100
    value: number;
    revenue: number;
    sharePct: number;    // 0..100
    amount: number;      // გეგმასთან შედარების თანხა
    period: string;      // „2026 Q3"
  }[];
}

export interface PipelineExportInput {
  rows: PipelineRepRow[];
  sizeLabels: string[];   // PROJECT_SIZES
  brandLabels: string[];  // BRAND_GROUPS
  metricLabel: string;    // „შემოსავალი (მარჟა)" / „კლემანი" / „ჰიტაჩი"
  weighted: boolean;
  year: number;
}

export async function exportPipelineDashboardXlsx(input: PipelineExportInput) {
  const ExcelJS: ExcelNS = ((await import("exceljs")) as any).default ?? (await import("exceljs"));
  const { rows, sizeLabels, brandLabels, metricLabel, weighted, year } = input;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Giorgi Turmanidze "GT"';
  wb.lastModifiedBy = 'Giorgi Turmanidze "GT"';
  wb.created = new Date();

  const ws = wb.addWorksheet(`პაიპლაინი ${year}`, { views: [{ state: "frozen", ySplit: 6 }] });

  // სვეტები: წარმომადგენელი | სულ | <ზომები> | — | <ბრენდები> | სრული | პოტენციალი | წლ.გეგმა | სხვაობა | დაფარვა
  const sizeCols = sizeLabels.length;            // 3
  const brandCols = brandLabels.length;          // 4
  const totalCols = 1 + 1 + sizeCols + 1 + brandCols + 1 + 1 + 1 + 1 + 1;
  const lastCol = totalCols;

  const money = (c: any) => { c.numFmt = FMT_USD0; c.alignment = { horizontal: "right" }; };
  const intC = (c: any) => { c.alignment = { horizontal: "right" }; };

  // --- სათაური ---
  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = `წარმომადგენლების პაიპლაინი — ${year}`;
  t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_TITLE } };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, lastCol);
  const sub = ws.getCell(2, 1);
  sub.value = `შედარების ბაზა: ${metricLabel}  ·  ${weighted ? "ალბათობით შეწონილი" : "სრული თანხა"}  ·  ავტორი: Giorgi Turmanidze "GT"`;
  sub.font = { italic: true, size: 10, color: { argb: "FF555555" } };
  sub.alignment = { horizontal: "center" };

  // --- ჯგუფური სათაური (მე-4 რიგი) ---
  const gRow = 4;
  let col = 1;
  ws.mergeCells(gRow, 1, gRow + 1, 1); setHead(ws.getCell(gRow, 1), "წარმომადგენელი"); col = 2;
  const projStart = col;
  ws.mergeCells(gRow, projStart, gRow, projStart + sizeCols); // სულ + ზომები + —
  setHead(ws.getCell(gRow, projStart), "პროექტები (ც.)");
  col = projStart + 1 + sizeCols + 1; // სულ + ზომები + —
  const brandStart = col;
  ws.mergeCells(gRow, brandStart, gRow, brandStart + brandCols - 1);
  setHead(ws.getCell(gRow, brandStart), `შემოსავალი (მარჟა) ბრენდებით${weighted ? " — შეწონილი" : ""}`);
  col = brandStart + brandCols;
  const valCol = col;
  ws.mergeCells(gRow, valCol, gRow + 1, valCol); setHead(ws.getCell(gRow, valCol), "სრული ღირებულება");
  col = valCol + 1;
  const planStart = col;
  ws.mergeCells(gRow, planStart, gRow, planStart + 3);
  setHead(ws.getCell(gRow, planStart), "გეგმასთან შედარება");

  // --- ქვე-სათაური (მე-5 რიგი) ---
  const hRow = gRow + 1;
  const subHeads = ["სულ", ...sizeLabels, "—", ...brandLabels, null /*val merged*/, "პოტენციალი", "წლიური გეგმა", "სხვაობა", "დაფარვა"];
  let hc = 2;
  for (const label of subHeads) {
    if (label === null) { hc++; continue; } // val column already merged over both rows
    setHead(ws.getCell(hRow, hc), label);
    hc++;
  }

  // --- მონაცემები ---
  let r = hRow + 1;
  const tot = { n: 0, bySize: sizeLabels.map(() => 0).concat([0]), byBrand: brandLabels.map(() => 0), value: 0, potential: 0, plan: 0 };

  for (const row of rows) {
    const rr = ws.getRow(r);
    rr.getCell(1).value = row.manager;
    rr.getCell(1).font = { bold: true };
    rr.getCell(2).value = row.n; intC(rr.getCell(2));
    tot.n += row.n;
    let c = 3;
    row.bySize.forEach((v, i) => { rr.getCell(c).value = v; intC(rr.getCell(c)); tot.bySize[i] += v; c++; });
    row.byBrand.forEach((v, i) => { rr.getCell(c).value = v || null; money(rr.getCell(c)); tot.byBrand[i] += v; c++; });
    rr.getCell(c).value = row.value; money(rr.getCell(c)); tot.value += row.value; c++;
    rr.getCell(c).value = row.potential; money(rr.getCell(c)); tot.potential += row.potential; c++;
    rr.getCell(c).value = row.plan || null; money(rr.getCell(c)); tot.plan += row.plan; c++;
    rr.getCell(c).value = row.plan ? row.potential - row.plan : null; money(rr.getCell(c)); c++;
    const covCell = rr.getCell(c);
    covCell.value = row.plan > 0 ? row.potential / row.plan : null;
    covCell.numFmt = FMT_PCT0; covCell.alignment = { horizontal: "right" };
    rr.getCell(1).fill = fill(C_SUBHEAD);
    r++;

    // ჩაშლილი პროექტები
    if (row.projects.length) {
      const ph = ws.getRow(r);
      const pHeads = ["   პროექტი", "ზომა", "ბრენდი", "სტატუსი", "ალბათ.", "სრ. ღირ.", "შემოსავ.", "გეგმ.%", "შედარ. თანხა", "კვ."];
      pHeads.forEach((h, i) => { const cc = ph.getCell(1 + i); cc.value = h; cc.font = { italic: true, size: 9, color: { argb: "FF777777" } }; cc.fill = fill(C_SUBHEAD); });
      r++;
      for (const p of row.projects) {
        const pr = ws.getRow(r);
        pr.getCell(1).value = "   " + p.name;
        pr.getCell(2).value = p.size || "—";
        pr.getCell(3).value = p.brand;
        pr.getCell(4).value = p.bucket;
        pr.getCell(5).value = p.probPct / 100; pr.getCell(5).numFmt = FMT_PCT0; pr.getCell(5).alignment = { horizontal: "right" };
        pr.getCell(6).value = p.value; money(pr.getCell(6));
        pr.getCell(7).value = p.revenue; money(pr.getCell(7));
        pr.getCell(8).value = p.sharePct / 100; pr.getCell(8).numFmt = FMT_PCT0; pr.getCell(8).alignment = { horizontal: "right" };
        pr.getCell(9).value = p.amount; money(pr.getCell(9));
        pr.getCell(10).value = p.period;
        for (let i = 1; i <= 10; i++) pr.getCell(i).font = { size: 9, ...(pr.getCell(i).font || {}) };
        r++;
      }
    }
  }

  // --- ჯამი ---
  const tr = ws.getRow(r);
  tr.getCell(1).value = "ჯამი";
  let tc = 2;
  tr.getCell(tc).value = tot.n; intC(tr.getCell(tc)); tc++;
  tot.bySize.forEach((v) => { tr.getCell(tc).value = v; intC(tr.getCell(tc)); tc++; });
  tot.byBrand.forEach((v) => { tr.getCell(tc).value = v; money(tr.getCell(tc)); tc++; });
  tr.getCell(tc).value = tot.value; money(tr.getCell(tc)); tc++;
  tr.getCell(tc).value = tot.potential; money(tr.getCell(tc)); tc++;
  tr.getCell(tc).value = tot.plan; money(tr.getCell(tc)); tc++;
  tr.getCell(tc).value = tot.potential - tot.plan; money(tr.getCell(tc)); tc++;
  const tcov = tr.getCell(tc);
  tcov.value = tot.plan > 0 ? tot.potential / tot.plan : null; tcov.numFmt = FMT_PCT0; tcov.alignment = { horizontal: "right" };
  for (let i = 1; i <= lastCol; i++) { tr.getCell(i).font = { bold: true }; tr.getCell(i).fill = fill(C_TOTAL); }

  // --- სვეტების სიგანე ---
  ws.getColumn(1).width = 30;
  for (let i = 2; i <= lastCol; i++) ws.getColumn(i).width = 13;

  await saveWorkbook(wb, `პაიპლაინი_${year}`);

  function setHead(cell: any, text: string) {
    cell.value = text;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = fill(C_HEADER);
  }
}

function fill(argb: string) {
  return { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } };
}

async function saveWorkbook(wb: import("exceljs").Workbook, baseName: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const fileName = `${baseName.replace(/[\\/:*?"<>|]/g, "_")}.xlsx`;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
