// turns a report into a PDF with pdfmake
const fs = require('fs');
const path = require('path');
const pdfmake = require('pdfmake');
const robotoFonts = require('pdfmake/fonts/Roboto');
const config = require('../../../../../shared/server/src/config/env');
const { runInWorker } = require('../../../../../shared/server/src/utils/workerPool');

// report colours - navy, ink, muted grey, line, soft and zebra backgrounds, gold and bar blue
const NAVY = '#1e3a8a';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const SOFT = '#f4f6fb';
const ZEBRA = '#f8fafc';
const GOLD = '#c9a961';
const BAR = '#2563eb';
// status colours - green, amber, red and grey
const TONE_COLORS = { success: '#15803d', warning: '#b45309', danger: '#b91c1c', neutral: '#475569', default: NAVY };

// left and right page margin
const MARGIN_X = 40;
// A4 size in points, portrait and landscape
const PAGE = { portrait: [595.28, 841.89], landscape: [841.89, 595.28] };

// folder of the Roboto fonts - the only place the PDF code may read from
const FONT_DIR = path.dirname(robotoFonts.Roboto.normal);
// the institute logo as an embedded image
const LOGO = `data:image/jpeg;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'logo.jpeg')).toString('base64')}`;

// use the Roboto fonts
pdfmake.setFonts(robotoFonts);
// no web downloads, and only the font folder may be read from disk
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((filePath) => path.resolve(filePath).startsWith(path.resolve(FONT_DIR)));

// table lines: thin rows, no side lines - caption rows (titles) sit above the navy header
const tableLayout = {
  hLineWidth: (i, node) => (i <= node.table.headerRows ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => LINE,
  fillColor: (rowIndex, node) => {
    const captions = node.table.captionRows || 0;
    if (rowIndex < captions) return null;
    if (rowIndex === captions) return NAVY;
    if (node.table.hasTotals && rowIndex === node.table.body.length - 1) return '#e8edf7';
    return (rowIndex - captions) % 2 === 0 ? ZEBRA : null;
  },
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: (i, node) => (i < (node.table.captionRows || 0) ? 0 : 3.5),
  paddingBottom: (i, node) => (i < (node.table.captionRows || 0) ? 0 : 3.5),
};

// a table with no lines and no padding - used to lay things out side by side
const plainLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

// usable page width inside the margins
function contentWidth(orientation) {
  return PAGE[orientation][0] - MARGIN_X * 2;
}

// small label above a block
function blockTitle(text) {
  if (!text) return null;
  return { text, style: 'blockTitle' };
}

// keep with next - a section heading near the bottom of a page moves to the next page
function isStrandedHeading(node) {
  if (node.headlineLevel !== 1) return false;
  const position = node.startPosition;
  return position.pageInnerHeight * (1 - position.verticalRatio) < 130;
}

// report details box under the title
function detailsBox(report) {
  const items = [
    ['Report number', report.reportNumber],
    ['Generated on', report.generatedText],
    ['Reporting period', report.periodLabel],
    ['Prepared by', report.generatedBy],
    ...report.parameters.map((item) => [item.label, item.value]),
    ['Data source', 'Live system records'],
  ];
  const body = [];
  for (let i = 0; i < items.length; i += 2) {
    const left = items[i];
    const right = items[i + 1] || ['', ''];
    body.push([
      { text: left[0], style: 'detailLabel' },
      { text: left[1], style: 'detailValue' },
      { text: right[0], style: 'detailLabel' },
      { text: right[1], style: 'detailValue' },
    ]);
  }
  return {
    table: { widths: [78, '*', 78, '*'], body },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => '#dbe2ee',
      fillColor: () => SOFT,
      paddingLeft: (i) => (i % 2 === 0 ? 10 : 4),
      paddingRight: () => 6,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    margin: [0, 0, 0, 14],
  };
}

// smaller text for long values so tiles never wrap
function kpiFontSize(value) {
  const length = String(value).length;
  if (length <= 7) return 15;
  if (length <= 11) return 13;
  if (length <= 15) return 11.5;
  return 10;
}

// KPI tiles, a few per row
function kpiRows(items, orientation) {
  if (!items || items.length === 0) return null;
  const maxPerRow = orientation === 'landscape' ? 6 : 5;
  const rowCount = Math.ceil(items.length / maxPerRow);
  const perRow = Math.ceil(items.length / rowCount);
  const rows = [];
  for (let i = 0; i < items.length; i += perRow) {
    const slice = items.slice(i, i + perRow);
    while (slice.length < perRow) slice.push(null);
    rows.push({
      columns: slice.map((item) => {
        if (!item) return { text: '' };
        const color = TONE_COLORS[item.tone] || NAVY;
        return {
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                { text: item.label.toUpperCase(), style: 'kpiLabel' },
                { text: item.value, style: 'kpiValue', color, fontSize: kpiFontSize(item.value) },
                item.note ? { text: item.note, style: 'kpiNote' } : { text: ' ', style: 'kpiNote' },
              ],
            }]],
          },
          layout: {
            hLineWidth: (i) => (i === 0 ? 2.2 : 0),
            vLineWidth: () => 0,
            hLineColor: () => color,
            fillColor: () => SOFT,
            paddingLeft: () => 8,
            paddingRight: () => 6,
            paddingTop: () => 7,
            paddingBottom: () => 7,
          },
        };
      }),
      columnGap: 8,
      margin: [0, 0, 0, 8],
      unbreakable: true,
    });
  }
  return { stack: rows, margin: [0, 2, 0, 6] };
}

