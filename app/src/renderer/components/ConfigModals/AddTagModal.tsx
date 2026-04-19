import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createTag } from '../../services/tagsApi.js';
import type { CreateTagResponse, TagRecord } from '../../../shared/ipc-contracts/tags.js';
import { ConfigModalShell } from './ConfigModalShell.js';
import { mapConfigErrorToFieldKey } from './errorMap.js';

export interface AddTagModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onCreated: (tag: TagRecord) => void;
}

export function AddTagModal({ isOpen, onClose, onCreated }: AddTagModalProps): JSX.Element {
  const { t } = useTranslation('common');

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setError(null);
      setGeneralError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

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
      const resp = await createTag({ name: trimmed });
      if (!resp.ok) {
        applyServerError(resp);
        return;
      }
      onCreated({
        id: resp.event.id,
        name: resp.event.name,
        createdAt: resp.event.createdAt,
      });
      onClose();
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : t('configuracion.errors.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [name, onCreated, onClose, applyServerError, t]);

  return (
    <ConfigModalShell
      isOpen={isOpen}
      titleKey="configuracion.etiquetas.modal.title"
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
    </ConfigModalShell>
  );
}
