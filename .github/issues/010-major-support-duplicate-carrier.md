# [P1] Support 検出: 艦艇の二重走査 / TACAN/ICLS 未取得 / JTAC 未検出

**Labels:** `bug`, `P1-major`, `normalizer`
**Milestone:** Phase 1

## 概要
`src/core/MissionNormalizer.ts:439-543` `normalizeSupport` に3つのバグがある:
1. `ships` を2回走査（`planes/helicopters/ships` と `ships` 単独）するため、CVN/LHA は Tanker/AWACS 判定と Carrier 判定で二重に `support` に積まれる可能性がある
2. `normalizeTanker` / `normalizeAWACS` / `normalizeCarrier` が `TACAN` / `ICLS` / `Link4` を常に `undefined` で返し、`ActivateBeacon` タスクを見ていない
3. JTAC/FAC（`task: 'JTAC'` / `FAC`）の検出自体が存在しない（FR-53 SHOULD）

## 該当箇所
```ts
// src/core/MissionNormalizer.ts:454-468
for (const group of [...planes, ...helicopters, ...ships]) {
  if (task === 'Tanker') support.push(normalizeTanker(...));
  else if (task === 'AWACS') support.push(normalizeAWACS(...));
}
// すぐ下で ships を再走査
for (const ship of ships) {
  for (const grp of groups) {
    if (type.includes('CVN') || type.includes('LHA')) support.push(normalizeCarrier(...));
  }
}
```
```ts
// src/core/MissionNormalizer.ts:486-506 normalizeTanker
return { kind: 'tanker', callsign, frequency, position, tacan: undefined, orbit: ... }
```

実データでは TACAN は `unit.AddPropAircraft` ではなく、経路点タスク `WrappedAction { action: 'ActivateBeacon', params: { type: 4, callsign, channel, mode } }` で付与される（Hoggit Wiki / pydcs `dcs/beacon.py`）。これを全く読んでいない。

## 要件
- **FR-50 MUST** Tanker: TACAN (`ActivateBeacon`), 高度/速度/軌道
- **FR-51 MUST** AWACS: 同上
- **FR-52 SHOULD** Carrier: TACAN/ICLS/Link4
- **FR-53 SHOULD** JTAC: コールサイン/周波数/レーザーコード

## 修正案
1. 二重走査を解消: `ships` は一度だけ走査し、`task` と `type` の両方で判定する分岐に統合
2. `route.points[].task.params` を走査して `ActivateBeacon` / `ActivateICLS` / `ActivateLink4` を抽出し、`SupportAsset.tacan/icls` に詰める
   ```ts
   function extractBeacons(routePoints): { tacan?: TACAN, icls?: ICLS } {
     for (const p of routePoints) {
       for (const t of getArray(p, ['task','params','tasks'])) {
         if (t.params?.action === 'ActivateBeacon') { /* ... */ }
       }
     }
   }
   ```
3. JTAC 検出: `task === 'GroundAttack'` かつ `group.units[0].type` が `Soldier` / `JTAC` / `MCC` 等のリストに含まれるか、`route` に `FAC` 関連タスクがあるかで判定（手元に実例がないため、テスト用 `.miz` を新規作成して検証）

## 検証
- Tanker/AWACS/Carrier/JTAC それぞれの fixture `.miz` を用意（手元 19 本には Tanker/JTAC 実例が無いため要新規作成）し、`support[].tacan.channel` 等が非 undefined になることをテスト

## 影響
- 通信計画（CommsTab）で支援機周波数/TACAN が `-` 表示のまま。給油時の TACAN 未設定警告（FR-91 リント）も出せない
