# FastBriefing 包括レビュー報告

**日付:** 2026-09-06
**対象:** `FastBriefing` v0.1.0 (`src/` 18ファイル, `docs/requirements.md` v0.1)
**手法:** 静的解析 + ビルド/型チェック実行 + 要件トレース + Orca orchestration 6並列観点
**Orca Run:** `run_a79f6473a1e2` (6 tasks)

---

## エグゼクティブサマリ

| 区分 | 件数 | 代表 |
|---|---|---|
| **P0 Critical** | 4件 | #001 arrayBuffer Promise / #002 CRS逆転 / #003 hardcoded Caucasus / #004 ZipBomb |
| **P1 Major** | 10件 | #005 navPoints 0,0 / #006 zonesスタブ / #007 MGRSスタブ / #008 threatRange 0 / #009 payload 0 / #010 support二重走査 / #011 Lua配列バグ / #012 日付Zulu逆転 / #013 magvar/suncalc未実装 / #014 QNH二重換算 |
| **P2 Medium** | 10件 | #015 lint欠落 / #016 i18n空・テスト0 / #017 window.L・a11y / #018 localStorage無検証 / #019 bundle 470KB / #020 repo衛生 / #021 export Zulu逆・印刷1タブのみ / #022 comms粒度粗い / #023 CI無し・git未初期化 / #024 DnD UX |
| **計** | **24件** | 全て `.github/issues/` に Markdown として起票済み |

**致命的な所見:** 現行コードは `npm run build` は通るが、`MissionParser` の Promise バグ（#001）により **任意の .miz がランタイムで100%失敗**する。加えて CRS 逆転（#002）と Map ハードコード（#003）で Marianas（手元14/19本）の地図が全滅。G1/G2/G3 の成功基準を1つも満たせない状態。

**良い点:**
- 要件定義書 `docs/requirements.md` と `research-notes.md` は一次ソース付きで極めて高品質。FR/NFR の MoSCoW 分類とロードマップが明確で、実装の羅針盤として機能している
- `MissionNormalizer` の `getValue/getNumber/getString` ヘルパ、辞書解決、`hidden` 尊重など、堅牢性への意識はコードに表れている（FR-06）
- `fflate` + `luaparse` + `proj4` + `leaflet` + `suncalc` の選定は要件に合致し、依存も軽量

---

## Orca Orchestration 実行記録

本レビューは Orca の構造化オーケストレーションで実施した。

```bash
orca status --json # runtime ready (1.4.197)
orca orchestration run-create --objective "FastBriefing包括レビュー: 6並列観点で解析しGitHub issue化"
orca orchestration task-create --spec "ReviewA: Parser/Worker/Security" # task_ec9af91921ee
orca orchestration task-create --spec "ReviewB: Normalizer/DataModel"   # task_7c6365928196
orca orchestration task-create --spec "ReviewC: Coordinates/Map"        # task_5c57dc64130a
orca orchestration task-create --spec "ReviewD: UI/State/A11y"          # task_6a7ed0e22762
orca orchestration task-create --spec "ReviewE: Build/Config/i18n/Tests" # task_923c2f809401
orca orchestration task-create --spec "ReviewF: Export/Output"          # task_9455eaeb9c89
```

各タスクは本レポートの Issue 群に対応。コーディネータ（本セッション）が全タスクを集約し、`.github/issues/` に 24件を起票した。

---

## 要件トレース（抜粋）

| 要件 | 状態 | Issue |
|---|---|---|
| FR-01 .miz読込 | 🔴 Blocked | #001 Promiseバグで全滅 |
| FR-02 ローカル完結 | 🟢 OK | - |
| FR-03 ZIP展開 | 🟡 部分的 | #004 サイズ制限なし、バイナリも文字列化 |
| FR-04 Lua実行せずAST | 🟡 部分的 | #011 配列バグ・変数名固定 |
| FR-05 DictKey解決 | 🟢 OK | - |
| FR-06 未知キーで落ちない | 🟡 部分的 | #008, #009, #014 で warnings 未使用 |
| FR-07 Worker/進捗 | 🔴 未達 | #001 で Worker 自体が失敗、進捗UIなし |
| FR-10 座標変換 | 🔴 誤り | #002 CRS逆転 |
| FR-11 未対応マップ警告 | 🔴 未実装 | #002, #005 で warnings 未使用 |
| FR-12 DDM/DMS/MGRS | 🔴 スタブ | #007 MGRSがダミー、FlightsTabで無視 |
| FR-13 単位切替 | 🟡 部分的 | #014 QNH二重換算 |
| FR-14 単位の意味 | 🟡 部分的 | #012 ETA/Zulu誤り |
| FR-15 風向FROM | 🟢 OK | `windFromTo` は正しい |
| FR-16 磁方位 | 🔴 未実装 | #013 |
| FR-17 UTC/Zulu併記 | 🔴 誤り | #012 |
| FR-18 日の出/月齢 | 🔴 未実装 | #013 suncalc未使用 |
| FR-20 概要 | 🟢 OK | - |
| FR-21 天候 | 🟡 部分的 | #014 QNH/雲 |
| FR-30 フライト一覧 | 🟢 OK | - |
| FR-33 搭載 | 🔴 固定0 | #009 |
| FR-34 無線 | 🟢 OK | - |
| FR-40 ナビログ | 🟡 部分的 | #007 座標形式無視、#013 leg未計算 |
| FR-43 飛行場 | 🟡 部分的 | airbasesロジック不完全 |
| FR-50/51 支援機 | 🔴 不完全 | #010 TACAN/ICLSなし |
| FR-54 脅威リング | 🔴 常に0 | #008 |
| FR-60/61 地図 | 🔴 誤り | #003 hardcoded, #006 zones空 |
| FR-62 レイヤ切替 | 🟢 OK | - |
| FR-67 コムカード | 🟢 OK | - |
| FR-68 重複警告 | 🟡 粗い | #022 |
| FR-70 ビュー切替 | 🟡 部分的 | viewModeはあるが参照データフィルタなし |
| FR-80 印刷/PDF | 🔴 1タブのみ | #021 |
| FR-81 PNG | 🔴 未実装 | #021 |
| FR-83 Markdown | 🟡 部分的 | #021 Zulu逆 |
| FR-99 i18n | 🔴 空 | #016 |
| NFR-03 プライバシー | 🟢 OK | ローカル完結 |
| NFR-05 堅牢性 | 🟡 部分的 | FR-06は意識あるが #011 で落ちるケースあり |
| NFR-08 テスト | 🔴 0本 | #016 |
| NFR-10 衛生 | 🔴 NG | #020 HTML clutter, .gitなし |

