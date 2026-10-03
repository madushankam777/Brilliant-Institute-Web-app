// turns a report into an Excel workbook with ExcelJS
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const config = require('../../../../../shared/server/src/config/env');

// institute colours and greys, as Excel colour codes
const NAVY = 'FF1E3A8A';
const GOLD = 'FFC9A961';
const MUTED = 'FF64748B';
const SOFT = 'FFF4F6FB';
// status colours - green, amber and red
const TONE_COLORS = { success: 'FF15803D', warning: 'FFB45309', danger: 'FFB91C1C', default: NAVY };
// the institute logo, embedded in the Summary sheet
const LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'logo.jpeg')).toString('base64');

// Excel number formats for each report format
const NUMBER_FORMATS = {
  money: '#,##0.00',
  lkr: '"LKR "#,##0.00',
  lkr0: '"LKR "#,##0',
  number: '#,##0',
  percent: '0.0"%"',
  hours: '0.0" h"',
  date: 'dd mmm yyyy',
  datetime: 'dd mmm yyyy hh:mm',
};
// formats that are written as real numbers
const NUMERIC = ['money', 'lkr', 'lkr0', 'number', 'percent', 'hours'];
// a column is at most 60 characters wide
const MAX_WIDTH = 60;

// "2026-10-02 15:30:00" -> Date that Excel shows as the same wall-clock time
function toDate(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const [, y, m, d, hh = '0', mm = '0', ss = '0'] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
}

// value to write in a cell: real numbers and dates where we have them
function cellValue(cell, format) {
  if (cell.value !== undefined && NUMERIC.includes(format)) return Number(cell.value);
  if (cell.value !== undefined && (format === 'date' || format === 'datetime')) return toDate(cell.value) || cell.text;
  return cell.text === '-' ? null : cell.text;
}

// Excel sheet names: max 31 characters, no []:*?/\ and unique
function sheetName(title, used) {
  const base = String(title).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n += 1) {
    const suffix = ` (${n})`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
}

// remembers the widest text in each column so widths fit the content
function trackWidth(widths, col, value) {
  const text = value instanceof Date ? 'dd mmm yyyy hh:mm' : String(value === null || value === undefined ? '' : value);
  const length = Math.min(MAX_WIDTH, text.length + 2);
  widths[col] = Math.max(widths[col] || 8, length);
}

// set each column to the width worked out from its content
function applyWidths(ws, widths) {
  Object.entries(widths).forEach(([col, width]) => {
    ws.getColumn(Number(col)).width = width;
  });
}

