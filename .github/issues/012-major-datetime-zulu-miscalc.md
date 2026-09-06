# [P1] 日付/時刻表示: OverviewTab と ExportTab の Zulu/Local 計算が誤っている

**Labels:** `bug`, `P1-major`, `ui`
**Milestone:** Phase 1

## 概要
`src/components/OverviewTab.tsx:15-42` と `src/components/ExportTab.tsx:20-21` の Zulu 時刻計算が、それぞれ異なる誤りを持っている。`mission.start_time` は 0時からの秒、`date` は別フィールド、`utcOffset` はマップ固定オフセットだが、JS の `Date` コンストラクタがローカルタイムゾーンを挟むため、二重にオフセットがかかる。

## 該当箇所
```tsx
// src/components/OverviewTab.tsx:15-21
const startDate = new Date(
  meta.date.Year,
  meta.date.Month - 1,
  meta.date.Day,
  Math.floor(meta.startTime / 3600),
  Math.floor((meta.startTime % 3600) / 60)
);
// ローカルTZで解釈されるが、DCS の start_time はマップ現地時刻。ブラウザのTZがJSTなら+9時間が余計にかかる
// ...
<dd>{startDate.toLocaleString()}</dd> // ローカルTZで再表示 → 二重変換
<dd>{new Date(startDate.getTime() - meta.utcOffset * 3600000).toISOString().slice(11,16)}Z</dd>
// startDate は既にローカルTZで作られているのに utcOffset を引くため、ブラウザTZ分ずれる

// src/components/ExportTab.tsx:20-21
`**開始時刻 (Local)**: ${new Date(meta.date.Year, meta.date.Month - 1, meta.date.Day, Math.floor(meta.startTime / 3600) - meta.utcOffset, ...).toISOString().slice(11,16)}Z`
 // Local と Zulu が逆。Local を作るのに utcOffset を引いている
```

同様の誤りが `src/components/FlightsTab.tsx:220-223` `formatETA` にもある:
```ts
function formatETA(eta, startTime) {
  const date = new Date((startTime + eta) * 1000);
  return date.toISOString().slice(11,19) + 'Z'; // startTimeは現地0時からの秒だが、UTCとして表示している
}
```

## 要件
- **FR-14, FR-17**: `start_time` は 0時からの秒、`ETA` は開始からの秒。Zulu は `Local - utcOffset` で併記。マップ固定オフセット表（Caucasus +4, Marianas +10 等）を持つ

## 修正案
時刻は全て `Date.UTC` で UTC 基準に作り、表示時にオフセットを足し引きする:
```ts
// 正しい Local と Zulu の作り方
const localDate = new Date(Date.UTC(meta.date.Year, meta.date.Month-1, meta.date.Day, 0,0,0) + meta.startTime*1000);
const zuluDate = new Date(localDate.getTime() - meta.utcOffset*3600000);

// ETA は localDate を起点に
function formatETA(etaSec: number, localDate: Date) {
  return new Date(localDate.getTime() + etaSec*1000).toISOString().slice(11,19) + 'Z';
}
```
`meta.utcOffset` は `src/data/utcOffsets.json`（`docs/research-notes.md:15` 表）から引くべきだが、現行は `mission` 内の値をそのまま使っているため、マップ表との突合も必要。

## 影響
- ブリーフィングの TOT / ETA が数時間ずれる。COOP で全員が別TZのブラウザで見ると各自で異なる時刻が表示される（再現性なし）

## 検証
- `meta.date = {2025,5,1}, startTime=28800(08:00), theatre=Caucasus(UTC+4)` で Local 08:00 / Zulu 04:00 になることを `vitest` で固定値テスト（ブラウザTZに依存しないよう `Date.UTC` を使う）
- `suncalc` による日の出計算（FR-18）と組み合わせたときに Zulu が一貫しているかもテスト

## 参考
- `docs/requirements.md:FR-17` Germany Cold War の +1/+2 食い違いは要検証だが、現行コードはそもそも計算が誤っているため検証以前の問題
