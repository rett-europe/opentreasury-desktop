import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card } from '../../components/Card/index.js';
import { DateInput } from '../../components/DateInput/index.js';
import { TagChipPicker } from '../../components/TagChipPicker/index.js';
import { Button } from '../../components/Button/index.js';
import { getAccounts } from '../../services/panelApi.js';
import {
  getAuditVerifyStatus,
  listSignedEntries,
  listChangeHistory,
} from '../../services/auditApi.js';
import type {
  AuditVerifyStatusResponse,
  SignedEntryView,
  ChangeHistoryRow,
} from '../../../shared/ipc-contracts/audit.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';
import { DATE_PRESET_IDS, getPresetRange, type DatePresetId } from '../../utils/datePresets.js';
import { IntegrityBanner } from './IntegrityBanner.js';
import './AuditScreen.css';

/**
 * Evidence-export bundle (WI-6 / AUD-2) is a deferred increment. The button is
 * rendered disabled behind this flag so the entry point is discoverable without
 * shipping export. Flip to `true` only when WI-6 lands.
 */
const EVIDENCE_EXPORT_ENABLED = false;

export interface AuditScreenProps {
  /** Bumped by the shell when workspace config changes; refetches reference data. */
  readonly configRevision?: number;
}

type AuditTab = 'signed' | 'history';
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface IsoRange {
  readonly from: string;
  readonly to: string;
}

function formatDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * SPEC-028 WI-4 — read-only Audit & Evidence viewer. Surfaces the last-unlock
 * integrity verdict (no re-verify on navigation, §2), the per-device "anchored
 * through" chips, and the two provenance lanes (Registro firmado / Historial de
 * cambios) with date-range + account/device filters. Everything here is a
 * Zod-validated view-model received over typed IPC — no plaintext, ciphertext,
 * path, or key material reaches this component (FR12 / AC10).
 */