// key findings box
function findingsBox(highlights) {
  if (!highlights || highlights.length === 0) return null;
  return {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: 'KEY FINDINGS', style: 'findingsTitle' },
          { ul: highlights.map((text) => ({ text, margin: [0, 1.5, 0, 1.5] })), markerColor: GOLD, fontSize: 9, color: INK },
        ],
      }]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i) => (i === 0 ? 3 : 0),
      vLineColor: () => GOLD,
      fillColor: () => '#fdf8ec',
      paddingLeft: () => 12,
      paddingRight: () => 10,
      paddingTop: () => 9,
      paddingBottom: () => 9,
    },
    margin: [0, 4, 0, 6],
    unbreakable: true,
  };
}

// a data table - title rows, a navy header row, striped rows and an optional totals row
function tableBlock(block, caption = '') {
  if (block.rows.length === 0) {
    const empty = [
      caption ? { text: caption, style: 'subheading' } : null,
      blockTitle(block.title),
      { text: block.emptyText, style: 'empty' },
    ];
    return { stack: empty.filter(Boolean), margin: [0, 2, 0, 10], unbreakable: true };
  }
  const columnCount = block.columns.length;
  // a title row that spans the whole table
  const spanRow = (text, style) => [
    { text, style, colSpan: columnCount, margin: [-5, 0, 0, 0] },
    ...Array.from({ length: columnCount - 1 }, () => ({})),
  ];
  const captions = [];
  if (caption) captions.push(spanRow(caption, 'subheading'));
  if (block.title) captions.push(spanRow(block.title, 'blockTitle'));
  // the column headings
  const header = block.columns.map((column) => ({ text: column.label, style: 'th', alignment: column.align }));
  const body = [...captions, header];
  block.rows.forEach((row) => {
    body.push(row.map((cell, index) => ({
      text: cell.text,
      alignment: block.columns[index].align,
      noWrap: block.columns[index].nowrap,
      color: cell.tone ? TONE_COLORS[cell.tone] : INK,
      bold: Boolean(cell.tone),
    })));
  });
  if (block.totals) {
    body.push(block.totals.map((cell, index) => ({
      text: cell.text,
      alignment: block.columns[index].align,
      noWrap: block.columns[index].nowrap,
      bold: true,
      color: INK,
    })));
  }
  const parts = [{
    table: {
      headerRows: captions.length + 1,
      dontBreakRows: true,
      keepWithHeaderRows: 1,
      widths: block.columns.map((column) => column.width),
      body,
      captionRows: captions.length,
      hasTotals: Boolean(block.totals),
    },
    layout: tableLayout,
    style: 'table',
  }];
  if (block.note) parts.push({ text: block.note, style: 'tableNote' });
  return { stack: parts, margin: [0, 2, 0, 12] };
}

