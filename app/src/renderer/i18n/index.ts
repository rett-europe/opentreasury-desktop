// i18n initialization — see ADR-003.
// Namespaces load statically from locales/{lang}/{namespace}.json.
// Missing-key behavior: fail loud in dev, fallback to EN in prod (ADR-003 §5.3).
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from '../locales/en/common.json';
import esCommon from '../locales/es/common.json';

const isDev = import.meta.env.DEV;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // ADR-003 §7.1 — default to ES for the Rett Spain pilot if detection is unclear.
    fallbackLng: 'en',
    supportedLngs: ['es', 'en'],
    load: 'languageOnly', // 'es-ES' → 'es'
    ns: ['common'],
    defaultNS: 'common',
    resources: {
      en: { common: enCommon },
      es: { common: esCommon },
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
    returnEmptyString: false,
    returnNull: false,
    debug: isDev,
    // TODO(ADR-003 §9.2): wire CI missing-key check in PRD-009 implementation.
    saveMissing: false,
    missingKeyHandler: isDev
      ? (lngs, ns, key): void => {
          // eslint-disable-next-line no-console
          console.warn(`[i18n] MISSING KEY ${ns}:${key} for ${lngs.join(',')}`);
        }
      : undefined,
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'opentreasury.locale',
      caches: ['localStorage'],
    },
  });

export { i18n };
