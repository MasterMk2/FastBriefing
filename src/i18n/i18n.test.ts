import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import ja from './locales/ja.json';
import i18n, { i18nReady } from './index';

function flattenTranslations(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce<Record<string, string>>((result, [key, child]) => {
    return { ...result, ...flattenTranslations(child, prefix ? `${prefix}.${key}` : key) };
  }, {});
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

  it('returns English explicitly and Japanese by default', async () => {
    await i18nReady;
    await i18n.changeLanguage('ja');

    expect(i18n.t('overview.sortie', { lng: 'en' })).toBe(en.overview.sortie);
    expect(i18n.t('overview.sortie')).toBe(ja.overview.sortie);
  });
});