export function AuditScreen({ configRevision = 0 }: AuditScreenProps): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language;

  const [verifyStatus, setVerifyStatus] = useState<AuditVerifyStatusResponse | null>(null);
  const [verifyState, setVerifyState] = useState<LoadState>('loading');
  const [accounts, setAccounts] = useState<readonly Account[]>([]);

  const [tab, setTab] = useState<AuditTab>('history');
  const [range, setRange] = useState<IsoRange | null>(null);
  const [activePreset, setActivePreset] = useState<DatePresetId | null>(null);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [accountIds, setAccountIds] = useState<readonly string[]>([]);
  const [deviceIds, setDeviceIds] = useState<readonly string[]>([]);

  const [signed, setSigned] = useState<readonly SignedEntryView[]>([]);
  const [history, setHistory] = useState<readonly ChangeHistoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [listState, setListState] = useState<LoadState>('loading');

  // ── Reference data + verify status (entry point #1: last unlock verdict) ──
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setVerifyState('loading');
      try {
        const [status, acc] = await Promise.all([
          getAuditVerifyStatus(),
          getAccounts().catch(() => ({ accounts: [] as readonly Account[] })),
        ]);
        if (cancelled) return;
        setVerifyStatus(status);
        setAccounts(acc.accounts);
        setVerifyState('ready');
      } catch {
        if (!cancelled) setVerifyState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configRevision]);

  // ── Tab data, refetched on tab/filter change ──────────────────────────────
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setListState('loading');
      try {
        if (tab === 'signed') {
          const res = await listSignedEntries({
            ...(range ? { dateFrom: range.from, dateTo: range.to } : {}),
          });
          if (cancelled) return;
          setSigned(res.entries);
          setTotalCount(res.totalCount);
        } else {
          const res = await listChangeHistory({
            ...(range ? { dateFrom: range.from, dateTo: range.to } : {}),
            ...(accountIds.length ? { accountIds: [...accountIds] } : {}),
            ...(deviceIds.length ? { deviceIds: [...deviceIds] } : {}),
          });
          if (cancelled) return;
          setHistory(res.rows);
          setTotalCount(res.totalCount);
        }
        if (!cancelled) setListState('ready');
      } catch {
        if (!cancelled) setListState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, range, accountIds, deviceIds, configRevision]);

  // ── Filter handlers ───────────────────────────────────────────────────────
  const applyPreset = useCallback((id: DatePresetId) => {
    const r = getPresetRange(id);
    setRange({ from: r.from, to: r.to });
    setActivePreset(id);
    setCustomFrom(r.from);
    setCustomTo(r.to);
  }, []);

  const customInvalid = customFrom !== '' && customTo !== '' && customFrom > customTo;

  const applyCustomRange = useCallback(() => {
    if (!customFrom || !customTo || customFrom > customTo) return;
    setRange({ from: customFrom, to: customTo });
    setActivePreset(null);
  }, [customFrom, customTo]);

  const toggle = useCallback(
    (setter: React.Dispatch<React.SetStateAction<readonly string[]>>) => (id: string) => {
      setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setRange(null);
    setActivePreset(null);
    setCustomFrom('');
    setCustomTo('');
    setAccountIds([]);
    setDeviceIds([]);
  }, []);

  const deviceOptions = useMemo(
    () =>
      (verifyStatus?.devices ?? []).map((d) => ({
        id: d.deviceId,
        name: d.isCurrentDevice ? t('audit.device.thisDevice') : d.deviceId,
      })),
    [verifyStatus, t],
  );

  // ── Tablist keyboard navigation (§6: arrow keys move between tabs) ─────────
  const onTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setTab((prev) => (prev === 'signed' ? 'history' : 'signed'));
    }
  }, []);

  // ── Blocking integrity-error view (AUD-0, entry point #4) ─────────────────
  if (verifyStatus?.failClosed) {
    return (
      <div className="ot-audit ot-audit--blocked">
        <header className="ot-page-header">
          <h1>{t('audit.title')}</h1>
        </header>
        <Card className="ot-audit__tamper" role="alert">
          <ShieldErrorIcon />
          <h2>{t('audit.tamper.title')}</h2>
          <p>{t('audit.tamper.body')}</p>
        </Card>
      </div>
    );
  }

  const shownCount = tab === 'history' ? history.length : signed.length;
  const filtered = shownCount < totalCount;
  const countLabel = filtered
    ? t('audit.countFiltered', { shown: shownCount, total: totalCount })
    : t('audit.count', { count: totalCount });

  return (
    <div className="ot-audit">
      <header className="ot-page-header">
        <div>
          <h1>{t('audit.title')}</h1>
          <p className="ot-page-header__subtitle">{t('audit.subtitle')}</p>
        </div>
        <div className="ot-audit__header-actions">
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={!EVIDENCE_EXPORT_ENABLED}
            title={EVIDENCE_EXPORT_ENABLED ? undefined : t('audit.exportComingSoon')}
          >
            {t('audit.exportEvidence')}
          </Button>
        </div>
      </header>

      {verifyState === 'loading' && (
        <Card className="ot-audit__banner ot-audit__banner--neutral" aria-busy="true">
          <span className="ot-audit__banner-message">{t('audit.loading')}</span>
        </Card>
      )}
      {verifyState === 'error' && (
        <Card className="ot-audit__banner ot-audit__banner--warn" role="alert">
          <span className="ot-audit__banner-message">{t('audit.error')}</span>
        </Card>
      )}
      {verifyState === 'ready' && verifyStatus && (
        <IntegrityBanner status={verifyStatus} locale={locale} />
      )}

      <Card className="ot-audit__filters ot-audit__no-print">
        <fieldset className="ot-audit__group">
          <legend className="ot-audit__legend">{t('audit.filters.dateRange')}</legend>
          <div className="ot-audit__presets" role="group" aria-label={t('audit.filters.dateRange')}>
            {DATE_PRESET_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`ot-audit__preset ${activePreset === id ? 'ot-audit__preset--active' : ''}`}
                aria-pressed={activePreset === id}
                onClick={() => applyPreset(id)}
              >
                {t(`export.presets.${id}`)}
              </button>
            ))}
          </div>
          <div className="ot-audit__custom">
            <label className="ot-audit__date-label">
              <span>{t('export.filters.from')}</span>
              <DateInput value={customFrom} max={customTo || undefined} onChange={setCustomFrom} />
            </label>
            <label className="ot-audit__date-label">
              <span>{t('export.filters.to')}</span>
              <DateInput value={customTo} min={customFrom || undefined} onChange={setCustomTo} />
            </label>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={applyCustomRange}
              disabled={!customFrom || !customTo || customInvalid}
            >
              {t('common.apply')}
            </Button>
          </div>
          {customInvalid && (
            <p className="ot-audit__field-error" role="alert">
              {t('export.filters.invalidRange')}
            </p>
          )}
        </fieldset>

        {tab === 'history' && (
          <>
            <fieldset className="ot-audit__group">
              <legend className="ot-audit__legend">{t('audit.filters.account')}</legend>
              <TagChipPicker
                availableTags={accounts.map((a) => ({
                  id: a.id,
                  name: a.accountLabel,
                  ...(a.color ? { color: a.color } : {}),
                }))}
                selectedIds={accountIds}
                onToggle={toggle(setAccountIds)}
                colored
              />
            </fieldset>

            {deviceOptions.length > 0 && (
              <fieldset className="ot-audit__group">
                <legend className="ot-audit__legend">{t('audit.filters.device')}</legend>
                <TagChipPicker
                  availableTags={deviceOptions}
                  selectedIds={deviceIds}
                  onToggle={toggle(setDeviceIds)}
                />
              </fieldset>
            )}
          </>
        )}

        <div className="ot-audit__filters-footer">
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            {t('export.clearFilters')}
          </Button>
        </div>
      </Card>

      <div className="ot-audit__tabs" role="tablist" aria-label={t('audit.title')}>
        <button
          type="button"
          role="tab"
          id="ot-audit-tab-history"
          aria-selected={tab === 'history'}
          aria-controls="ot-audit-panel-history"
          tabIndex={tab === 'history' ? 0 : -1}
          className={`ot-audit__tab ${tab === 'history' ? 'ot-audit__tab--active' : ''}`}
          onClick={() => setTab('history')}
          onKeyDown={onTabKeyDown}
        >
          {t('audit.tabs.history')}
        </button>
        <button
          type="button"
          role="tab"
          id="ot-audit-tab-signed"
          aria-selected={tab === 'signed'}
          aria-controls="ot-audit-panel-signed"
          tabIndex={tab === 'signed' ? 0 : -1}
          className={`ot-audit__tab ${tab === 'signed' ? 'ot-audit__tab--active' : ''}`}
          onClick={() => setTab('signed')}
          onKeyDown={onTabKeyDown}
        >
          {t('audit.tabs.signed')}
        </button>
      </div>

      <p className="ot-audit__count" aria-live="polite">
        {countLabel}
      </p>

      {tab === 'history' ? (
        <div
          role="tabpanel"
          id="ot-audit-panel-history"
          aria-labelledby="ot-audit-tab-history"
          tabIndex={0}
        >
          <HistoryTable
            rows={history}
            state={listState}
            locale={locale}
            t={t}
            hasFilters={range !== null || accountIds.length > 0 || deviceIds.length > 0}
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="ot-audit-panel-signed"
          aria-labelledby="ot-audit-tab-signed"
          tabIndex={0}
        >
          <SignedTable
            entries={signed}
            state={listState}
            locale={locale}
            t={t}
            anchored={(verifyStatus?.devices.length ?? 0) > 0}
            hasFilters={range !== null}
          />
        </div>
      )}
    </div>
  );
}

