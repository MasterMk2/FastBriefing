import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  convertLuaNode,
  parseLuaTable,
  parseDictionary,
  parseMapResource,
  parseMissionArchive,
  shouldExtractEntry,
  unzipWithLimits,
  ZIP_LIMITS,
} from './missionParser';

describe('Lua table conversion', () => {
  it('TableValueだけのテーブルをJavaScript配列に変換する', () => {
    const result = parseLuaTable('mission = { "alpha", -2, true, nil }');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(['alpha', -2, true, null]);
  });

  it('[1]から始まる連続した数値キーのテーブルを配列に変換する', () => {
    const result = parseLuaTable('mission = { [2] = "second", [1] = "first" }');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(['first', 'second']);
  });

  it('数値キーと文字列キーが混在するテーブルをオブジェクトとして保持する', () => {
    const result = parseLuaTable('mission = { [1] = "first", label = "mixed" }');

    expect(Array.isArray(result)).toBe(false);
    expect(result).toEqual({ '1': 'first', label: 'mixed' });
  });

  it('ネストしたroute.pointsの数値キーテーブルを配列に変換する', () => {
    const result = parseLuaTable(`mission = {
      route = {
        points = {
          [1] = { x = 10, y = -20 },
          [2] = { x = 30, y = 40 },
        },
      },
    }`) as { route: { points: unknown } };

    expect(Array.isArray(result.route.points)).toBe(true);
    expect(result.route.points).toEqual([
      { x: 10, y: -20 },
      { x: 30, y: 40 },
    ]);
  });

  it('実DCS形式の複数無線機バンクと並列プリセット情報を保持する', () => {
    const result = parseLuaTable(`mission = {
      Radio = {
        [1] = {
          channels = { [1] = 127.5, [3] = 305 },
          modulations = { [1] = 0, [3] = 1 },
          channelsNames = { [1] = "VHF", [3] = "UHF" },
        },
        [2] = {
          channels = { [1] = 225, [2] = 240 },
          modulations = { [1] = 0, [2] = 1 },
          channelsNames = {},
        },
      },
    }`) as { Radio: unknown };

    expect(result.Radio).toEqual([
      {
        channels: { '1': 127.5, '3': 305 },
        modulations: { '1': 0, '3': 1 },
        channelsNames: { '1': 'VHF', '3': 'UHF' },
      },
      {
        channels: [225, 240],
        modulations: [0, 1],
        channelsNames: [],
      },
    ]);
  });

  it('mission以外の変数名とlocal宣言でもテーブルを解析する', () => {
    for (const variableName of ['mission', 'warehouses', 'options']) {
      expect(parseLuaTable(`${variableName} = { enabled = true }`)).toEqual({ enabled: true });
    }
    expect(parseLuaTable('local warehouses = { enabled = false }')).toEqual({ enabled: false });
  });

  it('convertLuaNodeが単項マイナスと基本リテラルを変換する', () => {
    expect(convertLuaNode({
      type: 'UnaryExpression',
      operator: '-',
      argument: { type: 'NumericLiteral', value: 12 },
    })).toBe(-12);
    expect(convertLuaNode({ type: 'BooleanLiteral', value: false })).toBe(false);
    expect(convertLuaNode({ type: 'NilLiteral', value: null })).toBeNull();
    expect(convertLuaNode({ type: 'StringLiteral', value: 'text' })).toBe('text');
  });

  it('明示数値キーと暗黙フィールドは独立した連番をソース順に代入する', () => {
    expect(parseLuaTable('mission = { [1] = "first", "second" }')).toEqual({ '1': 'second' });
  });

  it('実DCS形式のdictionaryを引用符付きキーとエスケープ込みで解析する', () => {
    const content = String.raw`dictionary =
{
    ["DictKey_sortie_1"] = "Sortie \"Name\"",
    ["DictKey_descriptionText_2"] = "line one\nline two",
    ["DictKey_nonString_3"] = { ["ignored"] = "nested" },
} -- end of dictionary`;

    expect(parseDictionary(content)).toEqual({
      DictKey_sortie_1: 'Sortie "Name"',
      DictKey_descriptionText_2: 'line one\nline two',
    });
  });

  it('実DCS形式のmapResourceを最上位の文字列値だけ解析する', () => {
    const content = String.raw`mapResource =
{
    ["ResKey_briefing_1"] = "brief.png",
    ["ResKey_map_2"] = "map,with,comma.jpg",
    ["ResKey_nested_3"] = { ["ignored"] = "nested" },
} -- end of mapResource`;

    expect(parseMapResource(content)).toEqual({
      ResKey_briefing_1: 'brief.png',
      ResKey_map_2: 'map,with,comma.jpg',
    });
  });

  it('日本語のミッション名・説明・グループ名を保持する', () => {
    const result = parseLuaTable(`mission = {
      name = "日本語のミッション",
      descriptionText = "敵部隊を確認",
      groupName = "第一飛行隊",
    }`);

    expect(result).toEqual({
      name: '日本語のミッション',
      descriptionText: '敵部隊を確認',
      groupName: '第一飛行隊',
    });
  });

  it('キリル文字を文字列リテラルから保持する', () => {
    expect(parseLuaTable('mission = { groupName = "Группа Л" }')).toEqual({
      groupName: 'Группа Л',
    });
  });

  it('サロゲートペアを含む絵文字を分割せず保持する', () => {
    const result = parseLuaTable('mission = { groupName = "飛行隊 🚀🛩️" }') as { groupName: string };

    expect(result.groupName).toBe('飛行隊 🚀🛩️');
    const emojiOffset = result.groupName.indexOf('🚀');
    expect(result.groupName.codePointAt(emojiOffset)).toBe(0x1f680);
    expect(result.groupName.slice(emojiOffset, emojiOffset + 2)).toBe('🚀');
  });

  it('Luaエスケープと非ASCII文字を同じ文字列で復元する', () => {
    const content = String.raw`mission = {
      text = "日本語\n\"引用符\" \\ \101",
    }`;

    expect(parseLuaTable(content)).toEqual({
      text: '日本語\n"引用符" \\ e',
    });
  });
});

