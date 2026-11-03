// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { readdir, readFile } from 'node:fs/promises';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { fileURLToPath } from 'node:url';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import shellEn from './locales/en/shell.json';
import shellJa from './locales/ja/shell.json';
import type { FileSelectionError } from '../core/MissionBatchLoader';
import { MissionLoadError } from '../core/MissionParser';
import { missionLoadErrorTranslationKey } from '../utils/missionLoadError';
import i18n, {
  buildLocaleResources,
  i18nReady,
  loadInitialLanguage,
  NAMESPACES,
  READABLE_SETTINGS_VERSIONS,
  SETTINGS_VERSION,
  type LocaleModules,
} from './index';

function flattenTranslations(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce<Record<string, string>>((result, [key, child]) => {
    return { ...result, ...flattenTranslations(child, prefix ? `${prefix}.${key}` : key) };
  }, {});
}

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const filePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(filePath));
    } else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(filePath);
    }
  }

  return files;
}

async function collectStaticTranslationReferences(): Promise<Array<{ key: string; file: string; line: number }>> {
  const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
  const sourceFiles = await collectSourceFiles(sourceRoot);
  const references: Array<{ key: string; file: string; line: number }> = [];
  const staticKeyPattern = /\bt\s*\(\s*(['"])([^'"]+)\1/g;

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, 'utf8');
    for (const match of source.matchAll(staticKeyPattern)) {
      const index = match.index ?? 0;
      references.push({
        key: match[2],
        file: relative(sourceRoot, filePath).split(sep).join('/'),
        line: source.slice(0, index).split(/\r?\n/).length,
      });
    }
  }

  return references;
}

/** Splits "ns:key" into its namespace and key. A key without a namespace has none (it cannot resolve). */
function splitNamespacedKey(key: string): { namespace: string | null; path: string } {
  const separator = key.indexOf(':');
  if (separator < 0) return { namespace: null, path: key };
  return { namespace: key.slice(0, separator), path: key.slice(separator + 1) };
}

/** The locale files as they exist on disk, loaded the same way index.ts loads them. */
const localeFiles = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*/*.json', { eager: true }) as LocaleModules;

describe('i18n resources', () => {
  it('has exactly the namespace files listed in NAMESPACES, in both languages', () => {
    const resources = buildLocaleResources(localeFiles);
    const expected = [...NAMESPACES].sort();
    expect(Object.keys(resources.ja).sort()).toEqual(expected);
    expect(Object.keys(resources.en).sort()).toEqual(expected);
  });

  it('pairs every namespace file on disk with a file that has the same keys in the other language', () => {
    const resources = buildLocaleResources(localeFiles);
    const namespaces = [...new Set([...Object.keys(resources.ja), ...Object.keys(resources.en)])];
    for (const namespace of namespaces) {
      const jaKeys = Object.keys(flattenTranslations(resources.ja[namespace])).sort();
      const enKeys = Object.keys(flattenTranslations(resources.en[namespace])).sort();
      expect(enKeys, `namespace ${namespace}`).toEqual(jaKeys);
    }
  });

  it('has no empty translation values', async () => {
    await i18nReady;
    for (const namespace of NAMESPACES) {
      for (const language of ['ja', 'en'] as const) {
        for (const [key, value] of Object.entries(flattenTranslations(i18n.getResourceBundle(language, namespace)))) {
          expect(value, `${language}/${namespace}.${key}`).not.toBe('');
        }
      }
    }
  });

  it('has a Japanese translation for every static key used by source code, in its namespace', async () => {
    // Dynamic keys (template literals or variables) cannot be determined by this static scan.
    await i18nReady;
    const references = await collectStaticTranslationReferences();
    const missing = references
      .filter(reference => {
        const { namespace, path } = splitNamespacedKey(reference.key);
        if (namespace === null) return true;
        const bundle = flattenTranslations(i18n.getResourceBundle('ja', namespace));
        return !(path in bundle);
      })
      .map(reference => `${reference.file}:${reference.line} -> ${reference.key}`);

    expect(missing).toEqual([]);
  }, 30_000);

  it('returns English explicitly and Japanese by default', async () => {
    await i18nReady;
    await i18n.changeLanguage('ja');

    expect(i18n.t('shell:app.retry', { lng: 'en' })).toBe(shellEn.app.retry);
    expect(i18n.t('shell:app.retry')).toBe(shellJa.app.retry);
  });

  it('has no legacy namespace any more, and an unprefixed key does not resolve', async () => {
    await i18nReady;
    expect([...NAMESPACES] as string[]).not.toContain('legacy');
    expect(i18n.t('app.retry')).toBe('app.retry');
  });

  it('resolves every file selection and mission load message in both languages (template keys the scan cannot see)', async () => {
    await i18nReady;
    const selection: FileSelectionError[] = ['invalidMizOnly', 'tooManyFiles'];
    const codes = ['empty-file', 'invalid-zip', 'archive-too-large', 'safety-limit', 'invalid-mission', 'parse-failed'] as const;
    const keys = [
      ...selection.map(code => `shell:app.${code}`),
      ...codes.map(code => missionLoadErrorTranslationKey(new MissionLoadError(code, 'detail'))),
      missionLoadErrorTranslationKey(new Error('other')),
    ];
    for (const key of keys) {
      for (const lng of ['ja', 'en'] as const) {
        expect(i18n.exists(key, { lng }), `${lng} ${key}`).toBe(true);
      }
    }
  });

  it('resolves namespaced keys in their own file', async () => {
    await i18nReady;
    expect(i18n.t('shell:nav.overview', { lng: 'ja' })).toBe('概要');
    expect(i18n.t('shell:nav.overview', { lng: 'en' })).toBe('Overview');
    expect(i18n.t('issues:map.unsupported', { lng: 'ja', theatre: 'Test' })).toContain('Test');
  });

  it('writes the English singular for a count of one, and the same text in Japanese (i18n-state-5)', async () => {
    await i18nReady;
    expect(i18n.t('revision:count', { lng: 'en', count: 1 })).toBe('1 change');
    expect(i18n.t('revision:count', { lng: 'en', count: 2 })).toBe('2 changes');
    expect(i18n.t('revision:count', { lng: 'ja', count: 1 })).toBe('変更 1 件');
  });

  it('keeps a valid language while every readable settings version migrates to the current schema', () => {
    expect(READABLE_SETTINGS_VERSIONS).toEqual([1, 2, 3, 4, SETTINGS_VERSION]);
    for (const settingsVersion of READABLE_SETTINGS_VERSIONS) {
      const storage = {
        getItem: () => JSON.stringify({ settingsVersion, language: 'en' }),
      };
      expect(loadInitialLanguage(storage)).toBe('en');
    }
  });

  it('calls the export section order the output section order, never 断面 (a cross-section)', () => {
    const japanese = Object.entries(localeFiles)
      .filter(([path]) => path.includes('/ja/'))
      .flatMap(([path, module]) => Object.entries(flattenTranslations(module.default)).map(([key, text]) => ({ key: `${path}:${key}`, text })));
    expect(japanese.length).toBeGreaterThan(0);
    expect(japanese.filter(entry => entry.text.includes('断面')).map(entry => entry.key)).toEqual([]);
    const settings = (language: 'ja' | 'en') => localeFiles[`./locales/${language}/settings.json`].default as { resetNote: string };
    expect(settings('ja').resetNote).toContain('出力の節の順序とプリセットは残ります');
    expect(settings('en').resetNote).toContain('The output section order and presets are kept.');
  });

  it('falls back to Japanese for unknown future versions and broken records', () => {
    expect(loadInitialLanguage({ getItem: () => JSON.stringify({ settingsVersion: SETTINGS_VERSION + 1, language: 'en' }) })).toBe('ja');
    expect(loadInitialLanguage({ getItem: () => '{broken' })).toBe('ja');
    expect(loadInitialLanguage({ getItem: () => { throw new Error('blocked'); } })).toBe('ja');
  });
});
