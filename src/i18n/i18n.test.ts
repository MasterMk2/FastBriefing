// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { readdir, readFile } from 'node:fs/promises';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { fileURLToPath } from 'node:url';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import ja from './locales/ja.json';
import i18n, { i18nReady, loadInitialLanguage, SETTINGS_VERSION } from './index';

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

describe('i18n resources', () => {
  it('ja and en have exactly the same translation keys', async () => {
    await i18nReady;
    expect(Object.keys(flattenTranslations(en)).sort()).toEqual(Object.keys(flattenTranslations(ja)).sort());
  });

  it('has no empty translation values', () => {
    for (const [key, value] of Object.entries(flattenTranslations(ja))) {
      expect(value, `ja.${key}`).not.toBe('');
    }
    for (const [key, value] of Object.entries(flattenTranslations(en))) {
      expect(value, `en.${key}`).not.toBe('');
    }
  });

  it('has a Japanese translation for every static key used by source code', async () => {
    // Dynamic keys (template literals or variables) cannot be determined by this static scan.
    const references = await collectStaticTranslationReferences();
    const jaKeys = new Set(Object.keys(flattenTranslations(ja)));
    const missing = references
      .filter(reference => !jaKeys.has(reference.key))
      .map(reference => `${reference.file}:${reference.line} -> ${reference.key}`);

    expect(missing).toEqual([]);
  });

  it('returns English explicitly and Japanese by default', async () => {
    await i18nReady;
    await i18n.changeLanguage('ja');

    expect(i18n.t('overview.sortie', { lng: 'en' })).toBe(en.overview.sortie);
    expect(i18n.t('overview.sortie')).toBe(ja.overview.sortie);
  });

  it('keeps a valid language while v1 and v2 settings migrate to the current schema', () => {
    for (const settingsVersion of [1, 2, SETTINGS_VERSION]) {
      const storage = {
        getItem: () => JSON.stringify({ settingsVersion, language: 'en' }),
      };
      expect(loadInitialLanguage(storage)).toBe('en');
    }
  });
});
