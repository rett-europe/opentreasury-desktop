import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Clock, Info } from 'lucide-react';
import type {
  AuditDeviceStatus,
  AuditVerifyStatusResponse,
} from '../../../shared/ipc-contracts/audit.js';

/** Inline up to this many device chips; collapse the rest into a popover (§4.1). */
const INLINE_DEVICE_LIMIT = 3;
/** When collapsing, this many chips stay inline (§4.1: "first 2 inline"). */
const INLINE_WHEN_COLLAPSED = 2;

function formatDate(iso: string | null, locale: string): string {
  if (iso === null) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface DeviceChipProps {
  readonly device: AuditDeviceStatus;
  readonly locale: string;
}

function deviceChipText(
  device: AuditDeviceStatus,
  locale: string,
  t: TFunction<'common'>,
): { name: string; status: string } {
  const name = device.isCurrentDevice ? t('audit.device.thisDevice') : device.deviceId;
  if (device.anchoredThrough === null) {
    return { name, status: t('audit.device.notAnchored') };
  }
  const date = formatDate(device.anchoredThrough, locale);
  const status =
    device.timestamp === 'pending'
      ? t('audit.device.anchoredThroughPending', { date })
      : t('audit.device.anchoredThrough', { date });
  return { name, status };
}

function DeviceChip({ device, locale }: DeviceChipProps): JSX.Element {
  const { t } = useTranslation('common');
  const { name, status } = deviceChipText(device, locale, t);
  const problem = device.status !== 'ok';
  return (
    <li
      className={`ot-audit__chip${problem ? ' ot-audit__chip--problem' : ''}`}
      aria-label={`${name} — ${status}`}
    >
      <Clock size={14} aria-hidden="true" />
      <span className="ot-audit__chip-name">{name}</span>
      <span className="ot-audit__chip-status">{status}</span>
    </li>
  );
}

export interface IntegrityBannerProps {
  readonly status: AuditVerifyStatusResponse;
  readonly locale: string;
}

/**
 * SPEC-028 §4.1 — the integrity banner (text + icon, never colour alone), the
 * per-device "anchored through" chips (inline up to N=3, popover beyond), the
 * informational amber unsealed-tail chip, and the normative limitation
 * disclosure. The banner region is `aria-live="polite"` (§6).
 */
export function IntegrityBanner({ status, locale }: IntegrityBannerProps): JSX.Element {
  const { t } = useTranslation('common');
  const [devicesOpen, setDevicesOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const banner = status.banner;
  const tone =
    banner === 'verified' || banner === 'verified-unsealed-tail'
      ? 'ok'
      : banner === 'no-anchors'
        ? 'neutral'
        : 'warn';

  const Icon = tone === 'ok' ? ShieldCheck : tone === 'neutral' ? ShieldQuestion : ShieldAlert;

  const label =
    banner === 'verified'
      ? t('audit.banner.verifiedLabel')
      : banner === 'verified-unsealed-tail'
        ? t('audit.banner.unsealedLabel')
        : banner === 'no-anchors'
          ? t('audit.banner.noAnchorsLabel')
          : t('audit.banner.unavailableLabel');

  const message =
    banner === 'verified' || banner === 'verified-unsealed-tail'
      ? t('audit.banner.verified')
      : banner === 'no-anchors'
        ? t('audit.banner.noAnchors')
        : t('audit.banner.unavailable');

  const devices = status.devices;
  const collapse = devices.length >= INLINE_DEVICE_LIMIT + 1;
  const inlineCount = collapse ? INLINE_WHEN_COLLAPSED : devices.length;
  const inlineDevices = devices.slice(0, inlineCount);
  const hiddenDevices = devices.slice(inlineCount);

  return (
    <section className={`ot-audit__banner ot-audit__banner--${tone}`} aria-label={label}>
      <div className="ot-audit__banner-main" role="status" aria-live="polite">
        <Icon size={20} aria-hidden="true" className="ot-audit__banner-icon" />
        <div className="ot-audit__banner-text">
          <span className="ot-audit__banner-label">{label}</span>
          <span className="ot-audit__banner-message">{message}</span>
        </div>
      </div>

      {status.unsealedTailCount > 0 && (
        <p className="ot-audit__unsealed" role="note">
          {t('audit.unsealedTail', { count: status.unsealedTailCount })}
        </p>
      )}

      {devices.length > 0 && (
        <div className="ot-audit__devices">
          <ul className="ot-audit__chips">
            {inlineDevices.map((d) => (
              <DeviceChip key={d.deviceId} device={d} locale={locale} />
            ))}
          </ul>
          {collapse && (
            <div className="ot-audit__devices-popover-wrap" ref={popoverRef}>
              <button
                type="button"
                className="ot-audit__devices-toggle"
                aria-expanded={devicesOpen}
                onClick={() => setDevicesOpen((o) => !o)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setDevicesOpen(false);
                }}
              >
                {t('audit.viewDevices', { count: hiddenDevices.length })}
              </button>
              {devicesOpen && (
                <div className="ot-audit__devices-popover" role="group" aria-label={label}>
                  <ul className="ot-audit__chips ot-audit__chips--stacked">
                    {hiddenDevices.map((d) => (
                      <DeviceChip key={d.deviceId} device={d} locale={locale} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <details className="ot-audit__limitation">
        <summary>
          <Info size={14} aria-hidden="true" /> {t('audit.limitationLabel')}
        </summary>
        <p>{t('audit.limitation')}</p>
      </details>
    </section>
  );
}
