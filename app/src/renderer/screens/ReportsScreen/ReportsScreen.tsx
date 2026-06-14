import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import { Button } from '../../components/Button/index.js';
import { Card } from '../../components/Card/index.js';
import { DateInput } from '../../components/DateInput/index.js';
import { getAccounts } from '../../services/panelApi.js';
import { buildReport, generateReport } from '../../services/reportApi.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';
import type {
  ReportGrouping,
  ReportLocaleCode,
  ReportModel,
  ReportPeriodKind,
} from '../../../shared/ipc-contracts/report.js';
import { ReportPreview } from './ReportPreview.js';
import { ReportConfirmModal } from './ReportConfirmModal.js';
import { TOKEN_TTL_MS } from './constants.js';
import './ReportsScreen.css';

/** Map the active UI language onto the report IPC locale union. */
function toReportLocale(language: string): ReportLocaleCode {
  return language.startsWith('es') ? 'es' : 'en';
}

const CONSOLIDATED = '__consolidated__';

/**
 * REP-1 screen phases (UX spec §4). The form lives in component state; `phase`
 * tracks the build → preview → generate lifecycle. A preview carries the
 * aggregate-only model plus the one-shot confirmation token minted by main.
 */
type Phase =
  | { readonly kind: 'idle' } // period-empty / editing the form
  | { readonly kind: 'building' }
  | { readonly kind: 'preview'; readonly model: ReportModel; readonly token: string }
  | { readonly kind: 'generating'; readonly model: ReportModel; readonly token: string }
  | { readonly kind: 'saved'; readonly model: ReportModel; readonly basename: string }
  | { readonly kind: 'error'; readonly code: string; readonly needsRebuild: boolean };

export interface ReportsScreenProps {
  /** Bumped by config mutations elsewhere so the account list reloads. */
  readonly configRevision?: number;
}

/**
 * SPEC-030 (WI-3) — Financial Report screen (REP-1).
 *
 * Renderer-only: it CONSUMES the WI-2 IPC (`report:build` → aggregate model +
 * token; `report:generate` → outcome). The screen never computes a total and
 * never supplies a path — totals come from the model, the save destination is
 * chosen by the OS dialog in main. The form starts EMPTY (list-starts-empty):
 * nothing is built until the treasurer triggers it.
 */