function ShieldErrorIcon(): JSX.Element {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="ot-audit__tamper-icon"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

type TFn = TFunction<'common'>;

interface SignedTableProps {
  readonly entries: readonly SignedEntryView[];
  readonly state: LoadState;
  readonly locale: string;
  readonly t: TFn;
  readonly anchored: boolean;
  readonly hasFilters: boolean;
}

function SignedTable({ entries, state, locale, t }: SignedTableProps): JSX.Element {
  if (state === 'loading') return <LoadingRows label={t('audit.loading')} />;
  if (state === 'error') return <ErrorBlock label={t('audit.error')} />;
  if (entries.length === 0) return <EmptyBlock label={t('audit.empty')} />;
  return (
    <div className="ot-audit__table-wrap">
      <table className="ot-audit__table">
        <thead>
          <tr>
            <th scope="col">{t('audit.signedTable.seq')}</th>
            <th scope="col">{t('audit.signedTable.timestamp')}</th>
            <th scope="col">{t('audit.signedTable.action')}</th>
            <th scope="col">{t('audit.signedTable.device')}</th>
            <th scope="col">{t('audit.signedTable.anchoredThrough')}</th>
            <th scope="col">{t('audit.signedTable.timestamp_state')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.seq}>
              <td>
                <span className="ot-audit__sr-lane">{t('audit.rowLane.signed')}</span>
                {e.seq}
              </td>
              <td>{formatDateTime(e.timestamp, locale)}</td>
              <td>
                {t(`audit.actions.${e.action}`, { defaultValue: e.action })}
                <span className="ot-audit__result"> · {t(`audit.result.${e.result}`)}</span>
              </td>
              <td className="ot-audit__mono">{e.actorDeviceId}</td>
              <td>{e.anchoredThrough ? formatDateTime(e.anchoredThrough, locale) : '—'}</td>
              <td>{t(`audit.timestampState.${e.timestamp_state}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface HistoryTableProps {
  readonly rows: readonly ChangeHistoryRow[];
  readonly state: LoadState;
  readonly locale: string;
  readonly t: TFn;
  readonly hasFilters: boolean;
}

function renderActor(row: ChangeHistoryRow, t: TFn): JSX.Element {
  if (row.actor.kind === 'known') {
    return <span className="ot-audit__mono">{row.actor.userId}</span>;
  }
  const key = row.actor.reason === 'pre-coverage' ? 'audit.actor.preCoverage' : 'audit.actor.flat';
  return <span className="ot-audit__unknown">{t(key)}</span>;
}

function renderDevice(row: ChangeHistoryRow, t: TFn): JSX.Element {
  if (row.device.kind === 'known') {
    return <span className="ot-audit__mono">{row.device.deviceId}</span>;
  }
  return <span className="ot-audit__unknown">{t('audit.actor.unknownDevice')}</span>;
}

function HistoryTable({ rows, state, locale, t }: HistoryTableProps): JSX.Element {
  if (state === 'loading') return <LoadingRows label={t('audit.loading')} />;
  if (state === 'error') return <ErrorBlock label={t('audit.error')} />;
  if (rows.length === 0) return <EmptyBlock label={t('audit.empty')} />;
  return (
    <div className="ot-audit__table-wrap">
      <table className="ot-audit__table">
        <thead>
          <tr>
            <th scope="col">{t('audit.historyTable.occurredAt')}</th>
            <th scope="col">{t('audit.historyTable.actor')}</th>
            <th scope="col">{t('audit.historyTable.device')}</th>
            <th scope="col">{t('audit.historyTable.action')}</th>
            <th scope="col">{t('audit.historyTable.account')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.eventId}>
              <td>
                <span className="ot-audit__sr-lane">{t('audit.rowLane.history')}</span>
                {formatDateTime(r.occurredAt, locale)}
              </td>
              <td>{renderActor(r, t)}</td>
              <td>{renderDevice(r, t)}</td>
              <td>{t(`audit.actions.${r.action}`, { defaultValue: r.action })}</td>
              <td>{r.accountLabel ?? r.accountId ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingRows({ label }: { readonly label: string }): JSX.Element {
  return (
    <div className="ot-audit__skeleton" aria-busy="true" aria-live="polite">
      <span className="ot-audit__sr-only">{label}</span>
      <span className="ot-audit__skeleton-row" />
      <span className="ot-audit__skeleton-row" />
      <span className="ot-audit__skeleton-row" />
    </div>
  );
}

function EmptyBlock({ label }: { readonly label: string }): JSX.Element {
  return (
    <div className="ot-audit__empty" role="status">
      {label}
    </div>
  );
}

function ErrorBlock({ label }: { readonly label: string }): JSX.Element {
  return (
    <div className="ot-audit__error" role="alert">
      {label}
    </div>
  );
}
