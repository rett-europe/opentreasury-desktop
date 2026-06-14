import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../format/index.js';
import type {
  ReportModel,
  ReportTable,
  ReportSignatory,
} from '../../../shared/ipc-contracts/report.js';
import './ReportPreview.css';

export interface ReportPreviewProps {
  readonly model: ReportModel;
}

/**
 * SPEC-030 (Design §10) — on-screen preview of the aggregate-only
 * {@link ReportModel}. This is a passive WYSIWYG view: it never computes any
 * total, it only renders the figures main already aggregated (FR12). The same
 * top-to-bottom order as the PDF — header → Credits → Debits → reconciliation →
 * signatures — and the same shared amount right-edge (`tabular-nums`,
 * right-aligned amount column).
 *
 * Amounts in the model are POSITIVE magnitudes (see the WI-2 contract / report
 * handler); the sign presentation lives here: debit rows render with a leading
 * minus, the reconciliation credits/debits lines render with explicit ± so the
 * arithmetic reads at a glance and colour is never the sole channel (§4.6).
 */
export function ReportPreview({ model }: ReportPreviewProps): JSX.Element {
  const { t } = useTranslation('common');
  const { formatCurrency } = useFormatters();

  const fmt = (amount: number): string => formatCurrency(Math.abs(amount));
  const debit = (amount: number): string => `−\u00A0${fmt(amount)}`;
  const signed = (amount: number, sign: '+' | '−'): string => `${sign}\u00A0${fmt(amount)}`;

  const { header, credits, debits, reconciliation, signatures, grouping } = model;
  const showSubRows = grouping === 'category-subcategory';

  return (
    <article className="ot-report-preview" aria-label={t('report.preview.ariaLabel')}>
      {/* ── Header lockup ─────────────────────────────────── */}
      <header className="ot-report-preview__header">
        <div className="ot-report-preview__brand">
          {header.logoDataUrl ? (
            <img
              className="ot-report-preview__logo"
              src={header.logoDataUrl}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          <div className="ot-report-preview__org">
            <h2 className="ot-report-preview__org-name">{header.orgName}</h2>
            <p className="ot-report-preview__org-line">{header.legalRegistrationLine}</p>
            <p className="ot-report-preview__org-line">{header.address}</p>
            <p className="ot-report-preview__org-line">{header.contactEmail}</p>
          </div>
        </div>
        <div className="ot-report-preview__meta">
          <h1 className="ot-report-preview__title">{header.title}</h1>
          <p className="ot-report-preview__period">{header.periodLabel}</p>
          <p className="ot-report-preview__generated">{header.generatedLabel}</p>
          <p className="ot-report-preview__scope">{model.scopeLabel}</p>
        </div>
      </header>

      <hr className="ot-report-preview__rule" />

      {/* ── Credits table ─────────────────────────────────── */}
      <ReportTableBlock
        caption={t('report.preview.credits')}
        table={credits}
        showSubRows={showSubRows}
        totalLabel={t('report.preview.total')}
        renderAmount={fmt}
        tone="credit"
      />

      {/* ── Debits table ──────────────────────────────────── */}
      <ReportTableBlock
        caption={t('report.preview.debits')}
        table={debits}
        showSubRows={showSubRows}
        totalLabel={t('report.preview.total')}
        renderAmount={debit}
        tone="debit"
      />

      {/* ── Reconciliation box ────────────────────────────── */}
      <section
        className="ot-report-preview__reconciliation"
        aria-label={t('report.preview.reconciliation')}
      >
        <h3 className="ot-report-preview__caption">{t('report.preview.reconciliation')}</h3>
        <dl className="ot-report-preview__recon-list">
          <div className="ot-report-preview__recon-row">
            <dt>{t('report.preview.opening')}</dt>
            <dd className="ot-report-preview__amount">{fmt(reconciliation.opening)}</dd>
          </div>
          <div className="ot-report-preview__recon-row">
            <dt>{t('report.preview.creditsLine')}</dt>
            <dd className="ot-report-preview__amount ot-report-preview__amount--credit">
              {signed(reconciliation.credits, '+')}
            </dd>
          </div>
          <div className="ot-report-preview__recon-row">
            <dt>{t('report.preview.debitsLine')}</dt>
            <dd className="ot-report-preview__amount ot-report-preview__amount--debit">
              {signed(reconciliation.debits, '−')}
            </dd>
          </div>
          <div className="ot-report-preview__recon-row ot-report-preview__recon-row--closing">
            <dt>{t('report.preview.closing')}</dt>
            <dd className="ot-report-preview__amount">{fmt(reconciliation.closing)}</dd>
          </div>
        </dl>
      </section>

      {/* ── Signature footer ──────────────────────────────── */}
      <section
        className="ot-report-preview__signatures"
        aria-label={t('report.preview.signatures')}
      >
        <SignatureBlock label={t('report.preview.treasurer')} signatory={signatures.treasurer} />
        <SignatureBlock label={t('report.preview.auditor')} signatory={signatures.auditor} />
      </section>
    </article>
  );
}

interface ReportTableBlockProps {
  readonly caption: string;
  readonly table: ReportTable;
  readonly showSubRows: boolean;
  readonly totalLabel: string;
  readonly renderAmount: (amount: number) => string;
  readonly tone: 'credit' | 'debit';
}

function ReportTableBlock({
  caption,
  table,
  showSubRows,
  totalLabel,
  renderAmount,
  tone,
}: ReportTableBlockProps): JSX.Element {
  const amountToneClass =
    tone === 'credit' ? 'ot-report-preview__amount--credit' : 'ot-report-preview__amount--debit';

  return (
    <section className="ot-report-preview__table-block">
      <h3 className="ot-report-preview__caption">{caption}</h3>
      <table className="ot-report-preview__table">
        <tbody>
          {table.rows.map((row, idx) => (
            // Line-item labels are not guaranteed unique, so the stable key is
            // the row index within this aggregate (the model order is fixed).
            <Fragment key={`row-${idx}`}>
              <tr className="ot-report-preview__row">
                <td className="ot-report-preview__label">{row.label}</td>
                <td className={`ot-report-preview__amount ${amountToneClass}`}>
                  {renderAmount(row.amount)}
                </td>
              </tr>
              {showSubRows
                ? (row.subRows ?? []).map((sub, subIdx) => (
                    <tr
                      key={`row-${idx}-sub-${subIdx}`}
                      className="ot-report-preview__row ot-report-preview__row--sub"
                    >
                      <td className="ot-report-preview__label ot-report-preview__label--sub">
                        <span aria-hidden="true">↳ </span>
                        {sub.label}
                      </td>
                      <td className={`ot-report-preview__amount ${amountToneClass}`}>
                        {renderAmount(sub.amount)}
                      </td>
                    </tr>
                  ))
                : null}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="ot-report-preview__row ot-report-preview__row--total">
            <td className="ot-report-preview__label">{totalLabel}</td>
            <td className={`ot-report-preview__amount ${amountToneClass}`}>
              {renderAmount(table.total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

interface SignatureBlockProps {
  readonly label: string;
  readonly signatory: ReportSignatory;
}

function SignatureBlock({ label, signatory }: SignatureBlockProps): JSX.Element {
  return (
    <div className="ot-report-preview__signature">
      <span className="ot-report-preview__sig-eyebrow">{label}</span>
      <span className="ot-report-preview__sig-rule" aria-hidden="true" />
      <span className="ot-report-preview__sig-name">{signatory.name}</span>
      <span className="ot-report-preview__sig-role">{signatory.role}</span>
      <span className="ot-report-preview__sig-place">{signatory.place}</span>
    </div>
  );
}
