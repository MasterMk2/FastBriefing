# [P1] Luaパーサ: TableValue の配列扱いが壊れている / mission 以外の変数名を解析できない

**Labels:** `bug`, `P1-major`, `parser`
**Milestone:** Phase 0 fix

## 概要
`src/workers/missionParser.ts:34-85` `convertLuaNode` に2つの致命的なバグがある:
1. `TableValue`（配列要素）を `result[Object.keys(result).length + 1]` で詰めているため、Lua の配列が JS 配列ではなく `{1: ..., 2: ...}` のオブジェクトになる。`getArray` は `Array.isArray` で判定するため、常に `[]` を返し、経路点やユニットが消えるケースがある
2. `parseLuaTable` が `mission = { ... }` しか探さず、`warehouses` / `options` のような別変数名の Lua ファイルを同じ関数で使い回しているが、対象が `mission` 固定のため常に `Mission table not found` になる可能性がある（現在は `warehouses` が偶然同じ構造で動いているが、将来の DCS バージョンで落ちる）

## 該当箇所
```ts
// src/workers/missionParser.ts:34-65
case 'TableConstructorExpression':
  const result: Record<string, unknown> = {};
  // ...
  } else if (f.type === 'TableValue' && f.value) {
    const value = convertLuaNode(f.value);
    if (Array.isArray(result)) { // resultは {} なので常に false
      result.push(value);
    } else {
      const idx = Object.keys(result).length + 1;
      result[idx] = value; // 連番キーで詰めるが配列ではない
    }
  }
// ...
// src/workers/missionParser.ts:14-32
function parseLuaTable(luaCode: string): unknown {
  if (varExpr.name === 'mission') { // ← warehouses では 'warehouses'
    return convertLuaNode(firstStat.init);
  }
  throw new Error('Mission table not found');
}
```

`luaparse` の AST では `TableValue` は配列要素、`TableKeyString` は `key: Identifier` を持つ。現行の `TableKeyString` 処理で `key.name ?? key.value` としているが、`luaparse` 0.3.1 では `key` が `Identifier` 型で `name` を持つため `value` フォールバックは不要だが害はない。問題は配列/オブジェクトの混在を `Record<string, unknown>` 一本で扱っている点。

## 影響
- 手元の小さい fixture では偶然動くが、`route.points` や `units` が大きいミッション（例: 60機 COOP）で `getArray(route, ['points'])` が空を返し、フライトの経路が消える
- `parseDictionary` / `parseMapResource` は正規表現で自前パースしており、こちらは影響しないが、`mission` / `warehouses` / `options` の3つは全て `parseLuaTable` を通るため、`warehouses` 解析失敗で `airbases` / `airports` 解決が落ちる

## 修正案
1. `convertLuaNode` を配列とオブジェクトを区別する実装に置換:
   ```ts
   function convertLuaNode(node): unknown {
     if (n.type === 'TableConstructorExpression') {
       const isArray = n.fields.every(f => f.type === 'TableValue');
       if (isArray) {
         return n.fields.map(f => convertLuaNode((f as any).value));
       }
       const obj: Record<string, unknown> = {};
       for (const f of n.fields) {
         if (f.type === 'TableKeyString') obj[f.key.name] = convertLuaNode(f.value);
         else if (f.type === 'TableKey') { /* ... */ }
         else if (f.type === 'TableValue') { /* 警告を warnings に積む */ }
       }
       return obj;
     }
   }
   ```
   または `lua-json` / `Ked57/dcs-mission-parser` の既存実装を参考に、数値キーの連続性を判定して配列化する

2. `parseLuaTable` を変数名非依存に:
   ```ts
   function parseLuaTable(luaCode: string, expectedVar?: string): unknown {
     const firstStat = ast.body[0];
     if (firstStat.type === 'AssignmentStatement') return convertLuaNode(firstStat.init[0]);
     throw new Error('Table not found');
   }
   ```

3. パーサの単体テスト: `docs/research-notes.md:17` の実測 `mission` 断片を文字列で用意し、AST 変換後の `route.points` が配列であることをアサート

## 検証
- 最大 600KB の実 `mission` 文字列で `convertLuaNode` の処理時間とメモリを計測（NFR-04 2秒目標）
- `TableValue` のみからなる配列テーブルと、混在テーブルの両方でテスト

## 参考
- pydcs の `dcs/lua/parse.py` は再帰下降パーサで配列/辞書を正しく分離している
- `luaparse` の `TableKey` / `TableKeyString` / `TableValue` の定義: https://github.com/fstirlitz/luaparse/wiki/AST
