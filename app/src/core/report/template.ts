// SPEC-030 / DESIGN-030 — Financial Report PDF template (HTML/CSS).
//
// `buildReportHtml(model)` returns a SELF-CONTAINED HTML document (inlined CSS,
// inlined logo data: URL, NO scripts, NO remote resources) that main loads into
// an offscreen sandboxed BrowserWindow and renders via `webContents.printToPDF`.
//
// CSP-safe by construction: a strict `<meta>` CSP allows only inline styles and
// data: images; everything else is denied. The function is PURE (no fs/electron)
// so the assembled regions are unit-tested directly from a fixture model.
//
// Design rules honoured (DESIGN-030 §4/§5, Mouse QA):
//   - A4 portrait, 18mm top/bottom + 20mm left/right print margins.
//   - Amount columns use `tabular-nums` + right-align (NOT fixed widths).
//   - Subcategory indent is applied to the LABEL cell only — it never shifts the
//     amount column.
//   - Logo height/width capped (≤56px tall) so an oversized asset can't blow out
//     the header lockup.
//   - Grayscale-safe: credit/debit meaning is carried by the `−` prefix, column,
//     and position — never by colour alone. `print-color-adjust: exact` keeps the
//     subtle fills when the user prints in colour.
//   - `break-inside: avoid` on rows / reconciliation / signatures; TOTAL rows are
//     kept with their table so a long category list page-breaks gracefully.

import type {
  ReportLineItem,
  ReportModel,
  ReportTable,
} from '../../shared/ipc-contracts/report.js';
import { formatEuroAmount } from './format.js';
import { reportCopy } from './copy.js';

// Design tokens (docs/design/tokens.md) inlined — the PDF is rendered in an
// isolated context with no access to the app stylesheet.
const TOKENS = {
  textPrimary: '#1a1420',
  textSecondary: '#433a4e',
  textMuted: '#645872',
  accent: '#6d4d8c',
  accentSubtle: '#ede4f2',
  success: '#1e7a2c',
  danger: '#b81f1f',
  surfaceSecondary: '#f4eef8',
  borderDefault: '#e1d6ea',
  borderSubtle: '#ede4f2',
  borderStrong: '#b8a6ca',
} as const;

const INDENT_GLYPH = '\u21B3'; // ↳