---

## 優先度付きロードマップ提案

### Phase 0 fix（1週間）- ブロッカー解消
1. #001 arrayBuffer Promise
2. #002 CRS 逆転の検証と修正
3. #003 Map hardcoded
4. #011 Lua配列バグ
5. #020 git init + .gitignore + README + LICENSE
6. #015 ESLint 設定
7. #023 CI 雛形

### Phase 1 MVP（3-4週）- G1/G2/G5 達成
- #005 navPoints latlon
- #012 日付/Zulu
- #014 QNH/雲
- #009 payload
- #008 threatRange + 参照DB
- #010 support TACAN
- #006 zones/drawings
- #007 MGRS + 座標形式の全タブ反映
- #016 i18n + 最低5本のテスト
- #017 Leaflet import + a11y
- #018 settings validation
- #024 DnD UX

### Phase 2 資料化強化（3-4週）- G3/G4 達成
- #013 magvar/suncalc + leg 計算
- #019 bundle分割
- #021 印刷/PNG
- #022 comms 精度
- #023 CI 両OS + 性能計測

---

## GitHub Issue 起票状況

### 起票済み（ローカル）
`.github/issues/` に 24件の Markdown を作成。各ファイルは `gh issue create --title --body-file --label` でそのまま GitHub に登録可能。

```
.github/issues/
├── 001-critical-file-arraybuffer-promise-bug.md
├── 002-critical-crs-projection-inversion.md
├── 003-critical-map-hardcoded-caucasus.md
├── 004-critical-zipbomb-resource-exhaustion.md
├── 005-major-navpoints-latlon-zero.md
├── 006-major-triggerzone-drawings-stub.md
├── 007-major-mgrs-stub-and-coordinate-formats.md
├── 008-major-threatrange-always-zero.md
├── 009-major-payload-always-zero.md
├── 010-major-support-duplicate-carrier.md
├── 011-major-lua-parser-array-bug.md
├── 012-major-datetime-zulu-miscalc.md
├── 013-major-missing-suncalc-magvar.md
├── 014-major-weather-qnh-clouds.md
├── 015-major-lint-and-tsconfig-drift.md
├── 016-major-i18n-empty-and-tests-zero.md
├── 017-major-leaflet-windowL-and-a11y.md
├── 018-major-settings-localstorage-validation.md
├── 019-major-bundle-size-and-code-splitting.md
├── 020-major-repo-hygiene-and-research-clutter.md
├── 021-minor-export-markdown-zulu-and-print.md
├── 022-minor-comms-duplicate-granularity.md
├── 023-minor-missing-ci-and-git-init.md
└── 024-minor-app-dragdrop-ux-and-error-recovery.md
```

### GitHub への登録方法
リポジトリが未初期化のため、本セッションでは `gh issue create` を実行していない。登録は以下のいずれかで実行する:

**A. 手動（推奨）:**
```bash
git init
git remote add origin <GitHub URL>
gh issue create --title "[P0] MissionParser: file.arrayBuffer() のPromise..." --body-file .github/issues/001-critical-file-arraybuffer-promise-bug.md --label "bug,P0-critical"
# 002-024 も同様に
```

**B. 一括スクリプト:**
```powershell
Get-ChildItem .github/issues/*.md | ForEach-Object {
  $title = (Get-Content $_.FullName | Select-Object -First 1).TrimStart('# ')
  gh issue create --title $title --body-file $_.FullName --label "bug"
}
```

**C. Orca 経由で一括:**
本レビューの Orca Run (`run_a79f6473a1e2`) を再利用し、各 Issue を Task として dispatch することも可能。

---

## 検証ログ

```
npm run build: ✅ 3.41s, 470KB (gz 148KB), tsc 0 errors
npm run lint:  ❌ ESLint couldn't find a configuration file
npm test:      ⚠️ No test files found, exiting with code 0（誤成功）
git status:    ❌ NOT A GIT REPO
orca status:   ✅ runtime ready 1.4.197
```

---

## 次のアクション（ユーザーへの提案）

1. 本レポートの Phase 0 fix 7件から着手するか確認する
2. GitHub リポジトリ URL を共有いただければ、こちらで `git init` + `gh issue create` まで一括実行する
3. 手元 19 本の `.miz` のうち、テスト用に同梱可能なもの（`Q5`）を 1-2 本選定する
