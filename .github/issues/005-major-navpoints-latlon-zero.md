# [P1] MissionNormalizer: navPoints の latlon が [0,0] のまま出力される

**Labels:** `bug`, `P1-major`, `normalizer`
**Milestone:** Phase 1

## 概要
`src/core/MissionNormalizer.ts:202-215` `normalizeNavPoints` が `xy` を `latlon` に変換せず `[0,0]` を固定で返している。MapTab で `navPoints` を描画しても全てギニア湾（0,0）に集まり、FR-45「勢力の nav_points を一覧と地図に出す」を満たせない。

## 該当箇所
```ts
// src/core/MissionNormalizer.ts:202-215
function normalizeNavPoints(sideData): NavPoint[] {
  return navPoints.map((np, i) => {
    const x = getNumber(point, ['x']);
    const y = getNumber(point, ['y']);
    return {
      index: i + 1,
      name: getString(point, ['name']),
      xy: [x, y],
      latlon: [0, 0], // ← 変換していない
    };
  });
}
```
同様のパターンは `normalizeRoutePoints` では正しく `dcsToLatLon(theatre, x, y)` が呼ばれているため、単なる実装漏れ。

## 修正案
```ts
function normalizeNavPoints(sideData, theatre: string): NavPoint[] {
  // ...
  const latlon = dcsToLatLon(theatre, x, y) || [0,0];
  // warnings に theatre 未対応時の警告を積む
}
```
呼び出し元 `normalizeCoalition:192` も `theatre` を渡すように修正。`warnings` 配列への通知（FR-11: 未対応マップ警告）も合わせて実装する。

## 影響
- **FR-45, FR-60** - 地図で navPoints が正位置に出ない
- `src/components/MapTab.tsx:92-104` は `np.latlon` をそのまま `Marker` に渡すため、地図上で全点が重なる

## 検証
- `MissionNormalizer.test.ts` で Caucasus / Marianas の nav_points を持つ fixture を用意し、`latlon` が `[0,0]` でないことをアサート

## 参考
- `src/core/MissionNormalizer.ts:439` 以降の `normalizeSupport` / `normalizeAIGroups` も同様に `dcsToLatLon` を使っていない箇所があり、横展開で修正が必要（Issue #008 参照）
