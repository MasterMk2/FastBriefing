# [P1] AIGroup の threatRange が常に 0 - SAM/AAA 脅威リングが地図に出ない

**Labels:** `bug`, `P1-major`, `normalizer`, `map`
**Milestone:** Phase 2

## 概要
`src/core/MissionNormalizer.ts:544-588` `normalizeAIGroups` が `threatRange: 0` を固定で返し、参照データ（`pydcs` の `threat_range` / `detection_range`）を一切見ていない。結果として `MapTab.tsx:160-175` / `ThreatsTab.tsx:10-44` のフィルタ `g.threatRange && g.threatRange > 0` が常に false で、脅威リングが一枚も描画されない。手元 19 本は SAM/AAA が豊富で検証に十分とされているが、現行コードでは検証できない。

## 該当箇所
```ts
// src/core/MissionNormalizer.ts:573-582
groups.push({
  category: getString(group, ['category'], 'unknown'),
  type: getString(unit, ['type']),
  count: units.length,
  position: [x, y],
  threatRange: 0, // ← 固定
  hidden: getValue(groupData, ['hidden']) === true,
  // ...
});
```

`src/types/mission.ts:200-209` の `AIGroup` 型は `threatRange?: number` を持つが、正規化で埋めていない。

## 要件
- **FR-54 SHOULD**: 敵地上ユニットから SAM/AAA/早期警戒レーダーを分類し、機種別 `threat_range` でリングを描く
- `docs/research-notes.md:13` では `pydcs/dcs/vehicles.py` の `threat_range` が最も扱いやすいと明記
- `NFR-06` では参照データを JSON 分離し `tools/pydcs_export` で更新可能にすべき

## 修正案
1. `src/data/threatRanges.json` を新設（pydcs から生成）:
   ```json
   { "SA-10": 90000, "SA-6": 25000, "SA-15": 12000, "ZSU-23-4": 2500 }
   ```
2. `normalizeAIGroups` で `type` をキーに lookup し、見つからなければ `detection_range` をフォールバック、さらに見つからなければ `0` のまま `warnings` に「未知の脅威半径: <type>」を積む（FR-06）
3. `ThreatsTab` / `MapTab` で `threatRange` が 0 のものは「脅威半径未収録」として区別表示

## 影響
- 地図の脅威レイヤーが機能せず、ブリーフィングの安全側情報が欠落（GCI/JTAC シーン S5 で致命的）
- `docs/requirements.md:5.6 FR-54` の SHOULD を満たせないため Phase 2 完了条件を満たせない

## 検証
- 手元に登場する `S_75M_Volhov, Kub, Hawk, NASAMS, Strela-1, ZSU-23-4` の各 `type` で `threatRange > 0` になることを fixture テスト

## 参考
- `docs/research-notes.md:144-152` 参照データ生成手段
- Hoggit Threat Database: https://wiki.hoggitworld.com/view/Threat_Database （ライセンス要確認のため pydcs 優先）
