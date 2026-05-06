import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ArrowLeft, Upload, FileSpreadsheet, Check, AlertCircle, Wallet } from 'lucide-react';
import { Button } from '../Button/index.js';
import { EmptyState } from '../EmptyState/index.js';
import { ConfirmHeaderRow } from './ConfirmHeaderRow.js';
import { listAccounts } from '../../services/accountsApi.js';
import * as importApi from '../../services/importApi.js';
import type { AccountRecord } from '../../types/config.js';
import type { DryRunResponse, ColumnMapping } from '../../../shared/ipc-contracts/import.js';

type SheetMetadata = {
  name: string;
  columnHeaders: string[];
  rowCount: number;
  detectedHeaderRow?: number;
  previewRows?: string[][];
};
import './ImportWizard.css';

type Step =
  | 'selectAccount'
  | 'uploadFile'
  | 'confirmHeaderRow'
  | 'pickSheet'
  | 'mapColumns'
  | 'dryRun'
  | 'done';

interface WizardState {
  step: Step;
  accountId: string | null;
  accountName: string | null;
  fileId: string | null;
  filePath: string | null;
  fileName: string | null;
  sheets: SheetMetadata[];
  selectedSheet: string | null;
  columnHeaders: string[];
  headerRow: number | null;
  detectedHeaderRow: number | null;
  previewRows: string[][];
  columnMapping: Partial<ColumnMapping>;
  lastMapping: ColumnMapping | null;
  dryRunResult: DryRunResponse | null;
  importDuplicates: boolean;
  autoCreateUnknownTaxonomy: boolean;
  importedCount: number;
  skippedCount: number;
  error: string | null;
}

const INITIAL_STATE: WizardState = {
  step: 'selectAccount',
  accountId: null,
  accountName: null,
  fileId: null,
  filePath: null,
  fileName: null,
  sheets: [],
  selectedSheet: null,
  columnHeaders: [],
  headerRow: null,
  detectedHeaderRow: null,
  previewRows: [],
  columnMapping: {},
  lastMapping: null,
  dryRunResult: null,
  importDuplicates: false,
  autoCreateUnknownTaxonomy: true,
  importedCount: 0,
  skippedCount: 0,
  error: null,
};

export interface ImportWizardProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onComplete: () => void;
}

