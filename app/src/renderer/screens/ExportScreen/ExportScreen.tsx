import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FolderOpen } from 'lucide-react';
import { Button } from '../../components/Button/index.js';
import { Card } from '../../components/Card/index.js';
import { DateInput } from '../../components/DateInput/index.js';
import { TagChipPicker } from '../../components/TagChipPicker/index.js';
import { getAccounts } from '../../services/panelApi.js';
import { listCategories } from '../../services/categoriesApi.js';
import { listTags } from '../../services/tagsApi.js';
import { listMovements } from '../../services/movementsApi.js';
import {
  prepareExport,
  runExport,
  revealLastExport,
  onExportProgress,
} from '../../services/exportApi.js';
import {
  isMinimumFilterSetSatisfied,
  type ExportFilters,
  type ExportFormat,
  type ExportLocaleCode,
  type ExportProgress,
} from '../../../shared/ipc-contracts/export.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';
import type { CategoryRecord } from '../../../shared/ipc-contracts/categories.js';
import type { TagRecord } from '../../../shared/ipc-contracts/tags.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';
import { DATE_PRESET_IDS, getPresetRange, type DatePresetId } from '../../utils/datePresets.js';
import { useFormatPrefs } from '../../format/index.js';
import { MAX_EXPORT_ROWS } from './constants.js';
import { ExportConfirmModal } from './ExportConfirmModal.js';
import './ExportScreen.css';

export interface ExportScreenProps {
  /** Bumped by config mutations elsewhere so reference data reloads. */
  readonly configRevision?: number;
}

interface IsoRange {
  readonly from: string;
  readonly to: string;
}

type ExportPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'preparing' }
  | { readonly kind: 'exporting'; readonly progress: ExportProgress | null }
  | { readonly kind: 'success'; readonly basename: string; readonly rowCount: number }
  | { readonly kind: 'blocked-workspace' }
  | { readonly kind: 'error'; readonly code: string; readonly recoverable: boolean };

/** Locale code accepted by the export IPC contract. */
function toExportLocale(language: string): ExportLocaleCode {
  return language.startsWith('es') ? 'es' : 'en';
}

/**
 * SPEC-027 — Export screen.
 *
 * Date-range-first: the screen starts empty and only computes a count once a
 * date range is chosen. A full/unfiltered export is blocked by the
 * mandatory-filter gate (date range + at least one additional filter). The
 * actual file is produced by the main-process streaming pipeline — the
 * renderer never sees plaintext rows or the destination path.
 */
