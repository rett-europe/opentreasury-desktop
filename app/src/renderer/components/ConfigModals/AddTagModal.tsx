import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Tag as TagIcon } from 'lucide-react';
import { createTag } from '../../services/tagsApi.js';
import { ConfigMutationError, updateTag } from '../../services/configMutationsApi.js';
import type { CreateTagResponse, TagRecord } from '../../../shared/ipc-contracts/tags.js';
import { ConfigModalShell } from './ConfigModalShell.js';
import { mapConfigErrorToFieldKey, mapConfigMutationErrorToMessage } from './errorMap.js';
import { CATEGORY_PALETTE } from './AddCategoryModal.js';

export interface AddTagModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSaved: (tag: TagRecord) => void;
  readonly mode?: 'add' | 'edit';
  readonly record?: TagRecord | null;
}

export function AddTagModal({
  isOpen,
  onClose,
  onSaved,
  mode = 'add',
  record = null,
}: AddTagModalProps): JSX.Element {
  const { t } = useTranslation('common');

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_PALETTE[0] ?? '#6d4d8c');
  const [error, setError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && record) {
        setName(record.name);
        setColor(record.color ?? CATEGORY_PALETTE[0] ?? '#6d4d8c');
      } else {
        setName('');
        setColor(CATEGORY_PALETTE[0] ?? '#6d4d8c');
      }
      setError(null);
      setGeneralError(null);
      setSubmitting(false);
    }
  }, [isOpen, mode, record]);

  const applyServerError = useCallback(
    (resp: Extract<CreateTagResponse, { ok: false }>) => {
      const fieldKey = mapConfigErrorToFieldKey(resp.error.code);
      const msg = t(`configuracion.errors.${fieldKey}`, { defaultValue: resp.error.message });
      if (resp.error.field === 'name') setError(msg);
      else setGeneralError(msg);
    },
    [t],
  );

  const handleSubmit = useCallback(async () => {
    setGeneralError(null);
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('configuracion.errors.nameEmpty'));
      return;
    }
    if (trimmed.length > 30) {
      setError(t('configuracion.errors.nameTooLong'));
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'edit' && record) {
        await updateTag(record.id, { name: trimmed, color });
        onSaved({ ...record, name: trimmed, color });
        onClose();
        return;
      }
      const resp = await createTag({ name: trimmed, color });
      if (!resp.ok) {
        applyServerError(resp);
        return;
      }
      onSaved({
        id: resp.event.id,
        name: resp.event.name,
        sortOrder: resp.event.sortOrder,
        createdAt: resp.event.createdAt,
        ...(resp.event.color !== undefined ? { color: resp.event.color } : {}),
      });
      onClose();
    } catch (err) {
      if (err instanceof ConfigMutationError) {
        const msg = mapConfigMutationErrorToMessage(err, t);
        if (err.field === 'name') setError(msg);
        else setGeneralError(msg);
      } else {
        setGeneralError(
          err instanceof Error ? err.message : t('configuracion.errors.submitFailed'),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }, [name, color, onSaved, onClose, applyServerError, mode, record, t]);

  return (
    <ConfigModalShell
      isOpen={isOpen}
      titleKey={
        mode === 'edit'
          ? 'configuracion.etiquetas.modal.editTitle'
          : 'configuracion.etiquetas.modal.title'
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      submitting={submitting}
      generalError={generalError}
    >
      <div className="ot-config-modal__field">
        <label htmlFor="tag-name" className="ot-config-modal__label">
          {t('configuracion.etiquetas.name')}
        </label>
        <input
          id="tag-name"
          className="ot-config-modal__input"
          type="text"
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'tag-name-err' : undefined}
          autoFocus
        />
        {error ? (
          <span id="tag-name-err" className="ot-config-modal__field-error">
            {error}
          </span>
        ) : null}
      </div>

      <div className="ot-config-modal__field">
        <span className="ot-config-modal__label" id="tag-color-label">
          Color
        </span>
        <div
          className="ot-config-modal__palette"
          role="radiogroup"
          aria-labelledby="tag-color-label"
        >
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
      </div>

      <div className="ot-config-modal__field">
        <span className="ot-config-modal__label">Vista previa</span>
        <div className="ot-config-modal__preview-box">
          <span
            className="ot-config__tag-pill"
            style={{
              background: `color-mix(in srgb, ${color} 30%, transparent)`,
              color: 'var(--color-text-primary)',
            }}
          >
            <TagIcon size={10} aria-hidden="true" />
            {name || 'Nombre de la etiqueta'}
          </span>
          <span
            className="ot-config__swatch-lg"
            style={{ background: color, marginLeft: 'auto' }}
            aria-hidden="true"
          />
        </div>
      </div>
    </ConfigModalShell>
  );
}