describe('ZIP展開ガード', () => {
  it('空データを破損ZIPとして分類する', async () => {
    await expect(unzipWithLimits(new Uint8Array())).rejects.toMatchObject({
      name: 'MissionArchiveError',
      code: 'invalid-zip',
    });
  });

  it('展開後サイズが上限を超えるZIPを展開前に拒否する', async () => {
    const oversizedEntry = new Uint8Array(ZIP_LIMITS.MAX_ENTRY_SIZE + 1);
    const archive = zipSync({ oversized: [oversizedEntry, { level: 0 }] });

    await expect(unzipWithLimits(archive)).rejects.toMatchObject({
      code: 'safety-limit',
      message: expect.stringContaining('展開後サイズ'),
    });
  });

  it('展開後サイズと圧縮サイズの比率が高すぎるZIPを拒否する', async () => {
    const repetitiveEntry = new Uint8Array(1024 * 1024);
    const archive = zipSync({ repetitive: [repetitiveEntry, { level: 9 }] });

    await expect(unzipWithLimits(archive)).rejects.toMatchObject({
      code: 'safety-limit',
      message: expect.stringContaining('比率'),
    });
  });

  it('小さいmiz相当のZIPは展開できる', async () => {
    const archive = zipSync({
      mission: strToU8('mission = { route = { points = { [1] = { x = 1 } } } }'),
      theatre: strToU8('Caucasus'),
      warehouses: strToU8('warehouses = { airports = {} }'),
      options: strToU8('options = { difficulty = "custom" }'),
    });

    await expect(unzipWithLimits(archive)).resolves.toMatchObject({
      mission: expect.any(Uint8Array),
      theatre: expect.any(Uint8Array),
    });
  });

  it('l10n/DEFAULT配下の許可拡張子画像を展開し、他のリソースは除外する', async () => {
    const archive = zipSync({
      'l10n/DEFAULT/brief.PNG': strToU8('png'),
      'l10n/DEFAULT/map.jpg': strToU8('jpg'),
      'l10n/DEFAULT/script.lua': strToU8('lua'),
      'other/brief.png': strToU8('png'),
    });

    const extracted = await unzipWithLimits(archive, shouldExtractEntry);
    expect(extracted['l10n/DEFAULT/brief.PNG']).toEqual(strToU8('png'));
    expect(extracted['l10n/DEFAULT/map.jpg']).toEqual(strToU8('jpg'));
    expect(extracted['l10n/DEFAULT/script.lua']).toBeUndefined();
    expect(extracted['other/brief.png']).toBeUndefined();
  });

  it('解析結果に展開済みのブリーフィング画像Uint8Arrayを保持する', async () => {
    const archive = zipSync({
      mission: strToU8('mission = {}'),
      'l10n/DEFAULT/dictionary': strToU8(`dictionary = {
        ["DictKey_sortie_1"] = "Sortie Name",
      }`),
      'l10n/DEFAULT/mapResource': strToU8(`mapResource = {
        ["ResKey_briefing_1"] = "brief.png",
      }`),
      'l10n/DEFAULT/brief.png': strToU8('png-bytes'),
      'l10n/DEFAULT/brief.txt': strToU8('not-an-image'),
    });

    const result = await parseMissionArchive(archive);
    expect(result.dictionary).toEqual({ DictKey_sortie_1: 'Sortie Name' });
    expect(result.mapResource).toEqual({ ResKey_briefing_1: 'brief.png' });
    expect(result.briefingImages.get('l10n/DEFAULT/brief.png')).toEqual(strToU8('png-bytes'));
    expect(result.briefingImages.has('l10n/DEFAULT/brief.txt')).toBe(false);
  });

  it('ZIP内のUTF-8文字列を復号し、UTF-8 BOMを除去してから解析する', async () => {
    const archive = zipSync({
      mission: strToU8('\uFEFFmission = { name = "日本語 🚀" }'),
      theatre: strToU8('\uFEFFCaucasus'),
      'l10n/DEFAULT/dictionary': strToU8('\uFEFFdictionary = { ["DictKey_sortie_1"] = "Лётная группа" }'),
    });

    const result = await parseMissionArchive(archive);

    expect(result.mission).toEqual({ name: '日本語 🚀' });
    expect(result.theatre).toBe('Caucasus');
    expect(result.dictionary).toEqual({ DictKey_sortie_1: 'Лётная группа' });
  });

  it('画像は専用の1ファイル上限を超えると拒否する', async () => {
    const oversizedImage = new Uint8Array(ZIP_LIMITS.MAX_IMAGE_SIZE + 1);
    const archive = zipSync({ 'l10n/DEFAULT/brief.png': [oversizedImage, { level: 0 }] });

    await expect(unzipWithLimits(archive, shouldExtractEntry)).rejects.toMatchObject({
      code: 'safety-limit',
      message: expect.stringContaining('展開後サイズ'),
    });
  });

  it('missionエントリがないZIPをinvalid-missionとして拒否する', async () => {
    const archive = zipSync({ theatre: strToU8('Caucasus') });

    await expect(parseMissionArchive(archive)).rejects.toMatchObject({
      name: 'MissionArchiveError',
      code: 'invalid-mission',
      message: expect.stringContaining('missionエントリ'),
    });
  });

  it('壊れたmission Luaをinvalid-missionとして拒否する', async () => {
    const archive = zipSync({ mission: strToU8('mission = { broken = ') });

    await expect(parseMissionArchive(archive)).rejects.toMatchObject({
      name: 'MissionArchiveError',
      code: 'invalid-mission',
      message: expect.stringContaining('解析できませんでした'),
    });
  });

  it('最上位がLuaテーブルではないmissionをinvalid-missionとして拒否する', async () => {
    const archive = zipSync({ mission: strToU8('mission = 42') });

    await expect(parseMissionArchive(archive)).rejects.toMatchObject({
      name: 'MissionArchiveError',
      code: 'invalid-mission',
      message: expect.stringContaining('最上位のLuaテーブル'),
    });
  });
});