// page setup + header/footer for printing
function printSetup(ws, report) {
  ws.pageSetup = {
    paperSize: 9,
    orientation: report.orientation === 'landscape' ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter.oddHeader = `&L&"Calibri,Bold"Brilliant Institute&R${report.title}`;
  ws.headerFooter.oddFooter = `&L${report.reportNumber}&CPage &P of &N&RConfidential`;
}

// --- cover sheet ---
// the Summary sheet - logo, report details, key figures, key findings and links to each sheet
function buildSummary(workbook, report, sheets) {
  const ws = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  printSetup(ws, report);
  [26, 42, 26, 42].forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });

  // the logo and the institute name, address and contacts
  const logo = workbook.addImage({ base64: LOGO, extension: 'jpeg' });
  ws.addImage(logo, { tl: { col: 0.1, row: 0.2 }, ext: { width: 58, height: 58 } });
  ws.mergeCells('B1:D1');
  ws.getCell('B1').value = 'BRILLIANT INSTITUTE';
  ws.getCell('B1').font = { bold: true, size: 16, color: { argb: NAVY } };
  ws.mergeCells('B2:D2');
  ws.getCell('B2').value = 'Brilliant Makes Brilliance · Since 1982';
  ws.getCell('B2').font = { size: 9, color: { argb: MUTED } };
  ws.mergeCells('B3:D3');
  ws.getCell('B3').value = `${config.institute.address} · ${config.institute.email} · ${config.institute.phone}`;
  ws.getCell('B3').font = { size: 9, color: { argb: MUTED } };
  [1, 2, 3].forEach((row) => {
    ws.getRow(row).height = 18;
  });
  ['A4', 'B4', 'C4', 'D4'].forEach((ref) => {
    ws.getCell(ref).border = { bottom: { style: 'medium', color: { argb: GOLD } } };
  });

  // the report title and subtitle
  let row = 6;
  ws.mergeCells(`A${row}:D${row}`);
  ws.getCell(`A${row}`).value = report.title;
  ws.getCell(`A${row}`).font = { bold: true, size: 20, color: { argb: NAVY } };
  ws.getRow(row).height = 28;
  row += 1;
  if (report.subtitle) {
    ws.mergeCells(`A${row}:D${row}`);
    ws.getCell(`A${row}`).value = report.subtitle;
    ws.getCell(`A${row}`).font = { size: 11, color: { argb: MUTED } };
    row += 1;
  }
  row += 1;

  // report details, two per row
  const details = [
    ['Report number', report.reportNumber],
    ['Generated on', report.generatedText],
    ['Reporting period', report.periodLabel],
    ['Prepared by', report.generatedBy],
    ...report.parameters.map((item) => [item.label, item.value]),
    ['Data source', 'Live system records'],
  ];
  for (let i = 0; i < details.length; i += 2) {
    [details[i], details[i + 1]].forEach((pair, side) => {
      if (!pair) return;
      const labelCell = ws.getCell(row, side * 2 + 1);
      const valueCell = ws.getCell(row, side * 2 + 2);
      labelCell.value = pair[0];
      labelCell.font = { bold: true, size: 9, color: { argb: MUTED } };
      valueCell.value = pair[1];
      [labelCell, valueCell].forEach((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
      });
    });
    row += 1;
  }
  row += 1;

  // key figures
  if (report.summary.length > 0) {
    ws.getCell(`A${row}`).value = 'KEY FIGURES';
    ws.getCell(`A${row}`).font = { bold: true, size: 10, color: { argb: NAVY } };
    row += 1;
    ['Measure', 'Value', 'Note'].forEach((text, index) => {
      const cell = ws.getCell(row, index + 1);
      cell.value = text;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    });
    row += 1;
    report.summary.forEach((item) => {
      ws.getCell(row, 1).value = item.label;
      const valueCell = ws.getCell(row, 2);
      if (NUMERIC.includes(item.format) && item.raw !== null && item.raw !== undefined) {
        valueCell.value = Number(item.raw);
        valueCell.numFmt = NUMBER_FORMATS[item.format];
      } else {
        valueCell.value = item.value;
      }
      valueCell.alignment = { horizontal: 'left' };
      valueCell.font = { bold: true, color: { argb: TONE_COLORS[item.tone] || NAVY } };
      ws.getCell(row, 3).value = item.note || null;
      ws.getCell(row, 3).font = { size: 9, color: { argb: MUTED } };
      row += 1;
    });
    row += 1;
  }

  // key findings
  if (report.highlights.length > 0) {
    ws.getCell(`A${row}`).value = 'KEY FINDINGS';
    ws.getCell(`A${row}`).font = { bold: true, size: 10, color: { argb: 'FF8A6D1D' } };
    row += 1;
    report.highlights.forEach((text) => {
      ws.mergeCells(`A${row}:D${row}`);
      const cell = ws.getCell(`A${row}`);
      cell.value = `•  ${text}`;
      cell.alignment = { wrapText: true, vertical: 'top' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF8EC' } };
      ws.getRow(row).height = Math.max(16, Math.ceil(text.length / 120) * 15);
      row += 1;
    });
    row += 1;
  }

  // contents with links to each sheet
  ws.getCell(`A${row}`).value = 'CONTENTS';
  ws.getCell(`A${row}`).font = { bold: true, size: 10, color: { argb: NAVY } };
  row += 1;
  sheets.forEach((name) => {
    const cell = ws.getCell(`A${row}`);
    cell.value = { text: name, hyperlink: `#'${name.replace(/'/g, "''")}'!A1` };
    cell.font = { color: { argb: 'FF2563EB' }, underline: true };
    row += 1;
  });
  row += 1;
  ws.mergeCells(`A${row}:D${row}`);
  ws.getCell(`A${row}`).value = `Confidential - for the management of ${config.institute.name}. Generated ${report.generatedText}.`;
  ws.getCell(`A${row}`).font = { italic: true, size: 9, color: { argb: MUTED } };
}

// --- one section per sheet ---
// write a bold title in the first column
function writeTitle(ws, row, text, size, color = NAVY) {
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { bold: true, size, color: { argb: color } };
  return row + 1;
}