export function ReportsScreen({ configRevision = 0 }: ReportsScreenProps): JSX.Element {
  const { t, i18n } = useTranslation('common');

  // ── Reference data ───────────────────────────────────────────────
  const [accounts, setAccounts] = useState<readonly Account[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getAccounts();
        if (!cancelled) setAccounts(res.accounts);
      } catch {
        if (!cancelled) setAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configRevision]);

  // ── Form state ───────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => Array.from({ length: 7 }, (_, i) => currentYear - i),
    [currentYear],
  );

  const [periodKind, setPeriodKind] = useState<ReportPeriodKind>('calendar-year');
  const [year, setYear] = useState<number>(currentYear);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [accountScope, setAccountScope] = useState<string>(CONSOLIDATED);
  const [grouping, setGrouping] = useState<ReportGrouping>('category');

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  // A retryable generate failure (e.g. write/render) keeps the preview + token
  // alive so the treasurer can simply try again; token/workspace failures use
  // the `error` phase instead (they require a fresh build).
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── Derived period ───────────────────────────────────────────────
  const period = useMemo<{ start: string; end: string } | null>(() => {
    if (periodKind === 'calendar-year') {
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    }
    if (customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return null;
  }, [periodKind, year, customStart, customEnd]);

  const rangeInvalid =
    periodKind === 'custom-range' &&
    customStart !== '' &&
    customEnd !== '' &&
    customStart > customEnd;

  const canBuild = period !== null && !rangeInvalid && phase.kind !== 'building';

  // ── Form-change invalidation ─────────────────────────────────────
  // Any change to the inputs makes a prior preview/token stale (main
  // invalidates the previous token on a new build), so reset to the form.
  const resetToForm = useCallback(() => {
    setConfirmOpen(false);
    setTokenExpired(false);
    setGenerateError(null);
    setPhase((cur) => (cur.kind === 'idle' ? cur : { kind: 'idle' }));
  }, []);

  const onPeriodKindChange = useCallback(
    (next: ReportPeriodKind) => {
      setPeriodKind(next);
      resetToForm();
    },
    [resetToForm],
  );

  // ── Token expiry timer (TTL ≤ 60s, NFR/FR — main rejects stale tokens) ──
  const expiryTimerRef = useRef<number | null>(null);
  const clearExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current !== null) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearExpiryTimer, [clearExpiryTimer]);

  // ── Build ────────────────────────────────────────────────────────
  const handleBuild = useCallback(async () => {
    if (!period || rangeInvalid) return;
    clearExpiryTimer();
    setTokenExpired(false);
    setGenerateError(null);
    setConfirmOpen(false);
    setPhase({ kind: 'building' });

    const accountIds = accountScope === CONSOLIDATED ? [] : [accountScope];
    try {
      const res = await buildReport({
        periodKind,
        periodStart: period.start,
        periodEnd: period.end,
        ...(accountIds.length > 0 ? { accountIds } : {}),
        grouping,
        locale: toReportLocale(i18n.language),
      });
      if (res.ok) {
        setPhase({ kind: 'preview', model: res.model, token: res.confirmationToken });
        // Arm the 60s expiry so a stale token disables Generate proactively
        // (the IPC also rejects it, but this gives a calm in-place hint).
        expiryTimerRef.current = window.setTimeout(() => {
          setTokenExpired(true);
        }, TOKEN_TTL_MS);
      } else {
        setPhase({ kind: 'error', code: res.code, needsRebuild: true });
      }
    } catch {
      setPhase({ kind: 'error', code: 'REPORT_INTERNAL', needsRebuild: true });
    }
  }, [period, rangeInvalid, accountScope, periodKind, grouping, i18n.language, clearExpiryTimer]);

  // ── Generate ─────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (phase.kind !== 'preview') return;
    const { model, token } = phase;
    setConfirmOpen(false);
    setGenerateError(null);
    setPhase({ kind: 'generating', model, token });

    try {
      const res = await generateReport(token);
      if (res.outcome === 'saved') {
        clearExpiryTimer();
        setPhase({ kind: 'saved', model, basename: res.basename });
      } else if (res.outcome === 'canceled') {
        // Quiet return to the preview — token is still valid.
        setPhase({ kind: 'preview', model, token });
      } else if (res.code === 'REPORT_TOKEN_INVALID') {
        // Expired / replayed token → a fresh build is required.
        clearExpiryTimer();
        setPhase({ kind: 'error', code: res.code, needsRebuild: true });
      } else {
        // Retryable failure (write/render/audit/etc.) — keep the preview and
        // its still-valid token so the user can try again from the modal.
        setGenerateError(res.code);
        setPhase({ kind: 'preview', model, token });
      }
    } catch {
      setGenerateError('REPORT_INTERNAL');
      setPhase({ kind: 'preview', model, token });
    }
  }, [phase, clearExpiryTimer]);

  const previewModel =
    phase.kind === 'preview' || phase.kind === 'generating' || phase.kind === 'saved'
      ? phase.model
      : null;
  const previewToken = phase.kind === 'preview' ? phase.token : null;

  const errorMessage = useCallback(
    (code: string): string => {
      const key = `report.errors.${code}`;
      const translated = t(key);
      return translated === key ? t('report.errors.REPORT_INTERNAL') : translated;
    },
    [t],
  );

  const isBusy = phase.kind === 'building' || phase.kind === 'generating';
  const canGenerate = phase.kind === 'preview' && !tokenExpired;

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="ot-report">
      <header className="ot-page-header">
        <div>
          <h1>{t('report.title')}</h1>
          <p className="ot-page-header__subtitle">{t('report.subtitle')}</p>
        </div>
      </header>

      <Card className="ot-report__form">
        {/* Period */}
        <fieldset className="ot-report__group">
          <legend className="ot-report__legend">{t('report.form.period')}</legend>
          <div
            className="ot-report__period-kinds"
            role="radiogroup"
            aria-label={t('report.form.period')}
          >
            <label className="ot-report__radio">
              <input
                type="radio"
                name="report-period-kind"
                value="calendar-year"
                checked={periodKind === 'calendar-year'}
                onChange={() => onPeriodKindChange('calendar-year')}
              />
              <span>{t('report.form.calendarYear')}</span>
            </label>
            <label className="ot-report__radio">
              <input
                type="radio"
                name="report-period-kind"
                value="custom-range"
                checked={periodKind === 'custom-range'}
                onChange={() => onPeriodKindChange('custom-range')}
              />
              <span>{t('report.form.customRange')}</span>
            </label>
          </div>

          {periodKind === 'calendar-year' ? (
            <label className="ot-report__field">
              <span className="ot-report__field-label">{t('report.form.year')}</span>
              <select
                className="ot-report__select"
                value={year}
                onChange={(e) => {
                  setYear(Number(e.target.value));
                  resetToForm();
                }}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="ot-report__custom">
              <label className="ot-report__field">
                <span className="ot-report__field-label">{t('report.form.from')}</span>
                <DateInput
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={(iso) => {
                    setCustomStart(iso);
                    resetToForm();
                  }}
                />
              </label>
              <label className="ot-report__field">
                <span className="ot-report__field-label">{t('report.form.to')}</span>
                <DateInput
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(iso) => {
                    setCustomEnd(iso);
                    resetToForm();
                  }}
                />
              </label>
            </div>
          )}
          {rangeInvalid && (
            <p className="ot-report__field-error" role="alert">
              {t('report.form.invalidRange')}
            </p>
          )}
        </fieldset>

        {/* Account scope */}
        <fieldset className="ot-report__group">
          <legend className="ot-report__legend">{t('report.form.scope')}</legend>
          <label className="ot-report__field">
            <span className="ot-report__field-label">{t('report.form.account')}</span>
            <select
              className="ot-report__select"
              value={accountScope}
              onChange={(e) => {
                setAccountScope(e.target.value);
                resetToForm();
              }}
            >
              <option value={CONSOLIDATED}>{t('report.form.consolidated')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountLabel}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        {/* Grouping level */}
        <fieldset className="ot-report__group">
          <legend className="ot-report__legend">{t('report.form.grouping')}</legend>
          <label className="ot-report__field">
            <span className="ot-report__field-label">{t('report.form.groupingLevel')}</span>
            <select
              className="ot-report__select"
              value={grouping}
              onChange={(e) => {
                setGrouping(e.target.value as ReportGrouping);
                resetToForm();
              }}
            >
              <option value="category">{t('report.form.groupingCategory')}</option>
              <option value="category-subcategory">{t('report.form.groupingSubcategory')}</option>
            </select>
          </label>
        </fieldset>

        <div className="ot-report__form-footer">
          <Button
            type="button"
            variant="primary"
            size="lg"
            leadingIcon={<FileText size={18} />}
            disabled={!canBuild}
            loading={phase.kind === 'building'}
            aria-disabled={!canBuild}
            onClick={() => void handleBuild()}
          >
            {t('report.btn.build')}
          </Button>
        </div>
      </Card>

      {/* Live status region announcing build/preview/outcome. */}
      <div className="ot-report__status" aria-live="polite">
        {phase.kind === 'idle' && <p className="ot-report__hint">{t('report.empty.pickPeriod')}</p>}
        {phase.kind === 'building' && <p className="ot-report__hint">{t('report.building')}</p>}

        {phase.kind === 'saved' && (
          <div className="ot-report__banner ot-report__banner--success" role="status">
            <span>{t('report.success', { basename: phase.basename })}</span>
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="ot-report__banner ot-report__banner--danger" role="alert">
            <span>{errorMessage(phase.code)}</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleBuild()}>
              {t('report.error.rebuild')}
            </Button>
          </div>
        )}

        {generateError && phase.kind === 'preview' && !tokenExpired && (
          <div className="ot-report__banner ot-report__banner--danger" role="alert">
            <span>{errorMessage(generateError)}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setConfirmOpen(true)}
            >
              {t('report.error.retry')}
            </Button>
          </div>
        )}

        {tokenExpired && (phase.kind === 'preview' || phase.kind === 'generating') && (
          <div className="ot-report__banner ot-report__banner--warning" role="status">
            <span>{t('report.expired')}</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleBuild()}>
              {t('report.error.rebuild')}
            </Button>
          </div>
        )}
      </div>

      {/* Preview + generate */}
      {previewModel && (
        <>
          <ReportPreview model={previewModel} />
          {phase.kind !== 'saved' && (
            <div className="ot-report__actions">
              <Button
                type="button"
                variant="primary"
                size="lg"
                leadingIcon={<FileText size={18} />}
                disabled={!canGenerate}
                loading={phase.kind === 'generating'}
                aria-disabled={!canGenerate}
                title={tokenExpired ? t('report.expired') : undefined}
                onClick={() => setConfirmOpen(true)}
              >
                {t('report.btn.generate')}
              </Button>
            </div>
          )}
        </>
      )}

      <ReportConfirmModal
        isOpen={confirmOpen && previewToken !== null}
        busy={isBusy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleGenerate()}
      />
    </div>
  );
}
