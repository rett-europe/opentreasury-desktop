import { useTranslation } from 'react-i18next';
import { Star, VolumeX, Check } from 'lucide-react';

export interface ConfirmHeaderRowProps {
  readonly detectedHeaderRow: number;
  readonly headerRow: number;
  readonly previewRows: string[][];
  readonly onHeaderRowChange: (row: number) => void;
  readonly maxRow?: number;
  readonly disabled?: boolean;
}

const MIN_ROW = 1;
const DEFAULT_MAX_ROW = 20;

function isRowEmpty(row: string[] | undefined): boolean {
  if (!row) return true;
  return row.every((cell) => !cell || cell.trim() === '');
}

export function ConfirmHeaderRow({
  detectedHeaderRow,
  headerRow,
  previewRows,
  onHeaderRowChange,
  maxRow = DEFAULT_MAX_ROW,
  disabled = false,
}: ConfirmHeaderRowProps): JSX.Element {
  const { t } = useTranslation('common');
  const upperBound = Math.min(maxRow, Math.max(previewRows.length, MIN_ROW));

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const next = Number.parseInt(event.target.value, 10);
    if (Number.isNaN(next)) return;
    const clamped = Math.min(upperBound, Math.max(MIN_ROW, next));
    if (clamped !== headerRow) {
      onHeaderRowChange(clamped);
    }
  };

  const maxColumns = previewRows.reduce((max, row) => Math.max(max, row.length), 0);

  return (
    <div className="ot-import-wizard__step ot-confirm-header-row">
      <h2>{t('importWizard.confirmHeaderRow.title')}</h2>
      <p className="ot-import-wizard__subtitle">
        {t('importWizard.confirmHeaderRow.detected', { row: detectedHeaderRow })}{' '}
        {t('importWizard.confirmHeaderRow.notRight')}
      </p>

      <div className="ot-confirm-header-row__control">
        <label className="ot-confirm-header-row__label" htmlFor="ot-confirm-header-row-input">
          {t('importWizard.confirmHeaderRow.label')}
        </label>
        <input
          id="ot-confirm-header-row-input"
          type="number"
          min={MIN_ROW}
          max={upperBound}
          value={headerRow}
          disabled={disabled}
          onChange={handleChange}
          className="ot-confirm-header-row__input"
        />
      </div>

      <h3 className="ot-confirm-header-row__preview-heading">
        {t('importWizard.confirmHeaderRow.preview')}
      </h3>
      <div
        className="ot-confirm-header-row__table-wrap"
        role="region"
        aria-label={t('importWizard.confirmHeaderRow.preview')}
        tabIndex={0}
      >
        <table className="ot-import-wizard__preview-table ot-confirm-header-row__table">
          <thead>
            <tr>
              <th scope="col" className="ot-confirm-header-row__row-num">
                #
              </th>
              {Array.from({ length: maxColumns }).map((_, idx) => (
                <th key={idx} scope="col">{`Col ${idx + 1}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, idx) => {
              const rowNumber = idx + 1;
              const isHeader = rowNumber === headerRow;
              const isSkipped = rowNumber < headerRow;
              const isData = rowNumber > headerRow;
              const empty = isRowEmpty(row);
              const className = [
                'ot-confirm-header-row__row',
                isHeader ? 'ot-confirm-header-row__row--header' : '',
                isSkipped ? 'ot-confirm-header-row__row--skipped' : '',
                isData ? 'ot-confirm-header-row__row--data' : '',
              ]
                .filter(Boolean)
                .join(' ');

              const marker = isHeader ? (
                <span
                  aria-label={t('importWizard.confirmHeaderRow.header')}
                  title={t('importWizard.confirmHeaderRow.header')}
                >
                  <Star size={14} aria-hidden="true" />
                </span>
              ) : isSkipped ? (
                <span
                  aria-label={t('importWizard.confirmHeaderRow.skipped')}
                  title={t('importWizard.confirmHeaderRow.skipped')}
                >
                  <VolumeX size={14} aria-hidden="true" />
                </span>
              ) : (
                <span
                  aria-label={t('importWizard.confirmHeaderRow.data')}
                  title={t('importWizard.confirmHeaderRow.data')}
                >
                  <Check size={14} aria-hidden="true" />
                </span>
              );

              return (
                <tr
                  key={rowNumber}
                  className={className}
                  aria-current={isHeader ? 'true' : undefined}
                  data-testid={`confirm-header-row-${rowNumber}`}
                >
                  <th scope="row" className="ot-confirm-header-row__row-num">
                    <span className="ot-confirm-header-row__marker">{marker}</span>
                    <span>{rowNumber}</span>
                  </th>
                  {empty ? (
                    <td colSpan={Math.max(1, maxColumns)} className="ot-confirm-header-row__empty">
                      {t('importWizard.confirmHeaderRow.empty')}
                    </td>
                  ) : (
                    Array.from({ length: maxColumns }).map((_, colIdx) => (
                      <td key={colIdx}>{row[colIdx] ?? ''}</td>
                    ))
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
