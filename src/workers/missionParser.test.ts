import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  convertLuaNode,
  parseLuaTable,
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
});

describe('ZIP展開ガード', () => {
  it('展開後サイズが上限を超えるZIPを展開前に拒否する', async () => {
    const oversizedEntry = new Uint8Array(ZIP_LIMITS.MAX_ENTRY_SIZE + 1);
    const archive = zipSync({ oversized: [oversizedEntry, { level: 0 }] });

    await expect(unzipWithLimits(archive)).rejects.toThrow('展開後サイズ');
  });

  it('展開後サイズと圧縮サイズの比率が高すぎるZIPを拒否する', async () => {
    const repetitiveEntry = new Uint8Array(1024 * 1024);
    const archive = zipSync({ repetitive: [repetitiveEntry, { level: 9 }] });

    await expect(unzipWithLimits(archive)).rejects.toThrow('比率');
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
});
