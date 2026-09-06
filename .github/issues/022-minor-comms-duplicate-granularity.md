# [P2] CommsTab: 周波数重複検出の粒度が粗い / React key 重複 / Guard 周波数のハードコード

**Labels:** `enhancement`, `P2-medium`, `comms`
**Milestone:** Phase 2

## 概要
`CommsTab.tsx` の共有周波数検出は `frequency.toFixed(3)` でグルーピングしているが、DCS の周波数は kHz 精度で重複判定すべきところ、3桁丸めで 243.000 と 243.0004 が同一とみなされる。また `SupportTab` 由来の周波数は `frequency / 1000000` で MHz に変換しているが、`Flight` の `frequency` は Hz のままか MHz かが混在しており、比較が不正確。さらに `key={s.callsign}` は callsign 重複時に React key 衝突を起こす。

## 該当箇所
```ts
// src/components/CommsTab.tsx:26-35
const supportFreqs = allSupport.flatMap(s => 
  s.frequency ? [{
    frequency: s.frequency / 1000000, // ← Support は Hz -> MHz
    // ...
  }] : []
);
const allFreqs = [...flightFreqs, ...supportFreqs].sort(...)
const freqGroups = allFreqs.reduce((acc, f) => {
  const key = f.frequency.toFixed(3); // 1kHz 単位で丸め
  acc[key].push(f);
}, {})

// src/components/CommsTab.tsx:61-65
{sharedFreqs.map(([freq, users]) => (
  <tr key={freq}> // freq は toFixed(3) の文字列表現で、243.000 と 243.0004 が衝突
))

// src/components/CommsTab.tsx:119-126
{allSupport.map(s => (
  <tr key={s.callsign}> // 同じ callsign の支援機が複数いると key 重複
))
```

`Flight` の `frequency` の単位:
- `MissionNormalizer.ts:309` `frequency: getNumber(groupData, ['frequency'])` は Hz（DCS は Hz で格納）
- `FlightsTab.tsx:148` `radio.frequency.toFixed(3)` は MHz（`normalizeRadios:391` で `/1000000` 済み）
- `CommsTab.tsx:15-22` `f.units.flatMap(u => u.radios.map(r => r.frequency))` は MHz
- `CommsTab.tsx:26` `s.frequency / 1000000` も MHz だが、`Flight.frequency`（グループ周波数）は Hz のまま表示 `flight.frequency / 1000000`（`CommsTab.tsx:83`）と混在

## 要件
- **FR-67 MUST**: コムカード自動生成（フライト/支援機/ATC/JTAC/Guard を1枚に）
- **FR-68 SHOULD**: 同一周波数の複数使用に注意表示
- **FR-91 SHOULD**: ミッションリントで周波数重複を自動検出

## 修正案
1. 周波数の単位を `Hz` に統一し、表示時のみ `formatFrequency(hz, 'MHz')` で整形。`DisplaySettings` に `frequencyUnit` は無いため、常に MHz 表示でよいが、内部比較は Hz の整数で `Math.abs(a-b) < 5000`（5kHz 以内を重複とみなす）等の閾値で判定
2. `freqGroups` のキーは `Math.round(frequency / 5000) * 5000` のように量子化するか、近接周波数をクラスタリング
3. React key は `key={`${s.callsign}-${i}`}` または `support` に `id` を付与
4. Guard 周波数（243.000 / 121.500）は `src/data/guardFrequencies.json` に分離し、将来的に UHF/VHF の追加に対応
5. ATC 周波数（FR-43 飛行場の `atc[]`）もコムカードに含める（現行はフライトと支援機のみ）

## 検証
- 243.000 と 243.005 が重複とみなされること、243.000 と 244.000 が別とみなされることを単体テスト
- 同一 callsign の支援機が2機ある fixture で React key 警告が出ないことをテスト

## 参考
- `docs/requirements.md:5.8` コムカードは FR-67 MUST で、現行は SHOULD の重複警告まで実装しているが精度が低い
