# [P1] 未実装: 磁方位 (FR-16) / 日の出・薄明・月齢 (FR-18) の計算

**Labels:** `enhancement`, `P1-major`, `coordinates`
**Milestone:** Phase 1

## 概要
`docs/requirements.md:FR-16, FR-18` で SHOULD とされている磁気偏差と天文計算が完全に未実装。`package.json` には `suncalc` が入っているがコードから一度も呼ばれず、`geomagnetism` / `geomag` も未導入。結果としてナビログの「真方位/磁方位」併記、`leg` の `magneticBearing`、`OverviewTab` の日の出/月齢が空欄のまま。

## 該当箇所
```ts
// src/types/mission.ts:168-176 LegInfo
export interface LegInfo {
  distance: number;
  trueBearing: number;
  magneticBearing: number; // ← 定義はあるが MissionNormalizer で一度も計算されない
}
// src/core/MissionNormalizer.ts:410-437 normalizeRoutePoints
return { index, name, action, xy, latlon, alt, altType, speed, eta, tasks: [], leg: undefined }
// leg は常に undefined

// src/utils/coordinates.ts:206-228
export function calculateBearing(...) // 真方位のみ。磁方位への変換なし

// package.json:19-21
"suncalc": "^1.9.0" // 未使用
// geomagnetism / geomag は package.json にすら無い
```

## 要件
- **FR-16 SHOULD**: 磁方位を WMM モデルで計算（`geomagnetism` Apache-2.0 または `geomag` MIT）。真方位との併記
- **FR-18 SHOULD**: 日の出/入り、市民/航海薄明、月齢/照度を Bullseye または経路重心で計算

## 修正案
1. `npm install geomagnetism`（または `geomag`）を追加し、`src/utils/magvar.ts` を新設:
   ```ts
   import { declination } from 'geomagnetism';
   export function getMagneticDeclination(lat, lon, date): number {
     // WMM2020/2025 を日付で選択
   }
   export function trueToMagnetic(trueBrg, declination) { return (trueBrg - declination + 360) % 360; }
   ```
   `normalizeRoutePoints` で `leg.magneticBearing = trueToMagnetic(trueBearing, declination)` を計算

2. `suncalc` を `OverviewTab` で呼び出し:
   ```ts
   import SunCalc from 'suncalc';
   const times = SunCalc.getTimes(zuluDate, lat, lon);
   const moon = SunCalc.getMoonIllumination(zuluDate);
   ```

3. `warnings` に「磁気偏差データが古い」「極域で計算不能」等の注記を積む

## 影響
- `FlightsTab:184` の `leg` 列が常に `-` 表示。パイロットが磁方位を手計算する必要がある
- GCI/JTAC が夜間作戦の薄明/月照度を把握できない（S3 ニーボード用途で不利）

## 検証
- `docs/research-notes.md:14` の Batumi E6.0 / Anapa E6.5 等の実測表と比較するテスト
- `suncalc` の既知日（2025-05-01 Caucasus）で日の出が 04:xxZ 付近になることをスナップショットテスト

## 参考
- https://github.com/naturalatlas/geomagnetism
- `docs/research-notes.md:5` のライブラリ選定理由を再確認
