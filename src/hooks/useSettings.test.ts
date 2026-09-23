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

  it('テーマ未保存の現行設定はFFSへフォールバックする', () => {
    const stored = JSON.stringify({
      settingsVersion: SETTINGS_VERSION,
      coordinateFormat: 'MGRS',
    });

    expect(loadSettings(createStorage(stored))).toEqual({
      ...DEFAULT_SETTINGS,
      coordinateFormat: 'MGRS',
      theme: 'ffs',
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

  it('バージョン無しと未知のバージョンは既定値へ移行する', () => {
    const withoutVersion = JSON.stringify({ coordinateFormat: 'MGRS' });
    const unknownVersion = JSON.stringify({ settingsVersion: 0, coordinateFormat: 'MGRS' });

    expect(loadSettings(createStorage(withoutVersion))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(createStorage(unknownVersion))).toEqual(DEFAULT_SETTINGS);
  });

  it('v1記録は他項目を保持したままFFSへ移行する', () => {
    const stored = JSON.stringify({
      settingsVersion: 1,
      coordinateFormat: 'MGRS',
      language: 'en',
      theme: 'default',
    });

    expect(loadSettings(createStorage(stored))).toEqual({
      ...DEFAULT_SETTINGS,
      coordinateFormat: 'MGRS',
      language: 'en',
      theme: 'ffs',
    });
  });

  it('v2記録のdefault明示選択は尊重する', () => {
    const stored = JSON.stringify({
      settingsVersion: SETTINGS_VERSION,
      theme: 'default',
    });

    expect(loadSettings(createStorage(stored))).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'default',
    });
  });

  it('v2記録を既定のブリーフィング構成付きでv3へ移行する', () => {
    const stored = JSON.stringify({
      settingsVersion: 2,
      language: 'en',
      theme: 'default',
    });

    expect(loadSettings(createStorage(stored))).toEqual({
      ...DEFAULT_SETTINGS,
      language: 'en',
      theme: 'default',
    });
  });

  it('v3の選択順を保ちつつ新しい記入欄を概要の後へ追加する', () => {
    const stored = JSON.stringify({
      settingsVersion: 3,
      briefingSections: ['whiteboard', 'overview', 'map'],
    });

    expect(loadSettings(createStorage(stored)).briefingSections).toEqual([
      'whiteboard', 'overview', 'notes', 'map',
    ]);
  });

  it('v3の意図的な空選択は空のまま移行する', () => {
    const stored = JSON.stringify({ settingsVersion: 3, briefingSections: [] });
    expect(loadSettings(createStorage(stored)).briefingSections).toEqual([]);
  });

  it('名前付きプリセットを検証して重複と上限外データを除く', () => {
    const stored = JSON.stringify({
      settingsVersion: SETTINGS_VERSION,
      briefingPresets: [
        { name: ' Pilot ', sections: ['map', 'overview', 'map'] },
        { name: 'pilot', sections: ['threats'] },
        { name: '', sections: ['overview'] },
        { name: 'Broken', sections: 'overview' },
      ],
    });

    expect(loadSettings(createStorage(stored)).briefingPresets).toEqual([
      { name: 'Pilot', sections: ['map', 'overview'] },
    ]);
  });

  it('保存されたセクションを検証してユーザーの順序を保つ', () => {
    const stored = JSON.stringify({
      settingsVersion: SETTINGS_VERSION,
      briefingSections: ['whiteboard', 'invalid', 'overview', 'whiteboard'],
    });

    expect(loadSettings(createStorage(stored))).toEqual({
      ...DEFAULT_SETTINGS,
      briefingSections: ['whiteboard', 'overview'],
    });
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
    expect(saveSettings(DEFAULT_SETTINGS, throwingStorage)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('returns true only when a preset-bearing settings record was persisted', () => {
    const storage = createStorage();
    expect(saveSettings({
      ...DEFAULT_SETTINGS,
      briefingPresets: [{ name: 'Pilot', sections: ['overview', 'map'] }],
    }, storage)).toBe(true);
    expect(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? '{}').briefingPresets).toEqual([
      { name: 'Pilot', sections: ['overview', 'map'] },
    ]);
  });
});