// horizontal bars drawn as rectangles
function barsBlock(block, width) {
  const parts = [blockTitle(block.title)];
  if (block.items.length === 0 || block.max <= 0) {
    parts.push({ text: block.emptyText, style: 'empty' });
    return { stack: parts.filter(Boolean), margin: [0, 2, 0, 10] };
  }
  const labelWidth = Math.min(170, width * 0.32);
  const valueWidth = 78;
  const barWidth = width - labelWidth - valueWidth - 16;
  // one row per item - a label, a bar and the value
  const body = block.items.map((item) => {
    const length = Math.max(1.5, (item.value / block.max) * barWidth);
    return [
      { text: item.label, fontSize: 8.5, color: INK, margin: [0, 1, 0, 0] },
      {
        canvas: [
          { type: 'rect', x: 0, y: 2, w: barWidth, h: 9, color: '#eef2f8' },
          { type: 'rect', x: 0, y: 2, w: length, h: 9, color: BAR },
        ],
      },
      { text: item.display, fontSize: 8.5, bold: true, color: INK, alignment: 'right', margin: [0, 1, 0, 0] },
    ];
  });
  parts.push({
    table: { widths: [labelWidth, barWidth, valueWidth], body, dontBreakRows: true },
    layout: { ...plainLayout, paddingTop: () => 2, paddingBottom: () => 2, paddingRight: (i) => (i < 2 ? 8 : 0) },
  });
  return { stack: parts.filter(Boolean), margin: [0, 2, 0, 12], unbreakable: block.items.length <= 25 };
}

// vertical columns for time series
function columnsBlock(block, width) {
  const parts = [blockTitle(block.title)];
  const count = block.items.length;
  if (count === 0 || block.max <= 0) {
    parts.push({ text: 'No data for this period.', style: 'empty' });
    return { stack: parts.filter(Boolean), margin: [0, 2, 0, 10] };
  }
  const chartHeight = 120;
  const cellWidth = width / count;
  const barWidth = Math.max(4, Math.min(34, cellWidth * 0.62));
  const small = count > 14;
  // the values above the columns
  const valueRow = block.items.map((item) => ({
    text: small ? '' : item.display,
    fontSize: 6.8,
    color: MUTED,
    alignment: 'center',
  }));
  // the columns themselves, scaled to the highest value
  const barRow = block.items.map((item) => {
    const height = Math.max(item.value > 0 ? 1.5 : 0, (item.value / block.max) * chartHeight);
    return {
      canvas: [
        { type: 'line', x1: 0, y1: chartHeight, x2: cellWidth, y2: chartHeight, lineWidth: 0.6, lineColor: '#cbd5e1' },
        { type: 'rect', x: (cellWidth - barWidth) / 2, y: chartHeight - height, w: barWidth, h: height, color: BAR },
      ],
    };
  });
  // the labels under the columns
  const labelRow = block.items.map((item, index) => ({
    text: small && index % Math.ceil(count / 12) !== 0 ? '' : item.label,
    fontSize: 6.8,
    color: INK,
    alignment: 'center',
  }));
  parts.push({
    table: { widths: block.items.map(() => cellWidth), body: [valueRow, barRow, labelRow] },
    layout: { ...plainLayout, paddingTop: () => 1, paddingBottom: () => 1 },
  });
  if (small) {
    // the highest column
    const peak = block.items.reduce((best, item) => (item.value > best.value ? item : best), block.items[0]);
    parts.push({ text: `Highest: ${peak.label} (${peak.display})`, style: 'tableNote' });
  }
  return { stack: parts.filter(Boolean), margin: [0, 2, 0, 12], unbreakable: true };
}

// label / value grid, two pairs per row
function factsBlock(block) {
  const parts = [blockTitle(block.title)];
  const body = [];
  for (let i = 0; i < block.items.length; i += 2) {
    const left = block.items[i];
    const right = block.items[i + 1];
    body.push([
      { text: left.label, style: 'factLabel' },
      { text: left.value, style: 'factValue' },
      { text: right ? right.label : '', style: 'factLabel' },
      { text: right ? right.value : '', style: 'factValue' },
    ]);
  }
  parts.push({
    table: { widths: [92, '*', 92, '*'], body, dontBreakRows: true },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => LINE,
      paddingLeft: () => 4,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  });
  return { stack: parts.filter(Boolean), margin: [0, 2, 0, 12], unbreakable: true };
}

