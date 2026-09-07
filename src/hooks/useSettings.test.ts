import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  type SettingsStorage,
  loadSettings,
  saveSettings,
} from './useSettings';

function createStorage(initialValue: string | null = null): SettingsStorage {
  let value = initialValue;
  return {
    getItem: () => value,
    setItem: (_key, nextValue) => {
      value = nextValue;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSettings persistence', () => {
  it('復元できない JSON は既定値へ戻す', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(loadSettings(createStorage('{ invalid json'))).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalled();
  });

  it('未知の列挙値はフィールド単位で既定値へ戻す', () => {
    const stored = JSON.stringify({
      settingsVersion: SETTINGS_VERSION,
      coordinateFormat: 'INVALID',
      altitudeUnit: 42,
      language: 'en',
      theme: 'INVALID',
    });

    expect(loadSettings(createStorage(stored))).toEqual({
      ...DEFAULT_SETTINGS,
      language: 'en',
    });
  });

  it('テーマ未保存の現行設定はdefaultへマイグレーションする', () => {
    const stored = JSON.stringify({
      settingsVersion: SETTINGS_VERSION,
      coordinateFormat: 'MGRS',
    });

    expect(loadSettings(createStorage(stored))).toEqual({
      ...DEFAULT_SETTINGS,
      coordinateFormat: 'MGRS',
      theme: 'default',
    });
  });

  it('FFSテーマを有効値として復元する', () => {
    const stored = JSON.stringify({
      settingsVersion: SETTINGS_VERSION,
      theme: 'ffs',
    });

    expect(loadSettings(createStorage(stored))).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'ffs',
    });
  });

  it('バージョン無しと古いバージョンは既定値へ移行する', () => {
    const withoutVersion = JSON.stringify({ coordinateFormat: 'MGRS' });
    const oldVersion = JSON.stringify({ settingsVersion: SETTINGS_VERSION - 1, coordinateFormat: 'MGRS' });

    expect(loadSettings(createStorage(withoutVersion))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(createStorage(oldVersion))).toEqual(DEFAULT_SETTINGS);
  });

  it('保存値には現在のスキーマバージョンを付ける', () => {
    const storage = createStorage();
    saveSettings({ ...DEFAULT_SETTINGS, coordinateFormat: 'MGRS' }, storage);

    expect(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toEqual({
      settingsVersion: SETTINGS_VERSION,
      ...DEFAULT_SETTINGS,
      coordinateFormat: 'MGRS',
    });
  });

  it('localStorage の読み書き例外をアプリへ伝播させない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const throwingStorage: SettingsStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };

    expect(loadSettings(throwingStorage)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, throwingStorage)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