export function ImportWizard({ isOpen, onClose, onComplete }: ImportWizardProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelConfirmRef = useRef<HTMLDialogElement>(null);
  const cancelConfirmTitleId = useId();
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      void loadAccounts();
    } else if (!isOpen && dialog.open) {
      dialog.close();
      setState(INITIAL_STATE);
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancelEvent = (e: Event): void => {
      e.preventDefault();
      handleClose();
    };
    const handleClickEvent = (e: MouseEvent): void => {
      if (e.target === dialog) handleClose();
    };
    dialog.addEventListener('cancel', handleCancelEvent);
    dialog.addEventListener('click', handleClickEvent);
    return () => {
      dialog.removeEventListener('cancel', handleCancelEvent);
      dialog.removeEventListener('click', handleClickEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAccounts = async () => {
    try {
      const resp = await listAccounts();
      setAccounts(resp.accounts);
    } catch (err) {
      setState((s) => ({ ...s, error: 'Failed to load accounts' }));
    }
  };

  const handleClose = () => {
    if (state.step !== 'selectAccount' && state.step !== 'done') {
      setShowCancelConfirm(true);
      return;
    }
    onClose();
  };

  const handleConfirmDiscard = useCallback(() => {
    setShowCancelConfirm(false);
    onClose();
  }, [onClose]);

  const handleStayInWizard = useCallback(() => {
    setShowCancelConfirm(false);
  }, []);

  useEffect(() => {
    const dialog = cancelConfirmRef.current;
    if (!dialog) return;
    if (showCancelConfirm && !dialog.open) {
      dialog.showModal();
    } else if (!showCancelConfirm && dialog.open) {
      dialog.close();
    }
  }, [showCancelConfirm]);

  useEffect(() => {
    const dialog = cancelConfirmRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
      handleStayInWizard();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [handleStayInWizard]);

  const handleBack = () => {
    setState((s) => {
      if (s.step === 'uploadFile') return { ...s, step: 'selectAccount' };
      if (s.step === 'confirmHeaderRow')
        return { ...s, step: s.sheets.length > 1 ? 'pickSheet' : 'uploadFile' };
      if (s.step === 'pickSheet') return { ...s, step: 'uploadFile' };
      if (s.step === 'mapColumns') return { ...s, step: 'confirmHeaderRow' };
      if (s.step === 'dryRun') return { ...s, step: 'mapColumns' };
      return s;
    });
  };

  const handleSelectAccount = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    setState((s) => ({ ...s, accountId, accountName: account.name, step: 'uploadFile' }));
  };

  const handlePickAndLoadFile = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await window.opentreasury.dialog.pickImportFile();
      if (!result.ok) {
        setState((s) => ({ ...s, error: result.error }));
        return;
      }
      if (result.cancelled || !result.path) {
        return;
      }
      const filePath = result.path;
      const fileName = filePath.split(/[\\/]/).pop() || 'unknown';
      const resp = await importApi.stageFile({ filePath });
      if (!resp.ok) {
        setState((s) => ({ ...s, error: t(`importWizard.errors.${resp.error.code}`) }));
        return;
      }
      const firstSheet = resp.sheets[0];
      const detected = firstSheet?.detectedHeaderRow ?? 1;
      setState((s) => ({
        ...s,
        fileId: resp.fileId,
        filePath,
        fileName,
        sheets: resp.sheets,
        step: resp.sheets.length > 1 ? 'pickSheet' : 'confirmHeaderRow',
        selectedSheet: firstSheet?.name ?? null,
        columnHeaders: firstSheet?.columnHeaders ?? [],
        detectedHeaderRow: detected,
        headerRow: detected,
        previewRows: firstSheet?.previewRows ?? [],
        error: null,
      }));
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderRowChange = async (nextRow: number) => {
    if (!state.filePath) return;
    setState((s) => ({ ...s, headerRow: nextRow }));
    setLoading(true);
    try {
      const resp = await importApi.stageFile({ filePath: state.filePath, headerRow: nextRow });
      if (!resp.ok) {
        setState((s) => ({ ...s, error: t(`importWizard.errors.${resp.error.code}`) }));
        return;
      }
      const sheet = resp.sheets.find((sh) => sh.name === state.selectedSheet) ?? resp.sheets[0];
      setState((s) => ({
        ...s,
        fileId: resp.fileId,
        sheets: resp.sheets,
        selectedSheet: sheet?.name ?? s.selectedSheet,
        columnHeaders: sheet?.columnHeaders ?? [],
        previewRows: sheet?.previewRows ?? s.previewRows,
        error: null,
      }));
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmHeaderRow = () => {
    setState((s) => ({
      ...s,
      step: 'mapColumns',
    }));
  };

  const handleSelectSheet = (sheetName: string) => {
    const sheet = state.sheets.find((s: SheetMetadata) => s.name === sheetName);
    if (!sheet) return;
    setState((s) => ({
      ...s,
      selectedSheet: sheetName,
      columnHeaders: sheet.columnHeaders,
      previewRows: sheet.previewRows ?? s.previewRows,
      detectedHeaderRow: sheet.detectedHeaderRow ?? s.detectedHeaderRow,
      headerRow: sheet.detectedHeaderRow ?? s.headerRow,
      step: 'confirmHeaderRow',
    }));
  };

  const handleMapColumn = (sourceCol: string, targetField: string) => {
    setState((s) => {
      const next: Partial<ColumnMapping> = {};
      for (const [field, mappedCol] of Object.entries(s.columnMapping)) {
        if (mappedCol !== undefined && mappedCol !== sourceCol) {
          next[field as keyof ColumnMapping] = mappedCol;
        }
      }
      if (targetField !== '') {
        next[targetField as keyof ColumnMapping] = sourceCol;
      }
      return { ...s, columnMapping: next };
    });
  };

  const isMappingComplete = (): boolean => {
    return !!(
      state.columnMapping.date &&
      state.columnMapping.amount &&
      state.columnMapping.description
    );
  };

  const handleDryRun = async () => {
    if (!state.fileId || !state.accountId || !isMappingComplete() || state.headerRow === null)
      return;
    setLoading(true);
    try {
      const resp = await importApi.dryRun({
        fileId: state.fileId,
        sheetName: state.selectedSheet || undefined,
        accountId: state.accountId,
        columnMapping: state.columnMapping as ColumnMapping,
        importDuplicates: state.importDuplicates,
        headerRow: state.headerRow,
        autoCreateUnknownTaxonomy: state.autoCreateUnknownTaxonomy,
      });
      if (!resp.ok) {
        setState((s) => ({ ...s, error: t(`importWizard.errors.${resp.error.code}`) }));
        return;
      }
      setState((s) => ({ ...s, dryRunResult: resp, step: 'dryRun', error: null }));
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!state.fileId || !state.accountId || !isMappingComplete() || state.headerRow === null)
      return;
    setLoading(true);
    try {
      const resp = await importApi.commit({
        fileId: state.fileId,
        sheetName: state.selectedSheet || undefined,
        accountId: state.accountId,
        columnMapping: state.columnMapping as ColumnMapping,
        importDuplicates: state.importDuplicates,
        confirmed: true,
        headerRow: state.headerRow,
        autoCreateUnknownTaxonomy: state.autoCreateUnknownTaxonomy,
      });
      if (!resp.ok) {
        setState((s) => ({ ...s, error: t(`importWizard.errors.${resp.error.code}`) }));
        return;
      }
      setState((s) => ({
        ...s,
        importedCount: resp.importedCount,
        skippedCount: resp.skippedCount,
        step: 'done',
        error: null,
      }));
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
    } finally {
      setLoading(false);
    }
  };

  const renderStep = (): ReactNode => {
    switch (state.step) {
      case 'selectAccount':
        if (accounts.length === 0) {
          return (
            <div className="ot-import-wizard__step">
              <EmptyState
                icon={<Wallet size={32} aria-hidden="true" />}
                title={t('importWizard.noAccounts.title')}
                body={t('importWizard.noAccounts.body')}
                actions={
                  <Button variant="primary" onClick={onClose}>
                    {t('importWizard.noAccounts.cta')}
                  </Button>
                }
              />
            </div>
          );
        }
        return (
          <div className="ot-import-wizard__step">
            <h2>{t('importWizard.selectAccount.heading')}</h2>
            <p className="ot-import-wizard__subtitle">{t('importWizard.selectAccount.subtitle')}</p>
            <div className="ot-import-wizard__accounts">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  className="ot-import-wizard__account-card"
                  onClick={() => handleSelectAccount(acc.id)}
                >
                  <div className="ot-import-wizard__account-name">{acc.name}</div>
                  {acc.bankName ? (
                    <div className="ot-import-wizard__account-bank">{acc.bankName}</div>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        );
      case 'uploadFile':
        return (
          <div className="ot-import-wizard__step">
            <h2>{t('importWizard.uploadFile.heading')}</h2>
            <p className="ot-import-wizard__subtitle">
              {t('importWizard.uploadFile.destination', { accountName: state.accountName })}
            </p>
            <button
              type="button"
              className={`ot-import-wizard__dropzone${loading ? ' ot-import-wizard__dropzone--opening' : ''}`}
              onClick={handlePickAndLoadFile}
              disabled={loading}
              aria-busy={loading ? true : undefined}
            >
              {loading ? (
                <>
                  <span className="ot-import-wizard__dropzone-spinner" aria-hidden="true" />
                  <span>{t('importWizard.uploadFile.opening')}</span>
                </>
              ) : (
                <>
                  <Upload size={32} />
                  <span>{t('importWizard.uploadFile.dropzone')}</span>
                </>
              )}
            </button>
            {state.fileName ? (
              <p className="ot-import-wizard__file-name">{state.fileName}</p>
            ) : null}
          </div>
        );
      case 'confirmHeaderRow':
        return (
          <ConfirmHeaderRow
            detectedHeaderRow={state.detectedHeaderRow ?? 1}
            headerRow={state.headerRow ?? state.detectedHeaderRow ?? 1}
            previewRows={state.previewRows}
            onHeaderRowChange={handleHeaderRowChange}
            disabled={loading}
          />
        );
      case 'pickSheet':
        return (
          <div className="ot-import-wizard__step">
            <h2>{t('importWizard.pickSheet.heading')}</h2>
            <div className="ot-import-wizard__sheets">
              {state.sheets.map((sheet: SheetMetadata) => (
                <button
                  key={sheet.name}
                  type="button"
                  className="ot-import-wizard__sheet-card"
                  onClick={() => handleSelectSheet(sheet.name)}
                >
                  <FileSpreadsheet size={20} />
                  <div>
                    <div>{sheet.name}</div>
                    <div className="ot-import-wizard__sheet-meta">
                      {t('importWizard.pickSheet.rowCount', { count: sheet.rowCount })}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      case 'mapColumns':
        return (
          <div className="ot-import-wizard__step">
            <h2>{t('importWizard.mapColumns.heading')}</h2>
            <p className="ot-import-wizard__subtitle">
              {t('importWizard.mapColumns.destination', { accountName: state.accountName })}
            </p>
            <table className="ot-import-wizard__mapping-table">
              <thead>
                <tr>
                  <th>{t('importWizard.mapColumns.sourceColumn')}</th>
                  <th>{t('importWizard.mapColumns.targetField')}</th>
                </tr>
              </thead>
              <tbody>
                {state.columnHeaders.map((col, idx) => (
                  <tr key={`${idx}-${col}`}>
                    <td>{col}</td>
                    <td>
                      <select
                        value={
                          Object.entries(state.columnMapping).find(([_, v]) => v === col)?.[0] || ''
                        }
                        onChange={(e) => handleMapColumn(col, e.target.value)}
                      >
                        <option value="">{t('importWizard.mapColumns.fields.ignore')}</option>
                        <option value="date">{t('importWizard.mapColumns.fields.date')} *</option>
                        <option value="amount">
                          {t('importWizard.mapColumns.fields.amount')} *
                        </option>
                        <option value="description">
                          {t('importWizard.mapColumns.fields.description')} *
                        </option>
                        <option value="category">
                          {t('importWizard.mapColumns.fields.category')}
                        </option>
                        <option value="subcategory">
                          {t('importWizard.mapColumns.fields.subcategory')}
                        </option>
                        <option value="tag">{t('importWizard.mapColumns.fields.tag')}</option>
                        <option value="reference">
                          {t('importWizard.mapColumns.fields.reference')}
                        </option>
                        <option value="details">
                          {t('importWizard.mapColumns.fields.details')}
                        </option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!isMappingComplete() ? (
              <p className="ot-import-wizard__error" role="alert">
                {t('importWizard.mapColumns.missingRequired')}
              </p>
            ) : null}
          </div>
        );
      case 'dryRun': {
        if (!state.dryRunResult || !state.dryRunResult.ok) return null;
        const { summary, samples, duplicates, errors, taxonomyPreview } = state.dryRunResult;
        const validCount = state.importDuplicates
          ? summary.validRows
          : summary.validRows - summary.duplicateCount;
        const MAX_ERRORS_DISPLAY = 50;
        return (
          <div className="ot-import-wizard__step">
            <h2>{t('importWizard.dryRun.heading')}</h2>
            <div className="ot-import-wizard__summary">
              <div className="ot-import-wizard__summary-item">
                <Check size={16} />
                {t('importWizard.dryRun.summary.willImport', { count: validCount })}
              </div>
              {summary.duplicateCount > 0 ? (
                <div className="ot-import-wizard__summary-item">
                  <AlertCircle size={16} />
                  {t('importWizard.dryRun.summary.duplicates', {
                    count: summary.duplicateCount,
                  })}
                </div>
              ) : null}
              {summary.errorCount > 0 ? (
                <>
                  <div className="ot-import-wizard__summary-item ot-import-wizard__summary-item--error">
                    <AlertCircle size={16} />
                    {t('importWizard.dryRun.summary.errors', { count: summary.errorCount })}
                  </div>
                  <div className="ot-import-wizard__info-text">
                    {t('importWizard.dryRun.rowNumberInfo')}
                  </div>
                  {errors.length > 0 ? (
                    <div className="ot-import-wizard__error-list">
                      {errors.slice(0, MAX_ERRORS_DISPLAY).map((err, idx) => {
                        // Build localized error message with raw value if available
                        const errorKey = `importWizard.dryRun.errorCodes.${err.code}`;
                        const translatedReason = t(errorKey, {
                          raw: err.raw || '',
                          offending: err.offending || '',
                          defaultValue: err.code,
                        });

                        const truncatedReason =
                          translatedReason.length > 80
                            ? translatedReason.substring(0, 77) + '...'
                            : translatedReason;

                        return (
                          <div
                            key={idx}
                            className="ot-import-wizard__error-row"
                            title={translatedReason.length > 80 ? translatedReason : undefined}
                          >
                            {t('importWizard.dryRun.errorRow', {
                              row: err.row,
                              field: err.field
                                ? t(`importWizard.mapColumns.fields.${err.field}`)
                                : '',
                              reason: truncatedReason,
                            })}
                          </div>
                        );
                      })}
                      {errors.length > MAX_ERRORS_DISPLAY ? (
                        <div className="ot-import-wizard__error-more">
                          {t('importWizard.dryRun.errorMore', {
                            count: errors.length - MAX_ERRORS_DISPLAY,
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
            {(() => {
              if (!taxonomyPreview) return null;
              const fieldsToShow: Array<{
                field: 'categories' | 'subcategories' | 'tags';
                data: typeof taxonomyPreview.categories;
              }> = [
                { field: 'categories', data: taxonomyPreview.categories },
                { field: 'subcategories', data: taxonomyPreview.subcategories },
                { field: 'tags', data: taxonomyPreview.tags },
              ];
              const hasAny = fieldsToShow.some(
                (f) => f.data.knownCount > 0 || f.data.unknownCount > 0,
              );
              if (!hasAny) return null;
              return (
                <section className="ot-import-wizard__taxonomy-preview">
                  <h3>{t('importWizard.dryRun.taxonomy.heading')}</h3>
                  <p className="ot-import-wizard__taxonomy-hint">
                    {t('importWizard.dryRun.taxonomy.hint')}
                  </p>
                  <label className="ot-import-wizard__taxonomy-autocreate">
                    <input
                      type="checkbox"
                      checked={state.autoCreateUnknownTaxonomy}
                      disabled={loading}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setState((s) => ({ ...s, autoCreateUnknownTaxonomy: next }));
                        // Re-run dry-run with the new flag so willCreate
                        // chips update in place. Defer to the next tick so
                        // React flushes state first.
                        setTimeout(() => {
                          void handleDryRun();
                        }, 0);
                      }}
                    />
                    <span>{t('importWizard.dryRun.taxonomy.autoCreateLabel')}</span>
                  </label>
                  <div className="ot-import-wizard__taxonomy-grid">
                    {fieldsToShow.map(({ field, data }) => {
                      if (data.knownCount === 0 && data.unknownCount === 0) return null;
                      // Split the unknown bucket into "will create" (part
                      // of the server-side creation plan) and plain
                      // "unknown" (won't be imported), so each gets its
                      // own chip colour + badge.
                      const willCreateKeys = new Set(
                        (data.willCreate ?? []).map((n) => n.trim().toLowerCase()),
                      );
                      const leftoverUnknown = data.unknown.filter(
                        (n) => !willCreateKeys.has(n.trim().toLowerCase()),
                      );
                      const leftoverUnknownCount = data.unknownCount - (data.willCreateCount ?? 0);
                      return (
                        <article key={field} className="ot-import-wizard__taxonomy-card">
                          <header className="ot-import-wizard__taxonomy-card-header">
                            <span className="ot-import-wizard__taxonomy-card-title">
                              {t(`importWizard.dryRun.taxonomy.fields.${field}`)}
                            </span>
                            <span className="ot-import-wizard__taxonomy-card-totals">
                              {t('importWizard.dryRun.taxonomy.cardTotals', {
                                known: data.knownCount,
                                unknown: data.unknownCount,
                              })}
                            </span>
                          </header>
                          {data.knownCount > 0 ? (
                            <div className="ot-import-wizard__taxonomy-group ot-import-wizard__taxonomy-group--known">
                              <div className="ot-import-wizard__taxonomy-group-label">
                                <span
                                  className="ot-import-wizard__taxonomy-dot ot-import-wizard__taxonomy-dot--known"
                                  aria-hidden="true"
                                />
                                {t('importWizard.dryRun.taxonomy.knownLabel', {
                                  count: data.knownCount,
                                })}
                              </div>
                              <ul className="ot-import-wizard__taxonomy-chips">
                                {data.known.map((name) => (
                                  <li
                                    key={name}
                                    className="ot-import-wizard__taxonomy-chip ot-import-wizard__taxonomy-chip--known"
                                  >
                                    {name}
                                  </li>
                                ))}
                                {data.knownCount > data.known.length ? (
                                  <li className="ot-import-wizard__taxonomy-chip ot-import-wizard__taxonomy-chip--more">
                                    {t('importWizard.dryRun.taxonomy.andMore', {
                                      count: data.knownCount - data.known.length,
                                    })}
                                  </li>
                                ) : null}
                              </ul>
                            </div>
                          ) : null}
                          {(data.willCreateCount ?? 0) > 0 ? (
                            <div className="ot-import-wizard__taxonomy-group ot-import-wizard__taxonomy-group--willcreate">
                              <div className="ot-import-wizard__taxonomy-group-label">
                                <span
                                  className="ot-import-wizard__taxonomy-dot ot-import-wizard__taxonomy-dot--willcreate"
                                  aria-hidden="true"
                                />
                                {t('importWizard.dryRun.taxonomy.willCreateLabel', {
                                  count: data.willCreateCount ?? 0,
                                })}
                              </div>
                              <ul className="ot-import-wizard__taxonomy-chips">
                                {(data.willCreate ?? []).map((name) => (
                                  <li
                                    key={name}
                                    className="ot-import-wizard__taxonomy-chip ot-import-wizard__taxonomy-chip--willcreate"
                                  >
                                    {name}
                                  </li>
                                ))}
                              </ul>
                              <p className="ot-import-wizard__taxonomy-group-note">
                                {t('importWizard.dryRun.taxonomy.willCreateHint')}
                              </p>
                            </div>
                          ) : null}
                          {leftoverUnknownCount > 0 ? (
                            <div className="ot-import-wizard__taxonomy-group ot-import-wizard__taxonomy-group--unknown">
                              <div className="ot-import-wizard__taxonomy-group-label">
                                <span
                                  className="ot-import-wizard__taxonomy-dot ot-import-wizard__taxonomy-dot--unknown"
                                  aria-hidden="true"
                                />
                                {t('importWizard.dryRun.taxonomy.unknownLabel', {
                                  count: leftoverUnknownCount,
                                })}
                              </div>
                              <ul className="ot-import-wizard__taxonomy-chips">
                                {leftoverUnknown.map((name) => (
                                  <li
                                    key={name}
                                    className="ot-import-wizard__taxonomy-chip ot-import-wizard__taxonomy-chip--unknown"
                                  >
                                    {name}
                                  </li>
                                ))}
                                {leftoverUnknownCount > leftoverUnknown.length ? (
                                  <li className="ot-import-wizard__taxonomy-chip ot-import-wizard__taxonomy-chip--more">
                                    {t('importWizard.dryRun.taxonomy.andMore', {
                                      count: leftoverUnknownCount - leftoverUnknown.length,
                                    })}
                                  </li>
                                ) : null}
                              </ul>
                              <p className="ot-import-wizard__taxonomy-group-note">
                                {t('importWizard.dryRun.taxonomy.unknownNote')}
                              </p>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })()}
            {samples.length > 0 ? (
              <>
                <h3>{t('importWizard.dryRun.previewHeading')}</h3>
                <table className="ot-import-wizard__preview-table">
                  <thead>
                    <tr>
                      {Object.keys(state.columnMapping).map((field) => (
                        <th key={field}>{t(`importWizard.mapColumns.fields.${field}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {samples.map((row) => (
                      <tr key={row.rowIndex}>
                        {Object.keys(state.columnMapping).map((field) => {
                          const value = (row as Record<string, unknown>)[field];
                          return (
                            <td key={field}>
                              {value !== null && value !== undefined ? String(value) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
            {duplicates.length > 0 ? (
              <label className="ot-import-wizard__checkbox">
                <input
                  type="checkbox"
                  checked={state.importDuplicates}
                  onChange={(e) => setState((s) => ({ ...s, importDuplicates: e.target.checked }))}
                />
                {t('importWizard.dryRun.importDuplicates')}
              </label>
            ) : null}
          </div>
        );
      }
      case 'done': {
        return (
          <div className="ot-import-wizard__step">
            <div className="ot-import-wizard__success">
              <Check size={48} />
              <h2>{t('importWizard.confirm.success')}</h2>
              <p>
                {t('importWizard.confirm.successSummary', {
                  imported: state.importedCount,
                  accountName: state.accountName,
                  skipped: state.skippedCount,
                  errors: 0,
                })}
              </p>
              <div className="ot-import-wizard__done-actions">
                <Button variant="primary" onClick={onComplete}>
                  {t('importWizard.confirm.viewTransactions')}
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  {t('common.close')}
                </Button>
              </div>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        className="ot-import-wizard"
        aria-labelledby="ot-import-wizard-title"
        role="dialog"
        aria-modal="true"
      >
        <div className="ot-import-wizard__content">
          <header className="ot-import-wizard__header">
            <h1 id="ot-import-wizard-title" className="ot-import-wizard__title">
              {t('importWizard.title')}
            </h1>
            <button
              type="button"
              className="ot-import-wizard__close"
              onClick={handleClose}
              aria-label={t('common.close')}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>

          {state.error ? (
            <div className="ot-import-wizard__error" role="alert">
              {state.error}
            </div>
          ) : null}

          <div className="ot-import-wizard__body">{renderStep()}</div>

          {state.step !== 'done' ? (
            <footer className="ot-import-wizard__footer">
              {state.step !== 'selectAccount' ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBack}
                  leadingIcon={<ArrowLeft size={16} />}
                >
                  {t('importWizard.dryRun.back')}
                </Button>
              ) : (
                <div />
              )}
              {state.step === 'mapColumns' ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleDryRun}
                  disabled={!isMappingComplete() || loading}
                >
                  {loading ? t('common.loading') : t('importWizard.mapColumns.preview')}
                </Button>
              ) : state.step === 'confirmHeaderRow' ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleConfirmHeaderRow}
                  disabled={loading || state.headerRow === null}
                >
                  {loading ? t('common.loading') : t('importWizard.confirmHeaderRow.continue')}
                </Button>
              ) : state.step === 'dryRun' ? (
                <Button type="button" variant="primary" onClick={handleCommit} disabled={loading}>
                  {loading
                    ? t('common.loading')
                    : t('importWizard.dryRun.import', {
                        count: state.importDuplicates
                          ? state.dryRunResult?.ok
                            ? state.dryRunResult.summary.validRows
                            : 0
                          : state.dryRunResult?.ok
                            ? state.dryRunResult.summary.validRows -
                              state.dryRunResult.summary.duplicateCount
                            : 0,
                      })}
                </Button>
              ) : null}
            </footer>
          ) : null}
        </div>
      </dialog>

      <dialog
        ref={cancelConfirmRef}
        className="ot-import-wizard-cancel-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={cancelConfirmTitleId}
      >
        <div className="ot-import-wizard-cancel-confirm__content">
          <h2 id={cancelConfirmTitleId} className="ot-import-wizard-cancel-confirm__title">
            {t('importWizard.cancel.title')}
          </h2>
          <p className="ot-import-wizard-cancel-confirm__body">
            {t('importWizard.cancel.message')}
          </p>
          <div className="ot-import-wizard-cancel-confirm__actions">
            <Button variant="ghost" onClick={handleStayInWizard}>
              {t('importWizard.cancel.stay')}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDiscard}>
              {t('importWizard.cancel.confirm')}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