// a block as a real Excel table (filter buttons, stripes, totals)
function writeTable(ws, row, block, widths, nextTableName) {
  if (block.title) row = writeTitle(ws, row, block.title, 11, 'FF0F172A');
  if (block.rows.length === 0) {
    ws.getCell(row, 1).value = block.emptyText;
    ws.getCell(row, 1).font = { italic: true, color: { argb: MUTED } };
    return row + 2;
  }

  const used = new Set();
  // the table's columns - unique names, filter buttons, and a Total sum where the column has a total
  const columns = block.columns.map((column, index) => {
    let name = column.label || `Column ${index + 1}`;
    for (let n = 2; used.has(name); n += 1) name = `${column.label} (${n})`;
    used.add(name);
    const total = block.totals ? block.totals[index] : null;
    const column_ = { name, filterButton: true };
    if (index === 0 && block.totals) column_.totalsRowLabel = 'Total';
    else if (total && total.value !== undefined) column_.totalsRowFunction = 'sum';
    trackWidth(widths, index + 1, name);
    return column_;
  });
  // the table's cell values - real numbers and dates where we have them
  const rows = block.rows.map((cells) => cells.map((cell, index) => {
    const value = cellValue(cell, block.columns[index].format);
    trackWidth(widths, index + 1, value);
    return value;
  }));

  ws.addTable({
    name: nextTableName(),
    ref: ws.getCell(row, 1).address,
    headerRow: true,
    totalsRow: Boolean(block.totals),
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns,
    rows,
  });

  // number formats, alignment and status colours
  const lastRow = row + rows.length + (block.totals ? 1 : 0);
  block.columns.forEach((column, index) => {
    for (let r = row + 1; r <= lastRow; r += 1) {
      const cell = ws.getCell(r, index + 1);
      if (NUMBER_FORMATS[column.format]) cell.numFmt = NUMBER_FORMATS[column.format];
      if (column.align === 'right') cell.alignment = { horizontal: 'right' };
      const source = block.rows[r - row - 1];
      if (source && source[index].tone) cell.font = { bold: true, color: { argb: TONE_COLORS[source[index].tone] || NAVY } };
    }
  });
  if (block.totals) ws.getRow(lastRow).font = { bold: true };
  row = lastRow + 1;
  if (block.note) {
    ws.getCell(row, 1).value = block.note;
    ws.getCell(row, 1).font = { italic: true, size: 9, color: { argb: MUTED } };
    row += 1;
  }
  return row + 1;
}

// write one report block (table, chart data, facts, note or signature lines) and return the next free row
function writeBlock(ws, row, block, widths, nextTableName) {
  if (block.type === 'table') return writeTable(ws, row, block, widths, nextTableName);
  if (block.type === 'heading') return writeTitle(ws, row, block.text, 12);
  if (block.type === 'bars' || block.type === 'columns') {
    // chart data as a small table, ready for an Excel chart
    const format = block.format || 'number';
    return writeTable(ws, row, {
      title: block.title,
      emptyText: block.emptyText || 'No data for this period.',
      columns: [{ label: 'Item', format: 'text' }, { label: 'Value', format, align: 'right' }],
      rows: block.items.map((item) => [{ text: item.label }, { text: item.display, value: item.value }]),
      totals: null,
    }, widths, nextTableName);
  }
  if (block.type === 'facts' || block.type === 'kpis') {
    if (block.title) row = writeTitle(ws, row, block.title, 11, 'FF0F172A');
    block.items.forEach((item) => {
      const label = ws.getCell(row, 1);
      const value = ws.getCell(row, 2);
      label.value = item.label;
      label.font = { bold: true, color: { argb: MUTED } };
      value.value = item.value;
      value.alignment = { horizontal: 'left' };
      [label, value].forEach((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
      });
      trackWidth(widths, 1, item.label);
      trackWidth(widths, 2, item.value);
      row += 1;
    });
    return row + 1;
  }
  if (block.type === 'note') {
    ws.getCell(row, 1).value = block.text;
    ws.getCell(row, 1).font = { italic: true, color: { argb: MUTED } };
    return row + 2;
  }
  if (block.type === 'signatures') {
    row += 1;
    block.items.forEach((role) => {
      ws.getCell(row, 1).value = role;
      ws.getCell(row, 1).font = { bold: true };
      ws.getCell(row, 2).value = 'Name / Signature / Date';
      ws.getCell(row, 2).font = { color: { argb: MUTED } };
      ws.getCell(row, 2).border = { bottom: { style: 'thin' } };
      row += 2;
    });
    return row;
  }
  return row;
}

// Excel file bytes for a finished report
async function renderReportExcel(report) {
  // a new workbook with the institute as its author
  const workbook = new ExcelJS.Workbook();
  workbook.creator = config.institute.name;
  workbook.company = config.institute.name;
  workbook.title = `${report.title} - ${report.reportNumber}`;
  workbook.subject = report.subtitle || report.title;
  workbook.created = new Date();

  const used = new Set(['summary']);
  // one sheet per report section
  const names = report.sections.map((section, index) => sheetName(`${index + 1} ${section.title}`, used));
  buildSummary(workbook, report, names);

  let tableCount = 0;
  // Excel tables need unique names
  const nextTableName = () => {
    tableCount += 1;
    return `Table${tableCount}`;
  };

  // write each section on its own sheet
  report.sections.forEach((section, index) => {
    const ws = workbook.addWorksheet(names[index], { views: [{ showGridLines: false }] });
    printSetup(ws, report);
    const widths = {};
    let row = writeTitle(ws, 1, `${index + 1}. ${section.title}`, 14);
    if (section.intro) {
      ws.getCell(row, 1).value = section.intro;
      ws.getCell(row, 1).font = { italic: true, color: { argb: MUTED } };
      row += 1;
    }
    row += 1;
    section.blocks.forEach((block) => {
      row = writeBlock(ws, row, block, widths, nextTableName);
    });
    applyWidths(ws, widths);
    // titles and intros may run past column A without widening it
    ws.getColumn(1).width = Math.max(ws.getColumn(1).width || 10, 14);
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { renderReportExcel };
