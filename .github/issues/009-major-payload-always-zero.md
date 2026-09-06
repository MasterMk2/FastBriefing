# [P1] Payload の燃料/チャフ/フレア/重量が常に 0 - 兵装名も CLSID のまま

**Labels:** `bug`, `P1-major`, `normalizer`
**Milestone:** Phase 1

## 概要
`src/core/MissionNormalizer.ts:356-383` `normalizePayload` が `pylons[].CLSID` しか見ず、`fuel` / `chaff` / `flare` / `gun` / `weight` を全て 0 で固定している。さらに `CLSID` をそのまま `name` にコピーしているため、画面では `"{CLSID_AIM120C}"` のような内部IDが表示される。

## 該当箇所
```ts
// src/core/MissionNormalizer.ts:356-383
function normalizePayload(pylons): Payload {
  let totalWeight = 0; // ← 使われない
  for (const pylon of pylons) {
    // ...
    pylonList.push({ station: String(n), clsid, name: clsid, count: 1, weight: 0 });
  }
  return { pylons: pylonList, fuel: 0, chaff: 0, flare: 0, gun: 0, weight: totalWeight };
}
```
呼び出し元 `normalizeUnits:342` では `payload` 直下の `fuel` / `chaff` 等を全く渡していない:
```ts
const payload = getValue(unit, ['payload']) as Record<string, unknown> || {};
const pylons = getArray(payload, ['pylons']);
// fuel 等は読んでいない
return { payload: normalizePayload(pylons) };
```

実際の `mission` 内 `payload` 構造（`docs/research-notes.md:28`）:
- `payload.pylons[n].CLSID`
- `payload.fuel` (kg), `payload.chaff`, `payload.flare`, `payload.gun`, 総重量は `unit` の `mass` または `payload` 合算

## 要件
- **FR-33 MUST**: 搭載を兵装名に変換、燃料量、チャフ/フレア/機関砲、総重量の目安を表示

## 修正案
1. `normalizePayload` の引数を `payload` 全体に変更し、`fuel` 等を読み取る
2. `src/data/weapons.json`（pydcs `dcs/weapons_data.py` 由来）を用意し、`CLSID -> {name, weight}` マッピングで `name` / `weight` / `count` を解決。見つからない CLSID は `warnings` に積む（FR-06）
3. `FlightsTab.tsx:96-107` の機体構成表は `unit.payload.fuel` を表示しているが常に 0 のため、テストで気づけなかった - fixture に実値を入れてテスト

## 検証
- F-15E / F/A-18C の実 `.miz` fixture で、AIM-120C / GBU-38 等の CLSID が「AIM-120C AMRAAM」等の可読名に変換されることをスナップショットテスト

## 参考
- `docs/requirements.md:7.3` 兵装名は `pydcs/dcs/weapons_data.py` から JSON 化する想定だったが未実装
