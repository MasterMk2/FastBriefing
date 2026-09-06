# [P1] 座標表示: MGRS がスタブ実装 / 全タブで DDM/DMS/MGRS 切替が反映されない

**Labels:** `enhancement`, `P1-major`, `coordinates`, `i18n`

## 概要
`src/utils/coordinates.ts:158-160` の `formatMGRS` が `MGRS: ${lat.toFixed(4)}, ${lon.toFixed(4)}` を返すだけのスタブ。さらに `FlightsTab.tsx:179` や `ExportTab.tsx:45` では `settings.coordinateFormat` を見ずに `latlon[0].toFixed(4)` で固定表示しているため、ユーザーが DDM/DMS/MGRS を切り替えても反映されない。

## 該当箇所
```ts
// src/utils/coordinates.ts:114-127,158-160
export function formatCoordinate(lat, lon, format) {
  switch(format) {
    case 'MGRS': return formatMGRS(lat, lon); // ← スタブ
  }
}
function formatMGRS(lat, lon) {
  return `MGRS: ${lat.toFixed(4)}, ${lon.toFixed(4)}`; // これはMGRSではない
}
```
```tsx
// src/components/FlightsTab.tsx:179
<td>{wp.latlon[0].toFixed(4)}, {wp.latlon[1].toFixed(4)}</td> // settings無視
// src/components/ExportTab.tsx:45 同様
```

`settings.coordinateFormat` 自体は `src/hooks/useSettings.tsx:4-15` で定義され App で渡されているが、実際に `formatCoordinate` を呼んでいる箇所が地図のクリック以外に存在しない。

## 要件とのギャップ
- **FR-12 MUST**: DDM / DMS / MGRS 切替、機種ごとの既定形式（F/A-18C DDM, AH-64D MGRS 等）
- `docs/research-notes.md:10` の機種別形式表と、実装の乖離
- FR-12 では「MGRS 8桁」を求めているが、現行は桁数概念すらない

## 修正案
1. MGRS 変換は `proj4` + 自前実装ではなく、軽量な `mgrs` npm（MIT, 6kB）を導入するか、`geodesy` 系の既存実装を利用
   ```ts
   import * as mgrs from 'mgrs';
   function formatMGRS(lat, lon) {
     return mgrs.forward([lon, lat], 5); // 5 = 1m精度
   }
   ```
   依存追加時は `NFR-06` 参照データ分離の思想に従い、変換は `utils/coordinates.ts` に集約

2. `FlightsTab` / `ExportTab` / `ThreatsTab` / `SupportTab` の座標表示を全て `formatCoordinate(lat, lon, settings.coordinateFormat)` に置換
   - `ThreatsTab.tsx:37` の `position[0].toFixed(2)` も同様

3. `useSettings` に機種ごとの既定形式マップを追加（`docs/requirements.md:FR-12` 表を `src/i18n` ではなく `src/data/aircraftCoordinateDefaults.json` として分離）

## 検証
- 既知点（Caucasus 0,0 -> 38T?）で MGRS 変換のスナップショットテスト
- `FlightsTab` のナビログ表でフォーマット切替が即時反映される E2E テスト

## 影響
- パイロットが機種に合った形式で座標を読めない → JTAC 連携や JDAM 入力で誤読リスク（安全関連）
