import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ja from './locales/ja.json';

export const SETTINGS_STORAGE_KEY = 'fastbriefing-settings';
export const SETTINGS_VERSION = 1;
export const SUPPORTED_LANGUAGES = ['ja', 'en'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'ja';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

function getStorage(): Pick<Storage, 'getItem'> | null {
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * Read only the already-versioned language setting before React renders.
 * Every storage access and parse is guarded so a blocked or malformed store
 * cannot prevent i18n from initializing.
 */
export function loadInitialLanguage(storage: Pick<Storage, 'getItem'> | null = getStorage()): SupportedLanguage {
  if (!storage) return DEFAULT_LANGUAGE;

  try {
    const serialized = storage.getItem(SETTINGS_STORAGE_KEY);
    if (serialized === null) return DEFAULT_LANGUAGE;

    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.settingsVersion !== SETTINGS_VERSION || !isSupportedLanguage(value.language)) {
      return DEFAULT_LANGUAGE;
    }

    return value.language;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export const i18nReady = i18n
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
    },
    lng: loadInitialLanguage(),
    fallbackLng: 'ja',
    interpolation: { escapeValue: false },
  });

export default i18n;
