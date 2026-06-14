import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getOrgProfile,
  saveOrgProfile,
  setOrgLogo,
  removeOrgLogo,
  getOrgLogo,
} from '../../services/orgProfileApi.js';
import {
  LOGO_MIME_TYPES,
  type OrgProfileEditable,
  type LogoMetadata,
  type LogoErrorCode,
} from '../../../shared/ipc-contracts/org-profile.js';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type LogoState = 'idle' | 'uploading' | 'error';

const EMPTY_EDITS: OrgProfileEditable = {
  orgName: '',
  legalRegistrationLine: '',
  address: '',
  contactEmail: '',
  treasurer: { name: '', role: '', place: '' },
  auditor: { name: '', role: '', place: '' },
};

/** Read a File as a base64 string (without the data: prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('unexpected reader result'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Organisation profile settings card (SPEC-030 WI-4). Captures the org details
 * that feed the Financial Report header (FR3) and signature footer (FR9):
 * org name, legal registration line, address, contact email, a logo, and two
 * signatory blocks (treasurer + external auditor). All fields are optional —
 * the report screen allows at-generation overrides later.
 *
 * The logo is a non-sensitive branding asset persisted in userData (never the
 * encrypted treasury store).
 */
export function OrgProfileCard(): JSX.Element {
  const { t } = useTranslation('common');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [edits, setEdits] = useState<OrgProfileEditable>(EMPTY_EDITS);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [emailError, setEmailError] = useState(false);

  const [logo, setLogo] = useState<LogoMetadata | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoState, setLogoState] = useState<LogoState>('idle');
  const [logoErrorCode, setLogoErrorCode] = useState<LogoErrorCode | null>(null);

  // Load profile + logo preview on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [profileResp, logoResp] = await Promise.all([getOrgProfile(), getOrgLogo()]);
        if (cancelled) return;
        if (profileResp.ok) {
          const p = profileResp.profile;
          setEdits({
            orgName: p.orgName,
            legalRegistrationLine: p.legalRegistrationLine,
            address: p.address,
            contactEmail: p.contactEmail,
            treasurer: p.treasurer,
            auditor: p.auditor,
          });
          setLogo(p.logo);
        }
        if (logoResp.ok) setLogoDataUrl(logoResp.dataUrl);
      } catch (err) {
        console.error('[OrgProfileCard] Failed to load org profile:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateField = useCallback(
    (field: keyof Omit<OrgProfileEditable, 'treasurer' | 'auditor'>, value: string) => {
      setEdits((prev) => ({ ...prev, [field]: value }));
      setSaveState('idle');
    },
    [],
  );

  const updateSignatory = useCallback(
    (block: 'treasurer' | 'auditor', field: 'name' | 'role' | 'place', value: string) => {
      setEdits((prev) => ({ ...prev, [block]: { ...prev[block], [field]: value } }));
      setSaveState('idle');
    },
    [],
  );

  const handleSave = useCallback(async () => {
    // Lightweight client-side email check (main re-validates with Zod).
    const email = edits.contactEmail.trim();
    if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    setSaveState('saving');
    try {
      const resp = await saveOrgProfile({
        ...edits,
        orgName: edits.orgName.trim(),
        legalRegistrationLine: edits.legalRegistrationLine.trim(),
        address: edits.address.trim(),
        contactEmail: email,
        treasurer: {
          name: edits.treasurer.name.trim(),
          role: edits.treasurer.role.trim(),
          place: edits.treasurer.place.trim(),
        },
        auditor: {
          name: edits.auditor.name.trim(),
          role: edits.auditor.role.trim(),
          place: edits.auditor.place.trim(),
        },
      });
      if (!resp.ok) {
        setSaveState('error');
        return;
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (err) {
      console.error('[OrgProfileCard] Save failed:', err);
      setSaveState('error');
    }
  }, [edits]);

  const handleLogoPick = useCallback(async (file: File) => {
    setLogoState('uploading');
    setLogoErrorCode(null);
    try {
      const dataBase64 = await fileToBase64(file);
      const resp = await setOrgLogo({
        fileName: file.name,
        // The <input accept> restricts to supported types; main re-validates.
        mimeType: (file.type || 'image/png') as (typeof LOGO_MIME_TYPES)[number],
        dataBase64,
      });
      if (!resp.ok) {
        setLogoState('error');
        setLogoErrorCode(resp.error.code as LogoErrorCode);
        return;
      }
      setLogo(resp.profile.logo);
      const logoResp = await getOrgLogo();
      if (logoResp.ok) setLogoDataUrl(logoResp.dataUrl);
      setLogoState('idle');
    } catch (err) {
      console.error('[OrgProfileCard] Logo upload failed:', err);
      setLogoState('error');
      setLogoErrorCode('INVALID_IMAGE');
    }
  }, []);

  const handleRemoveLogo = useCallback(async () => {
    setLogoState('uploading');
    setLogoErrorCode(null);
    try {
      const resp = await removeOrgLogo();
      if (resp.ok) {
        setLogo(null);
        setLogoDataUrl(null);
      }
      setLogoState('idle');
    } catch (err) {
      console.error('[OrgProfileCard] Logo removal failed:', err);
      setLogoState('idle');
    }
  }, []);

  return (
    <section className="ot-preferences__card">
      <h2 className="ot-preferences__card-title">{t('preferences.orgProfile.title')}</h2>
      <div className="ot-preferences__card-content">
        <p className="ot-preferences__note ot-preferences__note--info">
          {t('preferences.orgProfile.description')}
        </p>

        <div className="ot-preferences__field">
          <label className="ot-preferences__label" htmlFor="org-name">
            {t('preferences.orgProfile.orgNameLabel')}
          </label>
          <input
            id="org-name"
            className="ot-preferences__input"
            type="text"
            maxLength={200}
            value={edits.orgName}
            onChange={(e) => updateField('orgName', e.target.value)}
          />
        </div>

        <div className="ot-preferences__field">
          <label className="ot-preferences__label" htmlFor="org-legal">
            {t('preferences.orgProfile.legalLineLabel')}
          </label>
          <input
            id="org-legal"
            className="ot-preferences__input"
            type="text"
            maxLength={200}
            placeholder={t('preferences.orgProfile.legalLinePlaceholder')}
            value={edits.legalRegistrationLine}
            onChange={(e) => updateField('legalRegistrationLine', e.target.value)}
          />
        </div>

        <div className="ot-preferences__field">
          <label className="ot-preferences__label" htmlFor="org-address">
            {t('preferences.orgProfile.addressLabel')}
          </label>
          <textarea
            id="org-address"
            className="ot-preferences__input"
            rows={3}
            maxLength={500}
            value={edits.address}
            onChange={(e) => updateField('address', e.target.value)}
          />
        </div>

        <div className="ot-preferences__field">
          <label className="ot-preferences__label" htmlFor="org-email">
            {t('preferences.orgProfile.emailLabel')}
          </label>
          <input
            id="org-email"
            className="ot-preferences__input"
            type="email"
            maxLength={254}
            value={edits.contactEmail}
            onChange={(e) => updateField('contactEmail', e.target.value)}
            aria-invalid={emailError}
          />
          {emailError ? (
            <span className="ot-preferences__error-msg">
              {t('preferences.orgProfile.errors.invalidEmail')}
            </span>
          ) : null}
        </div>

        {/* Logo --------------------------------------------------------- */}
        <div className="ot-preferences__field">
          <span className="ot-preferences__label">{t('preferences.orgProfile.logoLabel')}</span>
          <p className="ot-preferences__note">{t('preferences.orgProfile.logoHint')}</p>
          {logoDataUrl ? (
            <img
              src={logoDataUrl}
              alt={t('preferences.orgProfile.logoPreviewAlt')}
              style={{
                maxHeight: 56,
                maxWidth: 280,
                objectFit: 'contain',
                display: 'block',
                marginBottom: 'var(--space-3)',
              }}
            />
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept={LOGO_MIME_TYPES.join(',')}
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleLogoPick(file);
              e.target.value = '';
            }}
          />
          <div className="ot-preferences__button-group">
            <button
              type="button"
              className="ot-preferences__button ot-preferences__button--secondary"
              disabled={logoState === 'uploading'}
              onClick={() => fileInputRef.current?.click()}
            >
              {logo
                ? t('preferences.orgProfile.replaceLogo')
                : t('preferences.orgProfile.uploadLogo')}
            </button>
            {logo ? (
              <button
                type="button"
                className="ot-preferences__button ot-preferences__button--secondary"
                disabled={logoState === 'uploading'}
                onClick={() => void handleRemoveLogo()}
              >
                {t('preferences.orgProfile.removeLogo')}
              </button>
            ) : null}
          </div>
          {logoState === 'error' && logoErrorCode ? (
            <span className="ot-preferences__error-msg">
              {t(`preferences.orgProfile.logoErrors.${logoErrorCode}`)}
            </span>
          ) : null}
        </div>

        {/* Signatory blocks -------------------------------------------- */}
        <fieldset
          className="ot-preferences__field"
          style={{ border: 'none', padding: 0, margin: 0 }}
        >
          <legend className="ot-preferences__label">
            {t('preferences.orgProfile.treasurerLegend')}
          </legend>
          <SignatoryFields
            idPrefix="treasurer"
            value={edits.treasurer}
            onChange={(field, value) => updateSignatory('treasurer', field, value)}
            t={t}
          />
        </fieldset>

        <fieldset
          className="ot-preferences__field"
          style={{ border: 'none', padding: 0, margin: 0 }}
        >
          <legend className="ot-preferences__label">
            {t('preferences.orgProfile.auditorLegend')}
          </legend>
          <SignatoryFields
            idPrefix="auditor"
            value={edits.auditor}
            onChange={(field, value) => updateSignatory('auditor', field, value)}
            t={t}
          />
        </fieldset>

        <button
          type="button"
          className="ot-preferences__button"
          disabled={saveState === 'saving'}
          onClick={() => void handleSave()}
        >
          {saveState === 'saving'
            ? t('preferences.orgProfile.saving')
            : saveState === 'saved'
              ? t('preferences.orgProfile.saved')
              : t('preferences.orgProfile.saveButton')}
        </button>
        {saveState === 'error' ? (
          <p className="ot-preferences__error-msg">
            {t('preferences.orgProfile.errors.saveFailed')}
          </p>
        ) : null}
      </div>
    </section>
  );
}

interface SignatoryFieldsProps {
  readonly idPrefix: string;
  readonly value: { name: string; role: string; place: string };
  readonly onChange: (field: 'name' | 'role' | 'place', value: string) => void;
  readonly t: (key: string) => string;
}

function SignatoryFields({ idPrefix, value, onChange, t }: SignatoryFieldsProps): JSX.Element {
  return (
    <div className="ot-preferences__signatory">
      <input
        id={`${idPrefix}-name`}
        className="ot-preferences__input"
        type="text"
        maxLength={120}
        placeholder={t('preferences.orgProfile.signatoryName')}
        aria-label={t('preferences.orgProfile.signatoryName')}
        value={value.name}
        onChange={(e) => onChange('name', e.target.value)}
      />
      <input
        id={`${idPrefix}-role`}
        className="ot-preferences__input"
        type="text"
        maxLength={120}
        placeholder={t('preferences.orgProfile.signatoryRole')}
        aria-label={t('preferences.orgProfile.signatoryRole')}
        value={value.role}
        onChange={(e) => onChange('role', e.target.value)}
      />
      <input
        id={`${idPrefix}-place`}
        className="ot-preferences__input"
        type="text"
        maxLength={120}
        placeholder={t('preferences.orgProfile.signatoryPlace')}
        aria-label={t('preferences.orgProfile.signatoryPlace')}
        value={value.place}
        onChange={(e) => onChange('place', e.target.value)}
      />
    </div>
  );
}
