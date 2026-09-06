# [P1] 天候: QNH 換算の二重適用 / 雲プリセット表示名未解決 / METAR未実装

**Labels:** `bug`, `P1-major`, `normalizer`, `ui`
**Milestone:** Phase 1

## 概要
天候正規化と表示で3つの不整合がある:
1. `MissionNormalizer.ts:108-112` で `qnh.mmHg` を `hPa/inHg` に換算して `Weather.qnh` に格納しているが、`OverviewTab.tsx:64` と `utils/coordinates.ts:183-192` `formatPressure` で再び `mmHg * 1.33322` 換算しており、二重換算で値がずれる
2. `normalizeClouds:147-156` が `preset` をそのまま `label` にコピーしており、pydcs 由来の表示名（例: `Preset1 -> "Few Clouds"`）に解決していない
3. FR-22 SHOULD の METAR 1行要約が未実装

## 該当箇所
```ts
// src/core/MissionNormalizer.ts:104-112
qnh: { mmHg: qnhMmHg, hPa: qnhMmHg * 1.33322, inHg: qnhMmHg * 0.0393701 }
// → Weather.qnh は既に換算済みの値を持つ

// src/components/OverviewTab.tsx:64
<dd>{formatPressure(weather.qnh.mmHg, settings.pressureUnit)}</dd>
// formatPressure は mmHg -> hPa/inHg に再換算するので、hPa選択時は正しいが、内部に hPa を持つ意味がない
// 将来 weather.qnh.hPa を直接表示しようとすると二重換算の罠になる

// src/core/MissionNormalizer.ts:147-156
function normalizeClouds(weather) {
  const preset = getString(clouds, ['preset']); // "Preset1"
  return { preset, label: preset, base }; // label も "Preset1" のまま
}
```

## 要件
- **FR-21 MUST**: 気温、QNH、風、雲プリセットの表示名と雲底、視程、霧、砂塵、乱気流
- **FR-22 SHOULD**: METAR 風 1行要約（`27004KT 9999 SCT082 08/M02 Q1018`）。雲量対応は近似と明記

## 修正案
1. `Weather.qnh` は `mmHg` のみ保持し、表示時に `formatPressure(mmHg, unit)` で都度換算する（現行の二重保持を廃止）か、型を `qnhMmHg: number` に単純化。後方互換のため `qnh: { mmHg, hPa, inHg }` を残すなら、Normalizer では `mmHg` のみ格納し、getter で換算する
2. `src/data/cloudPresets.json`（pydcs `dcs/cloud_presets.py` 由来）を用意し、`preset -> { label, baseMin, baseMax }` に解決。未対応の `RainyPreset4-6` は `warnings` に積む
3. METAR 要約は `src/utils/metar.ts` を新設し、風（FROM->KT）、視程、雲量（preset->SCT/BKN 近似）、気温/露点（露点は `weather` に無いため `-` または未表示）、QNH（hPa）を1行に整形

## 検証
- `qnh = 763.778 mmHg` で `formatPressure(763.778, 'hPa') === "1018.3 hPa"` になる単体テスト（`docs/research-notes.md:付録A` の実測値）
- `Preset1` / `RainyPreset1` 等のラベル解決テスト
- METAR 行のスナップショットテスト

## 影響
- QNH 表示が hPa/inHg 切替で誤差を持つ可能性（現行は mmHg 経由で再換算しているため偶然正しいが、将来のコードが `weather.qnh.hPa` を直接使うと二重換算バグが顕在化）
- 雲が `Preset1` のまま表示され、パイロットが天候を直感できない