export function ExportScreen({ configRevision = 0 }: ExportScreenProps): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const { dateFormat, numberFormat } = useFormatPrefs();

  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [categories, setCategories] = useState<readonly CategoryRecord[]>([]);
  const [tags, setTags] = useState<readonly TagRecord[]>([]);
  const [movements, setMovements] = useState<readonly MovementRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [accountIds, setAccountIds] = useState<readonly string[]>([]);
  const [categoryIds, setCategoryIds] = useState<readonly string[]>([]);
  const [subcategoryIds, setSubcategoryIds] = useState<readonly string[]>([]);
  const [tagIds, setTagIds] = useState<readonly string[]>([]);
  const [range, setRange] = useState<IsoRange | null>(null);
  const [activePreset, setActivePreset] = useState<DatePresetId | null>(null);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [format, setFormat] = useState<ExportFormat>('csv');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phase, setPhase] = useState<ExportPhase>({ kind: 'idle' });

  // Reference data + the lightweight movement projection that powers the live
  // count. The count reads the already-projected read model (FR8) — no
  // decryption beyond the movement metadata the Movements screen already
  // receives, and no plaintext export rows leave main.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setDataLoading(true);
      try {
        const [acc, records, cats, tg] = await Promise.all([
          getAccounts().catch(() => ({ accounts: [] as readonly Account[] })),
          listMovements().catch(() => [] as MovementRecord[]),
          listCategories().catch(() => ({ categories: [] as readonly CategoryRecord[] })),
          listTags().catch(() => ({ tags: [] as readonly TagRecord[] })),
        ]);
        if (cancelled) return;
        setAccounts(acc.accounts);
        setMovements(records);
        setCategories(cats.categories);
        setTags(tg.tags);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configRevision]);

  const tagNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const tag of tags) m.set(tag.id, tag.name);
    return m;
  }, [tags]);

  // Subcategory options follow the selected categories (edge case #1): when a
  // parent category is deselected its subcategories disappear and any selected
  // ones are pruned. With no category selected, all subcategories are offered.
  const subcategoryOptions = useMemo(() => {
    const out: { id: string; name: string; color?: string }[] = [];
    const selectedCats = new Set(categoryIds);
    for (const cat of categories) {
      if (selectedCats.size > 0 && !selectedCats.has(cat.id)) continue;
      for (const sub of cat.subcategories ?? [])
        out.push({ id: sub.id, name: sub.name, ...(cat.color ? { color: cat.color } : {}) });
    }
    return out;
  }, [categories, categoryIds]);

  // Prune subcategory selections that are no longer offered.
  useEffect(() => {
    const valid = new Set(subcategoryOptions.map((s) => s.id));
    setSubcategoryIds((prev) => {
      const next = prev.filter((id) => valid.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [subcategoryOptions]);

  const selectedTagNames = useMemo(
    () => tagIds.map((id) => tagNameById.get(id) ?? '').filter((n) => n.length > 0),
    [tagIds, tagNameById],
  );

  const filters: ExportFilters | null = useMemo(() => {
    if (!range) return null;
    return {
      dateFrom: range.from,
      dateTo: range.to,
      ...(accountIds.length > 0 ? { accountIds: [...accountIds].sort() } : {}),
      ...(categoryIds.length > 0 ? { categoryIds: [...categoryIds].sort() } : {}),
      ...(subcategoryIds.length > 0 ? { subcategoryIds: [...subcategoryIds].sort() } : {}),
      ...(selectedTagNames.length > 0 ? { labels: [...selectedTagNames].sort() } : {}),
    };
  }, [range, accountIds, categoryIds, subcategoryIds, selectedTagNames]);

  const gateSatisfied = useMemo(
    () =>
      isMinimumFilterSetSatisfied({
        dateFrom: range?.from,
        dateTo: range?.to,
        accountIds,
        categoryIds,
        subcategoryIds,
        labels: selectedTagNames,
      }),
    [range, accountIds, categoryIds, subcategoryIds, selectedTagNames],
  );

  // FR8 — live count over the projected movements. Counts MOVEMENTS that match
  // the filters (mirrors buildExportRows matching at movement granularity); the
  // authoritative row count after split expansion is returned by main.prepare.
  const matchCount = useMemo(() => {
    if (!range) return null;
    const accSet = accountIds.length > 0 ? new Set(accountIds) : null;
    const catSet = categoryIds.length > 0 ? new Set(categoryIds) : null;
    const subSet = subcategoryIds.length > 0 ? new Set(subcategoryIds) : null;
    const tagSet = tagIds.length > 0 ? new Set(tagIds) : null;
    let count = 0;
    for (const m of movements) {
      if (m.date < range.from || m.date > range.to) continue;
      if (accSet && !accSet.has(m.accountId)) continue;
      if (tagSet && !m.tagIds.some((id) => tagSet.has(id))) continue;
      if (catSet) {
        const own = m.categoryId !== null && catSet.has(m.categoryId);
        const split = (m.splitCategoryIds ?? []).some((id) => catSet.has(id));
        if (!own && !split) continue;
      }
      if (subSet) {
        const own = m.subcategoryId !== null && subSet.has(m.subcategoryId);
        const split = (m.splitSubcategoryIds ?? []).some((id) => subSet.has(id));
        if (!own && !split) continue;
      }
      count += 1;
    }
    return count;
  }, [movements, range, accountIds, categoryIds, subcategoryIds, tagIds]);

  const aboveCap = matchCount !== null && matchCount > MAX_EXPORT_ROWS;
  const largeWarning = matchCount !== null && matchCount > 10_000 && matchCount <= MAX_EXPORT_ROWS;

  const canExport =
    gateSatisfied &&
    matchCount !== null &&
    matchCount > 0 &&
    !aboveCap &&
    (phase.kind === 'idle' || phase.kind === 'success' || phase.kind === 'error');

  // ── Date range handlers ──────────────────────────────────────────
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
    setAccountIds([]);
    setCategoryIds([]);
    setSubcategoryIds([]);
    setTagIds([]);
    setRange(null);
    setActivePreset(null);
    setCustomFrom('');
    setCustomTo('');
    setPhase({ kind: 'idle' });
  }, []);

  // ── Export pipeline ──────────────────────────────────────────────
  const unsubscribeRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      unsubscribeRef.current?.();
    },
    [],
  );

  const startExport = useCallback(async () => {
    if (!filters) return;
    setConfirmOpen(false);
    setPhase({ kind: 'preparing' });

    const locale = toExportLocale(i18n.language);
    let prep;
    try {
      prep = await prepareExport({ format, filters, locale, dateFormat, numberFormat });
    } catch {
      setPhase({ kind: 'error', code: 'EXPORT_INTERNAL', recoverable: false });
      return;
    }

    if (!prep.ok) {
      if (prep.code === 'USER_CANCELLED_DIALOG') {
        setPhase({ kind: 'idle' });
        return;
      }
      if (prep.code === 'EXPORT_DEST_INSIDE_WORKSPACE' || prep.code === 'EXPORT_DEST_TEMP_DIR') {
        setPhase({ kind: 'blocked-workspace' });
        return;
      }
      const recoverable = prep.code === 'EXPORT_RATE_LIMITED' || prep.code === 'EXPORT_LOCKED_OUT';
      setPhase({ kind: 'error', code: prep.code, recoverable });
      return;
    }

    setPhase({ kind: 'exporting', progress: null });
    unsubscribeRef.current?.();
    unsubscribeRef.current = onExportProgress((progress) => {
      setPhase((cur) => (cur.kind === 'exporting' ? { kind: 'exporting', progress } : cur));
    });

    let result;
    try {
      result = await runExport(prep.confirmationToken);
    } catch {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setPhase({ kind: 'error', code: 'EXPORT_WRITE_FAILED', recoverable: true });
      return;
    }
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;

    if (result.ok) {
      setPhase({ kind: 'success', basename: result.basename, rowCount: result.rowCount });
    } else {
      const recoverable =
        result.code === 'EXPORT_WRITE_FAILED' ||
        result.code === 'EXPORT_RATE_LIMITED' ||
        result.code === 'EXPORT_LOCKED_OUT';
      setPhase({ kind: 'error', code: result.code, recoverable });
    }
  }, [dateFormat, filters, format, i18n.language, numberFormat]);

  const handleReveal = useCallback(() => {
    void revealLastExport();
  }, []);

  const errorCopy = useCallback(
    (code: string): string => {
      const key = `export.errors.${code}`;
      const translated = t(key);
      return translated === key ? t('export.errors.EXPORT_INTERNAL') : translated;
    },
    [t],
  );

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="ot-export">
      <header className="ot-page-header">
        <div>
          <h1>{t('export.title')}</h1>
          <p className="ot-page-header__subtitle">{t('export.subtitle')}</p>
        </div>
      </header>

      <Card className="ot-export__filters">
        <fieldset className="ot-export__group">
          <legend className="ot-export__legend">{t('export.filters.dateRange')}</legend>
          <div
            className="ot-export__presets"
            role="group"
            aria-label={t('export.filters.dateRange')}
          >
            {DATE_PRESET_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`ot-export__preset ${activePreset === id ? 'ot-export__preset--active' : ''}`}
                aria-pressed={activePreset === id}
                onClick={() => applyPreset(id)}
              >
                {t(`export.presets.${id}`)}
              </button>
            ))}
          </div>
          <div className="ot-export__custom">
            <label className="ot-export__date-label">
              <span>{t('export.filters.from')}</span>
              <DateInput value={customFrom} max={customTo || undefined} onChange={setCustomFrom} />
            </label>
            <label className="ot-export__date-label">
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
            <p className="ot-export__field-error" role="alert">
              {t('export.filters.invalidRange')}
            </p>
          )}
        </fieldset>

        <fieldset className="ot-export__group" disabled={dataLoading}>
          <legend className="ot-export__legend">{t('export.filters.accounts')}</legend>
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

        <fieldset className="ot-export__group" disabled={dataLoading}>
          <legend className="ot-export__legend">{t('export.filters.categories')}</legend>
          <TagChipPicker
            availableTags={categories.map((c) => ({
              id: c.id,
              name: c.name,
              ...(c.color ? { color: c.color } : {}),
            }))}
            selectedIds={categoryIds}
            onToggle={toggle(setCategoryIds)}
            colored
          />
        </fieldset>

        <fieldset className="ot-export__group" disabled={dataLoading}>
          <legend className="ot-export__legend">{t('export.filters.subcategories')}</legend>
          <TagChipPicker
            availableTags={subcategoryOptions}
            selectedIds={subcategoryIds}
            onToggle={toggle(setSubcategoryIds)}
            colored
          />
        </fieldset>

        <fieldset className="ot-export__group" disabled={dataLoading}>
          <legend className="ot-export__legend">{t('export.filters.labels')}</legend>
          <TagChipPicker
            availableTags={tags.map((tag) => ({
              id: tag.id,
              name: tag.name,
              ...(tag.color ? { color: tag.color } : {}),
            }))}
            selectedIds={tagIds}
            onToggle={toggle(setTagIds)}
            colored
          />
        </fieldset>

        <div className="ot-export__filters-footer">
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            {t('export.clearFilters')}
          </Button>
        </div>
      </Card>

      <div className="ot-export__count" aria-live="polite">
        {range === null ? (
          <p className="ot-export__count-empty">{t('export.empty.pickRange')}</p>
        ) : aboveCap ? (
          <p className="ot-export__count-error" role="alert">
            {t('export.aboveCap', { n: matchCount })}
          </p>
        ) : matchCount === 0 ? (
          <p className="ot-export__count-empty">{t('export.emptyResults')}</p>
        ) : (
          <>
            <p className="ot-export__count-ready">{t('export.ready', { n: matchCount })}</p>
            {largeWarning && (
              <p className="ot-export__count-warning">
                {t('export.largeWarning', { n: matchCount })}
              </p>
            )}
          </>
        )}
        {!gateSatisfied && range !== null && (
          <p className="ot-export__needs-filter">{t('export.needsFilter.banner')}</p>
        )}
      </div>

      <Card className="ot-export__formats">
        <fieldset className="ot-export__group">
          <legend className="ot-export__legend">{t('export.format.legend')}</legend>
          <div className="ot-export__format-options" role="radiogroup">
            {(['csv', 'xlsx'] as const).map((fmt) => (
              <label
                key={fmt}
                className={`ot-export__format-card ${format === fmt ? 'ot-export__format-card--active' : ''}`}
              >
                <input
                  type="radio"
                  name="export-format"
                  value={fmt}
                  checked={format === fmt}
                  onChange={() => setFormat(fmt)}
                />
                <span className="ot-export__format-name">
                  {t(fmt === 'csv' ? 'export.format.csv' : 'export.format.excel')}
                </span>
                <span className="ot-export__format-helper">
                  {t(fmt === 'csv' ? 'export.format.csvHelper' : 'export.format.excelHelper')}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      {phase.kind === 'success' && (
        <div className="ot-export__banner ot-export__banner--success" role="status">
          <span>{t('export.success', { n: phase.rowCount, basename: phase.basename })}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leadingIcon={<FolderOpen size={16} />}
            onClick={handleReveal}
          >
            {t('export.showInFolder')}
          </Button>
        </div>
      )}
      {phase.kind === 'error' && (
        <div className="ot-export__banner ot-export__banner--danger" role="alert">
          <span>{errorCopy(phase.code)}</span>
          {phase.recoverable && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
              {t('export.error.retry')}
            </Button>
          )}
        </div>
      )}
      {phase.kind === 'blocked-workspace' && (
        <div className="ot-export__banner ot-export__banner--danger" role="alert">
          <strong>{t('export.block.workspace.title')}</strong>
          <span>{t('export.block.workspace.body')}</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmOpen(true)}>
            {t('export.block.workspace.choose')}
          </Button>
        </div>
      )}
      {phase.kind === 'exporting' && (
        <div className="ot-export__banner" role="status" aria-live="polite">
          {phase.progress ? (
            <span>
              {t('export.progress', {
                done: phase.progress.rowsDone,
                total: phase.progress.rowsTotal,
              })}
            </span>
          ) : (
            <span>{t('export.exporting')}</span>
          )}
        </div>
      )}

      <div className="ot-export__actions">
        <Button
          type="button"
          variant="primary"
          size="lg"
          leadingIcon={<Download size={18} />}
          disabled={!canExport}
          loading={phase.kind === 'preparing' || phase.kind === 'exporting'}
          aria-disabled={!canExport}
          title={!gateSatisfied ? t('export.needsFilter.tooltip') : undefined}
          onClick={() => setConfirmOpen(true)}
        >
          {t('export.btn.export')}
        </Button>
      </div>

      <ExportConfirmModal
        isOpen={confirmOpen}
        locale={toExportLocale(i18n.language)}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void startExport()}
      />
    </div>
  );
}