function esc(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function renderLineRow(item: ReportLineItem, signMinus: boolean): string {
  const amount = esc(formatEuroAmount(item.amount, { sign: signMinus ? 'minus' : 'none' }));
  return `<tr class="line"><td class="label">${esc(item.label)}</td><td class="amt">${amount}</td></tr>`;
}

function renderSubRows(item: ReportLineItem, signMinus: boolean): string {
  if (!item.subRows || item.subRows.length === 0) return '';
  return item.subRows
    .map((sub) => {
      const amount = esc(formatEuroAmount(sub.amount, { sign: signMinus ? 'minus' : 'none' }));
      return `<tr class="subline"><td class="label sub"><span class="indent">${INDENT_GLYPH}</span>${esc(sub.label)}</td><td class="amt">${amount}</td></tr>`;
    })
    .join('');
}

function renderTable(
  caption: string,
  table: ReportTable,
  totalLabel: string,
  signMinus: boolean,
): string {
  const body =
    table.rows.length > 0
      ? table.rows
          .map((item) => renderLineRow(item, signMinus) + renderSubRows(item, signMinus))
          .join('')
      : '<tr class="line empty"><td class="label" colspan="2">—</td></tr>';

  const total = esc(formatEuroAmount(table.total, { sign: signMinus ? 'minus' : 'none' }));

  return `
    <section class="block">
      <h2 class="caption">${esc(caption)}</h2>
      <table class="ledger">
        <tbody>${body}</tbody>
        <tfoot>
          <tr class="total"><td class="label">${esc(totalLabel)}</td><td class="amt">${total}</td></tr>
        </tfoot>
      </table>
    </section>`;
}

function renderReconciliation(model: ReportModel): string {
  const copy = reportCopy(model.locale);
  const r = model.reconciliation;
  const row = (label: string, value: string, cls = ''): string =>
    `<tr class="${cls}"><td class="label">${esc(label)}</td><td class="amt">${esc(value)}</td></tr>`;

  // Net internal transfers are 0 in consolidated scope — omit the line rather
  // than print a meaningless "±0,00". Per-account they carry real cash and the
  // closing balance would not otherwise tie out, so the line is mandatory.
  const transfersRow =
    r.internalTransfersNet === 0
      ? ''
      : row(
          copy.internalTransfersLineLabel,
          formatEuroAmount(r.internalTransfersNet, {
            sign: r.internalTransfersNet < 0 ? 'minus' : 'plus',
          }),
        );

  return `
    <section class="block recon" >
      <h2 class="caption">${esc(copy.reconciliationCaption)}</h2>
      <table class="ledger recon-table">
        <tbody>
          ${row(model.locale === 'es' ? 'Saldo inicial' : 'Opening balance', formatEuroAmount(r.opening))}
          ${row(copy.creditsLineLabel, formatEuroAmount(r.credits, { sign: 'plus' }))}
          ${row(copy.debitsLineLabel, formatEuroAmount(r.debits, { sign: 'minus' }))}
          ${transfersRow}
          ${row(model.locale === 'es' ? 'Saldo final' : 'Closing balance', formatEuroAmount(r.closing), 'closing')}
        </tbody>
      </table>
    </section>`;
}

function renderSignatureColumn(
  caption: string,
  signatory: { name: string; role: string; place: string },
): string {
  const place = signatory.place ? esc(signatory.place) : '';
  return `
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-caption">${esc(caption)}</div>
      <div class="sig-name">${esc(signatory.name)}</div>
      <div class="sig-role">${esc(signatory.role)}</div>
      <div class="sig-place">${place}</div>
    </div>`;
}

function renderHeader(model: ReportModel): string {
  const h = model.header;
  const logo = h.logoDataUrl ? `<img class="logo" src="${esc(h.logoDataUrl)}" alt="" />` : '';
  const contact = [h.address, h.contactEmail].filter((s) => s.trim().length > 0);
  return `
    <header class="report-header">
      <div class="brand">
        ${logo}
        <div class="brand-text">
          <div class="org-name">${esc(h.orgName)}</div>
          <div class="org-legal">${esc(h.legalRegistrationLine)}</div>
          <div class="org-contact">${esc(contact.join(' · '))}</div>
        </div>
      </div>
      <div class="title-block">
        <h1 class="report-title">${esc(h.title)}</h1>
        <div class="period">${esc(h.periodLabel)}</div>
        <div class="scope">${esc(model.scopeLabel)}</div>
        <div class="generated">${esc(h.generatedLabel)}</div>
      </div>
    </header>
    <div class="accent-rule"></div>`;
}

const STYLE = `
  @page { size: A4 portrait; margin: 18mm 20mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: ${TOKENS.textPrimary};
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    font-size: 11px; line-height: 1.4;
  }
  .report-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .brand { display: flex; align-items: flex-start; gap: 12px; max-width: 60%; }
  .logo { max-height: 56px; max-width: 180px; height: auto; width: auto; object-fit: contain; }
  .org-name { font-size: 15px; font-weight: 700; color: ${TOKENS.textPrimary}; }
  .org-legal { font-size: 10px; color: ${TOKENS.textSecondary}; margin-top: 2px; }
  .org-contact { font-size: 10px; color: ${TOKENS.textMuted}; margin-top: 2px; white-space: pre-line; }
  .title-block { text-align: right; max-width: 40%; }
  .report-title { font-size: 20px; font-weight: 700; margin: 0; color: ${TOKENS.accent}; }
  .period { font-size: 11px; color: ${TOKENS.textSecondary}; margin-top: 4px; }
  .scope { font-size: 10px; color: ${TOKENS.textMuted}; margin-top: 2px; }
  .generated { font-size: 9px; color: ${TOKENS.textMuted}; margin-top: 2px; }
  .accent-rule { height: 1.5px; background: ${TOKENS.accent}; margin: 10px 0 16px; }
  .block { margin-bottom: 16px; break-inside: auto; }
  .caption { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: ${TOKENS.accent};
    margin: 0 0 6px; text-transform: uppercase; }
  table.ledger { width: 100%; border-collapse: collapse; }
  table.ledger td { padding: 4px 0; vertical-align: top; }
  table.ledger .label { text-align: left; color: ${TOKENS.textPrimary}; padding-right: 16px; }
  table.ledger .amt {
    text-align: right; white-space: nowrap;
    font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1;
    color: ${TOKENS.textPrimary};
  }
  tr.line, tr.subline, tr.total, tr.closing { break-inside: avoid; }
  tr.line > td { border-bottom: 1px solid ${TOKENS.borderSubtle}; }
  tr.subline > td { border-bottom: 1px solid ${TOKENS.borderSubtle}; color: ${TOKENS.textSecondary}; }
  td.label.sub { padding-left: 20px; color: ${TOKENS.textSecondary}; }
  td.label.sub .indent { color: ${TOKENS.textMuted}; margin-right: 6px; }
  tr.subline .amt { color: ${TOKENS.textSecondary}; }
  tr.total > td { border-top: 1.5px solid ${TOKENS.borderStrong}; padding-top: 6px;
    font-weight: 700; }
  tr.empty td { color: ${TOKENS.textMuted}; text-align: center; }
  section.recon { break-inside: avoid; border: 1px solid ${TOKENS.borderDefault};
    border-radius: 6px; padding: 12px 14px; background: ${TOKENS.surfaceSecondary}; }
  .recon-table td { padding: 5px 0; }
  .recon-table tr.closing > td { border-top: 2px double ${TOKENS.borderStrong};
    padding-top: 8px; margin-top: 4px; font-weight: 700; font-size: 13px;
    background: ${TOKENS.accentSubtle}; }
  .signatures { display: flex; justify-content: space-between; gap: 48px;
    margin-top: 48px; break-inside: avoid; }
  .sig-col { flex: 1; }
  .sig-line { border-top: 1px solid ${TOKENS.borderStrong}; margin-bottom: 6px; }
  .sig-caption { font-size: 10px; font-weight: 700; color: ${TOKENS.accent};
    text-transform: uppercase; letter-spacing: 0.04em; }
  .sig-name { font-size: 11px; font-weight: 600; margin-top: 4px; }
  .sig-role { font-size: 10px; color: ${TOKENS.textSecondary}; }
  .sig-place { font-size: 10px; color: ${TOKENS.textMuted}; margin-top: 2px; }
`;

export function buildReportHtml(model: ReportModel): string {
  const copy = reportCopy(model.locale);
  const lang = model.locale === 'es' ? 'es' : 'en';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';" />
<title>${esc(model.header.title)}</title>
<style>${STYLE}</style>
</head>
<body>
${renderHeader(model)}
${renderTable(copy.creditsCaption, model.credits, copy.totalLabel, false)}
${renderTable(copy.debitsCaption, model.debits, copy.totalLabel, true)}
${renderReconciliation(model)}
<footer class="signatures">
${renderSignatureColumn(copy.signatureTreasurer, model.signatures.treasurer)}
${renderSignatureColumn(copy.signatureAuditor, model.signatures.auditor)}
</footer>
</body>
</html>`;
}
