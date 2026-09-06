import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { decodeLuaString, parseMissionArchive } from './missionParser';

/**
 * A .miz whose Lua contains Japanese used to fail outright:
 *
 *   [1189:8] code unit U+30A8 is not allowed in the current encoding mode
 *
 * luaparse was being run in `pseudo-latin1`, which requires every code unit to
 * be <= 0xFF, on a string that had already been decoded from UTF-8 -- so the
 * first Japanese character in the mission killed the upload. English missions
 * were unaffected, which is why it shipped.
 */
function miz(entries: Record<string, string>): ArrayBuffer {
  const zipped = zipSync(
    Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)])),
  );
  return zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength,
  ) as ArrayBuffer;
}

const MISSION_LUA = `mission = {
  descriptionText = "エルブルス山の東で敵編隊を迎撃せよ",
  sortie = "ASCII only",
  start_time = 28800,
  ["開始地点"] = "クラスノダール",
  coalition = { blue = { country = { [1] = { name = "日本", id = 3 } } } },
}`;

describe('parseMissionArchive', () => {
  it('reads a mission whose Lua contains Japanese', async () => {
    const result = await parseMissionArchive(miz({ mission: MISSION_LUA }));
    const mission = result.mission as Record<string, unknown>;

    expect(mission.descriptionText).toBe('エルブルス山の東で敵編隊を迎撃せよ');
    // A Japanese TABLE KEY, not just a value.
    expect(mission['開始地点']).toBe('クラスノダール');

    const country = (
      ((mission.coalition as Record<string, Record<string, Record<string, unknown>>>)
        .blue.country) as Record<string, Record<string, unknown>>
    )['1'];
    expect(country.name).toBe('日本');
    // Numbers must survive the byte-level round trip as numbers.
    expect(country.id).toBe(3);
    expect(mission.start_time).toBe(28800);
    expect(mission.sortie).toBe('ASCII only');
  });

  it('keeps the non-Lua entries on ordinary UTF-8', async () => {
    // parseDictionary/parseMapResource are regex-based and never see luaparse,
    // so they must NOT get the byte-per-code-unit treatment -- and they hold
    // most of a localised mission's prose.
    const result = await parseMissionArchive(
      miz({
        mission: 'mission = { a = 1 }',
        theatre: 'Caucasus\n',
        'l10n/DEFAULT/dictionary': '[1] = "ブリーフィング本文"',
        'l10n/DEFAULT/mapResource': '[2] = "地図資料.png"',
      }),
    );

    expect(result.theatre).toBe('Caucasus');
    expect(result.dictionary.DictKey_1).toBe('ブリーフィング本文');
    expect(result.mapResource.ResKey_2).toBe('地図資料.png');
  });

  it('leaves binary attachments untouched', async () => {
    const result = await parseMissionArchive(
      miz({ mission: 'mission = { a = 1 }', 'KNEEBOARD/IMAGES/x.png': 'not really a png' }),
    );
    expect(result.kneeboardFiles.get('KNEEBOARD/IMAGES/x.png')).toBeInstanceOf(Uint8Array);
  });
});

describe('decodeLuaString', () => {
  it('passes ASCII through unchanged', () => {
    expect(decodeLuaString('Caucasus 07L')).toBe('Caucasus 07L');
  });

  it('decodes bytes that luaparse hands back one per code unit', () => {
    // What pseudo-latin1 produces for UTF-8 "日本": 6 bytes, 6 code units.
    const bytes = 'æ¥æ¬';
    expect(bytes.length).toBe(6);
    expect(decodeLuaString(bytes)).toBe('日本');
  });
});
