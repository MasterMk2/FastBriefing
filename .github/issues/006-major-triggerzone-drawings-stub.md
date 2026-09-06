# [P1] normalizeZones が空配列スタブ - トリガーゾーンが地図に出ない / FR-61 drawings の style 未対応

**Labels:** `bug`, `P1-major`, `normalizer`, `map`
**Milestone:** Phase 1

## 概要
`src/core/MissionNormalizer.ts:590-619` で `normalizeZones` は `return []` のスタブのまま。手元 19 本は全て `triggers.zones` を持ち、うち2本は多角形（`verticies`）を持つが、MapTab のゾーン切替は常に空表示になる。また `normalizeDrawings` は `colorString` / `fillColorString` の `0xRRGGBBAA` 形式を `#ff0000` と誤読するケースがある。

## 該当箇所
```ts
// src/core/MissionNormalizer.ts:590-592
function normalizeZones(_sideData, _theatre): TriggerZone[] {
  return [];
}
```
`_sideData` / `_theatre` が未使用（`noUnusedParameters` に引っかかるはずだが `tsc` が通っているのは `_` prefix で抑制されているため）。実際には `mission.trig.zones` または `coalition.*.triggers` 配下にゾーンが格納される（`docs/research-notes.md:31`）。

正しい参照先:
- `mission.triggers.zones` または `mission.trig.zones`（DCS バージョンで揺れる）
- 各ゾーン: `zoneId, name, x, y, radius, type(0円/2多角形), verticies{n:{x,y}}, color, hidden`

`normalizeDrawings:594-619` も `getValue(sideData, ['drawings'])` を見ているが、実データは `mission.drawings` 直下にあるため side ごとに空になるケースがある。

## 修正案
1. `normalizeZones` を `mission` 直下から取る形に修正し、`theatre` を使って `xy` / `verticies` を `latlon` に変換する（MapTab での二度変換を避けるため、正規化段階で `latlon` を持たせる案もある）
2. `docs/requirements.md:7.1` のデータモデルに `zones` の `latlon` / `verticesLatLon` を追加するか、MapTab で theatre を正しく渡す（Issue #003 と統合）
3. `normalizeDrawings` の `colorString` パース:
   ```ts
   function parseColorString(s: string): string {
     if (s.startsWith('0x')) { // DCS形式 0xRRGGBBAA
       const hex = s.slice(2).padStart(8,'0');
       return `#${hex.slice(0,6)}`;
     }
     return s || '#ff0000';
   }
   ```
4. `style` / `thickness` の enum 対応（点線/破線）を Leaflet の `dashArray` にマッピング

## 影響
- **FR-61, FR-62, FR-60** - レイヤー切替が形骸化。ME で描いた戦術図がブリーフィングに出ない
- `warnings` に「未知の zone type」警告を積む処理（FR-06）も未実装

## 検証
- 手元 19 本の `mission` から `triggers.zones` を抽出し、円/多角形それぞれの正規化結果をスナップショットテスト
- MapTab で zones レイヤーのトグルが実際に Circle/Polyline を増減させることを `react-testing-library` で確認
