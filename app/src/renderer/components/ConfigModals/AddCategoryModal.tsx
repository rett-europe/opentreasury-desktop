import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { createCategory } from '../../services/categoriesApi.js';
import { updateCategory } from '../../services/configMutationsApi.js';
import type {
  CategoryKind,
  CategoryRecord,
  CreateCategoryResponse,
} from '../../../shared/ipc-contracts/categories.js';
import { ConfigModalShell } from './ConfigModalShell.js';
import { mapConfigErrorToFieldKey } from './errorMap.js';

// Preset 8-color palette (data values — not design tokens). Tags/categories
// store the literal hex so imports/exports remain deterministic across themes.
export const CATEGORY_PALETTE: readonly string[] = [
  '#6d4d8c', // brand purple
  '#2563eb', // blue
  '#059669', // green
  '#dc2626', // red
  '#ea580c', // orange
  '#ca8a04', // amber
  '#7c3aed', // violet
  '#0891b2', // cyan
];

export interface AddCategoryModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSaved: (category: CategoryRecord) => void;
  readonly mode?: 'add' | 'edit';
  readonly record?: CategoryRecord | null;
}

interface Errors {
  name?: string;
  color?: string;
  kind?: string;
}

export function AddCategoryModal({
  isOpen,
  onClose,
  onSaved,
  mode = 'add',
  record = null,
}: AddCategoryModalProps): JSX.Element {
  const { t } = useTranslation('common');

  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [kind, setKind] = useState<CategoryKind | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && record) {
        setName(record.name);
        setColor(record.color ?? null);
        setKind(record.kind ?? null);
      } else {
        setName('');
        setColor(null);
        setKind(null);
      }
      setErrors({});
      setGeneralError(null);
      setSubmitting(false);
    }
  }, [isOpen, mode, record]);

  const validate = useCallback((): boolean => {
    const next: Errors = {};
    if (!name.trim()) next.name = t('configuracion.errors.nameEmpty');
    else if (name.trim().length > 80) next.name = t('configuracion.errors.nameTooLong');
    if (!kind) next.kind = t('configuracion.errors.nameEmpty');
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [name, kind, t]);

  const applyServerError = useCallback(
    (resp: Extract<CreateCategoryResponse, { ok: false }>) => {
      const { error } = resp;
      const fieldKey = mapConfigErrorToFieldKey(error.code);
      const msg = t(`configuracion.errors.${fieldKey}`, { defaultValue: error.message });
      if (error.field === 'name') setErrors((prev) => ({ ...prev, name: msg }));
      else if (error.field === 'color') setErrors((prev) => ({ ...prev, color: msg }));
      else setGeneralError(msg);
    },
    [t],
  );

  const handleSubmit = useCallback(async () => {
    setGeneralError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (mode === 'edit' && record) {
        const updated = await updateCategory(record.id, {
          name: name.trim(),
          color: color ?? undefined,
          ...(kind !== null ? { kind } : {}),
        });
        onSaved(updated);
        onClose();
        return;
      }
      const resp = await createCategory({
        name: name.trim(),
        color: color ?? undefined,
        ...(kind !== null ? { kind } : {}),
      });
      if (!resp.ok) {
        applyServerError(resp);
        return;
      }
      onSaved({
        id: resp.event.id,
        name: resp.event.name,
        createdAt: resp.event.createdAt,
        ...(resp.event.color !== undefined ? { color: resp.event.color } : {}),
        ...(resp.event.kind !== undefined ? { kind: resp.event.kind } : {}),
      });
      onClose();
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : t('configuracion.errors.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [validate, name, color, kind, onSaved, onClose, applyServerError, mode, record, t]);

  return (
    <ConfigModalShell
      isOpen={isOpen}
      titleKey={
        mode === 'edit'
          ? 'configuracion.categorias.modal.editTitle'
          : 'configuracion.categorias.modal.title'
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      submitting={submitting}
      generalError={generalError}
    >
      <div className="ot-config-modal__field">
        <label htmlFor="cat-name" className="ot-config-modal__label">
          {t('configuracion.categorias.name')}
        </label>
        <input
          id="cat-name"
          className="ot-config-modal__input"
          type="text"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'cat-name-err' : undefined}
          autoFocus
        />
        {errors.name ? (
          <span id="cat-name-err" className="ot-config-modal__field-error">
            {errors.name}
          </span>
        ) : null}
      </div>

      <div className="ot-config-modal__field">
        <span className="ot-config-modal__label" id="cat-kind-label">
          {t('configuracion.categorias.kind.label')}
        </span>
        <div
          className="ot-config__kind-choice"
          role="radiogroup"
          aria-labelledby="cat-kind-label"
          aria-invalid={Boolean(errors.kind)}
        >
          <button
            type="button"
            role="radio"
            aria-checked={kind === 'income'}
            className={`ot-config__kind-choice-btn ot-config__kind-choice-btn--income${
              kind === 'income' ? ' ot-config__kind-choice-btn--active' : ''
            }`}
            onClick={() => setKind('income')}
          >
            {t('configuracion.categorias.kind.income')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={kind === 'expense'}
            className={`ot-config__kind-choice-btn ot-config__kind-choice-btn--expense${
              kind === 'expense' ? ' ot-config__kind-choice-btn--active' : ''
            }`}
            onClick={() => setKind('expense')}
          >
            {t('configuracion.categorias.kind.expense')}
          </button>
        </div>
        {errors.kind ? (
          <span className="ot-config-modal__field-error">{errors.kind}</span>
        ) : (
          <span className="ot-config-modal__label-hint">
            {t('configuracion.categorias.kind.hint')}
          </span>
        )}
      </div>

      <div className="ot-config-modal__field">
        <span className="ot-config-modal__label" id="cat-color-label">
          {t('configuracion.categorias.color')}
          <span className="ot-config-modal__label-hint">{t('configuracion.optional')}</span>
        </span>
        <div
          className="ot-config-modal__palette"
          role="radiogroup"
          aria-labelledby="cat-color-label"
        >
          <button
            type="button"
            className="ot-config-modal__swatch ot-config-modal__swatch--clear"
            role="radio"
            aria-checked={color === null}
            aria-label={t('configuracion.categorias.colorNone')}
            onClick={() => setColor(null)}
          >
            {color === null ? <Check size={14} aria-hidden="true" /> : '—'}
          </button>
          {CATEGORY_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              className="ot-config-modal__swatch"
              role="radio"
              aria-checked={color === hex}
              aria-label={hex}
              style={{ background: hex }}
              onClick={() => setColor(hex)}
            >
              {color === hex ? <Check size={14} color="#fff" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        {errors.color ? <span className="ot-config-modal__field-error">{errors.color}</span> : null}
      </div>
    </ConfigModalShell>
  );
}