// signature lines - Prepared by, Checked by, Approved by
function signaturesBlock(block) {
  return {
    columns: block.items.map((role) => ({
      stack: [
        { text: ' ', margin: [0, 26, 0, 0] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 0.7, lineColor: INK }] },
        { text: role, fontSize: 8.5, bold: true, color: INK, margin: [0, 4, 0, 0] },
        { text: 'Name / Signature / Date', fontSize: 7, color: MUTED },
      ],
    })),
    columnGap: 20,
    margin: [0, 14, 0, 8],
    unbreakable: true,
  };
}

// pick the right drawing function for a block type
function renderBlock(block, width, orientation) {
  if (block.type === 'table') return tableBlock(block);
  if (block.type === 'bars') return barsBlock(block, width);
  if (block.type === 'columns') return columnsBlock(block, width);
  if (block.type === 'facts') return factsBlock(block);
  if (block.type === 'kpis') return kpiRows(block.items, orientation);
  if (block.type === 'signatures') return signaturesBlock(block);
  if (block.type === 'note') return { text: block.text, style: 'note' };
  if (block.type === 'heading') return { text: block.text, style: 'subheading' };
  return null;
}

// blocks that are short enough to keep on one page with their sub-heading
function isSmall(block) {
  if (['facts', 'kpis', 'columns', 'note', 'signatures'].includes(block.type)) return true;
  if (block.type === 'bars') return block.items.length <= 25;
  return block.type === 'table' && block.rows.length === 0;
}

// sub-headings become part of the next block, so they never end up alone at a page bottom
function renderBlocks(blocks, width, orientation) {
  const content = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const next = blocks[i + 1];
    if (block.type === 'heading' && next && next.type === 'table') {
      content.push(tableBlock(next, block.text));
      i += 1;
    } else if (block.type === 'heading' && next) {
      const inner = renderBlock(next, width, orientation);
      content.push({ stack: [{ text: block.text, style: 'subheading' }, inner].filter(Boolean), unbreakable: isSmall(next) });
      i += 1;
    } else {
      content.push(renderBlock(block, width, orientation));
    }
  }
  return content.filter(Boolean);
}

// a section - numbered heading with a gold number and a rule, its intro, then its blocks
function sectionContent(section, index, width, orientation) {
  const heading = {
    stack: [
      {
        text: [{ text: `${index + 1}   `, color: GOLD }, { text: section.title }],
        style: 'h2',
        headlineLevel: 1,
        pageBreak: section.pageBreak ? 'before' : undefined,
      },
      { canvas: [{ type: 'line', x1: 0, y1: 3, x2: width, y2: 3, lineWidth: 0.8, lineColor: '#c7d2e5' }] },
      section.intro ? { text: section.intro, style: 'intro' } : { text: ' ', fontSize: 4 },
    ],
  };
  return [heading, ...renderBlocks(section.blocks, width, orientation)];
}

