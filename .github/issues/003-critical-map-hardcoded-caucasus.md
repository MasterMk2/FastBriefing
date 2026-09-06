# [P0] MapTab: TriggerZone / Drawing / Support / Threat の座標変換で theatre が 'Caucasus' にハードコードされている

**Labels:** `bug`, `P0-critical`, `map`
**Milestone:** Phase 1

## 概要
`src/components/MapTab.tsx` で `mission.meta.theatre` を使うべき箇所が `'Caucasus'` に固定されている。Marianas ミッション（手元 14/19 本）で地図上のゾーン・描画・支援機・脅威リングが全て Caucasus 基準で描画され、存在しない位置に表示される。

## 該当箇所
- `src/components/MapTab.tsx:213-240` `TriggerZone`
  ```ts
  function TriggerZone({ zone }) {
    const center = dcsToLatLon('Caucasus', zone.xy[0], zone.xy[1]) // ← theatre固定
    // ...
    const positions = zone.vertices.map(v => dcsToLatLon('Caucasus', v[0], v[1]))
  }
  ```
- `src/components/MapTab.tsx:242-267` `DrawingLayer`
  ```ts
  const positions = obj.points.map(p => dcsToLatLon('Caucasus', p[0], p[1]))
  ```
- `src/components/MapTab.tsx:269-277` `SupportMarker`
  ```ts
  const position = dcsToLatLon('Caucasus', support.position[0], support.position[1])
  ```
- `src/components/MapTab.tsx:159` `Circle` (threats) は正しく `mission.meta.theatre` を使っているが、上記3つは使っていない → 不整合
- `src/components/MapTab.tsx:181` `Marker` (enemies) も `mission.meta.theatre` を正しく使っている

## 修正案
```tsx
function TriggerZone({ zone, theatre }: { zone: TriggerZone; theatre: string }) {
  const center = dcsToLatLon(theatre, zone.xy[0], zone.xy[1]) || [0,0];
}
```
`MapTab` 本体で `const theatre = mission.meta.theatre` を束ね、全子コンポーネントに theatre を prop で渡す。`dcsToLatLon` が `null` を返したときのフォールバック（FR-11: 未対応マップは DCS 座標のまま警告）を統一して実装する。

## 影響
- **FR-60, FR-61, FR-62** の地図要件を Marianas で満たせない
- 手元最大の利用シーン（Marianas COOP）で地図が使えないため、ブリーフィングの主機能が欠損

## 検証
- Marianas と Caucasus の実 `.miz` 各1本で、MapTab のゾーン・描画・支援機の緯度経度を `dcsToLatLon(theatre, x, y)` の直接呼び出しと比較する `vitest` + `react-testing-library` テストを追加
- `src/utils/coordinates.ts` の unknown theatre 警告（`warnings` 配列）への統合も合わせて行う

## 参考
- `docs/requirements.md:5.7 FR-60` では「選択したフライトの経路」とあるが、現行は theatre を見ていない
- `src/core/MissionNormalizer.ts:191` では bullseye は正しく theatre を使っているため、同一ファイル内での不統一
