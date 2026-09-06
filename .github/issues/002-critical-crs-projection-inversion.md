# [P0] 座標変換: dcsToLatLon / latLonToDCS の forward/inverse と軸順序が逆

**Labels:** `bug`, `P0-critical`, `coordinates`, `map`
**Milestone:** Phase 0 fix

## 概要
`src/utils/coordinates.ts:98-112` の `dcsToLatLon` / `latLonToDCS` が `proj4` の `forward` / `inverse` を逆に使っており、さらに渡す配列の順序 `[y, x]` / `[lon, lat]` が要件の「x=北, y=東」と食い違っている。結果として G2（ME表示との一致）が系統的にずれる。

## 該当箇所
- `src/utils/coordinates.ts:79-96` - `getConverter` は `proj4(projStr, 'EPSG:4326')` で Converter を作っている
- `src/utils/coordinates.ts:98-112`
  ```ts
  export function dcsToLatLon(theatre, x, y) {
    const result = converter.forward([y, x]); // forwardは proj -> WGS84 だが axis=neu との整合が要検証
    return [result[1], result[0]];
  }
  export function latLonToDCS(theatre, lat, lon) {
    const result = converter.inverse([lon, lat]);
    return [result[1], result[0]];
  }
  ```

`proj4` の API は `proj4(from, to, coord)` で、`Converter.forward(coord)` は `from -> to`、`inverse` は `to -> from`。現行コードは `projStr -> EPSG:4326` を forward としているが、`+axis=neu` のとき proj4 が内部で軸を入れ替えるため、単純な `[y,x]` スワップでは説明できないケースがある。

## 要検証項目
- `docs/research-notes.md:4` では `+axis=neu` 付きの proj 文字列で `pyproj` 検証しているが、JS の `proj4` が同じ `axis` を正しく解釈するか未検証（`proj4` 2.11 は `axis` をサポートするが挙動差がある）
- 付録 A の検証値 `Caucasus (0,0) -> N45°07.77' E34°15.93'` と実際に `dcsToLatLon('Caucasus',0,0)` が一致するか `vitest` で固定値テストすべき
- `DCS World/Data/MagVar` 由来の磁気偏差と同様、投影パラメータの `false_easting/northing` が m 単位で正しく `proj4` に渡っているかの単体テストが必要

## 修正案
1. `proj4` の使い方を `proj4(projStr, 'WGS84', [x,y])` の関数呼び出し形式に統一するか、Converter の forward/inverse の意味をコメントで明記する
2. `src/utils/coordinates.test.ts` を新設し、Caucasus/MarianaIslands の既知点（`docs/research-notes.md:57-60` の3点）でスナップショットテスト
3. `latLonToDCS` の逆変換テスト（round-trip 誤差 < 1m）を追加

## 影響
- **FR-10, FR-11, G2 をブロック**。MapTab / FlightsTab / ThreatsTab の全座標表示が誤差を持つ
- `MapTab.tsx:214,248,270` の hardcoded `Caucasus` と組み合わさると、Marianas ミッションでさらに2重にずれる

## 参考
- `src/utils/coordinates.ts:1-77` PROJECTIONS 定数（pydcs 由来）は正しいが、使い方だけが誤っている可能性
- https://github.com/proj4js/proj4js#using