// the whole PDF - title, details box, key figures, key findings, the sections, and the page header and footer
function buildDocDefinition(report) {
  const orientation = report.orientation === 'landscape' ? 'landscape' : 'portrait';
  const width = contentWidth(orientation);
  const { institute } = config;

  const content = [
    { text: report.title, style: 'title' },
    report.subtitle ? { text: report.subtitle, style: 'subtitle' } : null,
    detailsBox(report),
    kpiRows(report.summary, orientation),
    findingsBox(report.highlights),
    ...report.sections.flatMap((section, index) => sectionContent(section, index, width, orientation)),
    { text: 'End of report', style: 'end' },
  ].filter(Boolean);

  return {
    pageSize: 'A4',
    pageOrientation: orientation,
    pageMargins: [MARGIN_X, 84, MARGIN_X, 58],
    info: {
      title: `${report.title} - ${report.reportNumber}`,
      author: institute.name,
      subject: report.subtitle || report.title,
      creator: 'Brilliant Institute Reports',
      producer: 'Brilliant Institute Reports',
    },
    header: () => ({
      margin: [MARGIN_X, 24, MARGIN_X, 0],
      stack: [
        {
          columns: [
            { image: 'logo', width: 34, height: 34 },
            {
              width: '*',
              margin: [8, 4, 0, 0],
              stack: [
                { text: 'BRILLIANT INSTITUTE', fontSize: 12.5, bold: true, color: NAVY, characterSpacing: 1.2 },
                { text: 'Brilliant Makes Brilliance  ·  Since 1982', fontSize: 7.5, color: MUTED, margin: [0, 2, 0, 0] },
              ],
            },
            {
              width: 260,
              margin: [0, 5, 0, 0],
              stack: [
                { text: report.title, fontSize: 9.5, bold: true, color: INK, alignment: 'right' },
                { text: report.reportNumber, fontSize: 7.5, color: MUTED, alignment: 'right', margin: [0, 2, 0, 0] },
              ],
            },
          ],
        },
        {
          canvas: [
            { type: 'line', x1: 0, y1: 9, x2: width, y2: 9, lineWidth: 0.8, lineColor: NAVY },
            { type: 'rect', x: 0, y: 7.5, w: 72, h: 3, color: GOLD },
          ],
        },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      margin: [MARGIN_X, 16, MARGIN_X, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.5, lineColor: LINE }] },
        {
          margin: [0, 6, 0, 0],
          columns: [
            {
              width: '*',
              text: `${institute.name}  ·  ${institute.address}  ·  ${institute.email}  ·  ${institute.phone}`,
              fontSize: 7,
              color: MUTED,
            },
            { width: 80, text: `Page ${currentPage} of ${pageCount}`, fontSize: 7.5, bold: true, color: INK, alignment: 'right' },
          ],
        },
        {
          text: `Confidential - for the management of ${institute.name}. Generated ${report.generatedText}.`,
          fontSize: 6.5,
          color: '#94a3b8',
          margin: [0, 2, 0, 0],
        },
      ],
    }),
    // keep headings with the content under them
    pageBreakBefore: isStrandedHeading,
    content,
    images: { logo: LOGO },
    defaultStyle: { font: 'Roboto', fontSize: 8.6, color: INK, lineHeight: 1.12 },
    styles: {
      title: { fontSize: 21, bold: true, color: NAVY, margin: [0, 2, 0, 0] },
      subtitle: { fontSize: 10.5, color: MUTED, margin: [0, 3, 0, 12] },
      detailLabel: { fontSize: 7.5, color: MUTED, bold: true },
      detailValue: { fontSize: 8.6, color: INK },
      kpiLabel: { fontSize: 6.8, color: MUTED, bold: true, characterSpacing: 0.4 },
      kpiValue: { fontSize: 14.5, bold: true, margin: [0, 3, 0, 1] },
      kpiNote: { fontSize: 7, color: MUTED },
      findingsTitle: { fontSize: 8, bold: true, color: '#8a6d1d', characterSpacing: 0.8, margin: [0, 0, 0, 4] },
      h2: { fontSize: 13, bold: true, color: NAVY, margin: [0, 14, 0, 0] },
      intro: { fontSize: 8.6, color: MUTED, margin: [0, 7, 0, 6] },
      blockTitle: { fontSize: 9.5, bold: true, color: INK, margin: [0, 4, 0, 5] },
      subheading: { fontSize: 11, bold: true, color: NAVY, margin: [0, 10, 0, 4] },
      th: { fontSize: 7.8, bold: true, color: '#ffffff' },
      table: { fontSize: 8 },
      tableNote: { fontSize: 7.5, italics: true, color: MUTED, margin: [0, 4, 0, 0] },
      empty: { fontSize: 8.5, italics: true, color: MUTED, margin: [0, 0, 0, 4] },
      factLabel: { fontSize: 7.8, color: MUTED, bold: true },
      factValue: { fontSize: 8.6, color: INK },
      note: { fontSize: 8, italics: true, color: MUTED, margin: [0, 0, 0, 10] },
      end: { fontSize: 8, color: '#94a3b8', alignment: 'center', margin: [0, 18, 0, 0], characterSpacing: 2 },
    },
  };
}

// PDF bytes for a finished report
async function renderReportPdf(report) {
  const doc = pdfmake.createPdf(buildDocDefinition(report));
  return doc.getBuffer();
}

// the same, built on a worker thread so other people's pages stay fast
function renderReportPdfInWorker(report) {
  return runInWorker(__filename, 'renderReportPdf', [report]);
}

module.exports = { renderReportPdf, renderReportPdfInWorker };
