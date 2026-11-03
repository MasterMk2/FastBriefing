import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const SETTINGS_STORAGE_KEY = 'fastbriefing-settings';
export const SETTINGS_VERSION = 5;
/** Settings records that loadInitialLanguage can still read (older versions migrate on load). */
export const READABLE_SETTINGS_VERSIONS: readonly number[] = [1, 2, 3, 4, SETTINGS_VERSION];
export const SUPPORTED_LANGUAGES = ['ja', 'en'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'ja';

/**
 * Translation namespaces. Every key names its namespace, for example `t('shell:nav.overview')`.
 * The old `legacy` namespace (the pre-redesign tabs) was removed with those tabs.
 */
export const NAMESPACES = [
  'shell', 'flight', 'map', 'export', 'briefing', 'comms', 'support', 'threats',
  'notes', 'revision', 'wingman', 'settings', 'issues', 'lint', 'overview', 'initial', 'common',
] as const;
export type Namespace = typeof NAMESPACES[number];
/**
 * i18next needs a default namespace. `common` is empty, so a key without a namespace shows as the raw key
 * instead of silently resolving somewhere; `src/i18n/i18n.test.ts` rejects such keys in the source.
 */
export const DEFAULT_NAMESPACE: Namespace = 'common';

type MessageTree = Record<string, unknown>;
export type LocaleModules = Record<string, { default: MessageTree }>;
export type LocaleResources = Record<SupportedLanguage, Record<string, MessageTree>>;

const localeModules = import.meta.glob<{ default: MessageTree }>('./locales/*/*.json', { eager: true }) as LocaleModules;

/**
 * Group `./locales/<lang>/<namespace>.json` modules by language and namespace.
 * Exported so that tests can check the file layout without a second glob.
 */
export function buildLocaleResources(modules: LocaleModules): LocaleResources {
  const resources: LocaleResources = { ja: {}, en: {} };
  for (const [path, module] of Object.entries(modules)) {
    const match = /\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const [, language, namespace] = match;
    if (language !== 'ja' && language !== 'en') continue;
    resources[language][namespace] = module.default;
  }
  return resources;
}

const resources = buildLocaleResources(localeModules);

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
    if (!isRecord(value)) return DEFAULT_LANGUAGE;
    const isReadableVersion = READABLE_SETTINGS_VERSIONS.includes(value.settingsVersion as number);
    if (!isReadableVersion || !isSupportedLanguage(value.language)) {
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
    resources,
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NAMESPACE,
    lng: loadInitialLanguage(),
    fallbackLng: 'ja',
    interpolation: { escapeValue: false },
  });

export default i18n;
