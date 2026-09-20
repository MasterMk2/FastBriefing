# FastBriefing

> **DCS World の `.miz` をブラウザにドロップして、10秒でブリーフィングを始める。**

[![CI](https://github.com/MasterMk2/FastBriefing/actions/workflows/ci.yml/badge.svg)](https://github.com/MasterMk2/FastBriefing/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22_LTS-green.svg)](https://nodejs.org)
[![Vite](https://img.shields.io/badge/build-Vite_5-646CFF.svg)](https://vitejs.dev)
[![React](https://img.shields.io/badge/UI-React_18-61DAFB.svg)](https://react.dev)

FastBriefing は DCS World のミッションファイル（`.miz` = ZIP + Lua）を **ブラウザ内で完結**して解析し、フライト・経路・天候・通信・脅威・地図を一つのブリーフィング資料にまとめる Web ツールです。サーバにファイルを送らず、Windows / Linux で同じコマンドで動きます。

- **要件定義:** [`docs/requirements.md`](docs/requirements.md)（v0.1, MoSCoW/G1-G5）
- **調査根拠:** [`docs/research-notes.md`](docs/research-notes.md)（一次ソース 17件）
- **包括レビュー:** [`REVIEW.md`](REVIEW.md) / [GitHub Issues](https://github.com/MasterMk2/FastBriefing/issues)（P0 4件 / P1 10件 / P2 10件）

---

## 目次

- [特徴](#特徴)
- [対応環境](#対応環境)
- [クイックスタート](#クイックスタート)
- [使い方](#使い方)
- [画面構成](#画面構成)
- [技術スタック](#技術スタック)
- [プロジェクト構成](#プロジェクト構成)
- [開発ガイド](#開発ガイド)
- [スクリプト一覧](#スクリプト一覧)
- [ロードマップ](#ロードマップ)
- [既知の制限](#既知の制限)
- [プライバシー](#プライバシー)
- [貢献](#貢献)
- [ライセンス / 謝辞](#ライセンス--謝辞)

---

## 特徴

| 区分 | 内容 |
|---|---|
| **ローカル完結** | `.miz` の展開・Lua 解析・正規化を全てブラウザ内（Web Worker + `fflate` + `luaparse`）で実行。既定で外部に送信しません（FR-02, G5） |
| **座標変換** | DCS 座標（x=北, y=東, m）を `proj4` + pydcs パラメータの横メルカトルで緯度経度に変換。DDM / DMS / MGRS / DEC を切替可能（FR-10, FR-12） |
| **単位切替** | 高度 ft/m、速度 kt/km/h、距離 nm/km、気圧 hPa/inHg/mmHg、温度 °C/°F（FR-13） |
| **フライト** | `skill: Client/Player` を抽出、コールサイン解読、搭載（CLSID→兵装名）、無線プリセット、`AddPropAircraft` / Link16 を表示（FR-30〜36） |
| **ナビログ** | 経路点表、区間距離/真方位・磁方位/所要時間、ETA、Bullseye 参照（FR-40〜42） |
| **地図** | Leaflet による経路・Bullseye・飛行場・トリガーゾーン・`drawings`・脅威リング・支援機のレイヤ表示（FR-60〜62）。OSM 帰属表示を必ず出力（FR-64） |
| **天候** | 気温/QNH/風（FROM/TO併記）/雲プリセット/視程/霧/砂塵（FR-21）、METAR 1行要約（FR-22 予定） |
| **通信計画** | コムカード自動生成、重複周波数の警告、Guard 243.0/121.5 を併記（FR-67, FR-68） |
| **出力** | 印刷CSS → PDF（A4縦）、Markdown（Discord貼り付け）、PNG/GeoJSON（予定）（FR-80〜84） |
| **ビュー制御** | 作成者ビュー / パイロットビュー（`hidden` 尊重）（FR-70） |

---

## 対応環境

| 項目 | 対応 |
|---|---|
| ブラウザ | Chrome / Edge / Firefox 最新 |
| Node.js | 22 LTS（開発・ビルド） |
| OS | Windows 11 / Ubuntu 22.04+ で同一コマンド（NFR-01, G4） |
| マップ | Caucasus, Marianas, Syria, Nevada, Normandy, PersianGulf, TheChannel, Falklands, Sinai, Kola, GermanyCW（`src/utils/coordinates.ts:10`）。Afghanistan/Iraq は retribution fork 由来で追加予定（FR-11） |
| 機種（手元 19本で確認） | F-15E/SE, F/A-18C, F-16C, F-14A/B, F-4E, A-10C II, AV-8B, AH-64D, Ka-50 III, JF-17, M-2000C, UH-1H, Mi-24P, F-5E, C-130J, F-15C（付録A） |

---

## クイックスタート

### 1. ローカル起動（推奨）

```bash
# Node 22 を用意（nvm / volta 推奨）
node -v  # v22.x

git clone https://github.com/MasterMk2/FastBriefing.git
cd FastBriefing

npm ci
npm run dev
# → http://localhost:5173 が開く
```

### 2. ビルド & プレビュー

```bash
npm run build   # tsc && vite build → dist/
npm run preview # → http://localhost:4173
```

### 3. 静的ホスティング

`dist/` は静的ファイルのみ。GitHub Pages / Cloudflare Pages / 任意の静的ホスティングにそのままデプロイできます（NFR-02）。

```bash
# 例: GitHub Pages（gh-pages ブランチ）
npm run build
npx gh-pages -d dist
```

### 4. Docker（任意）

```dockerfile
# 将来 Tauri 化までの簡易例
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
```

---

## 使い方

1. **`.miz` をドロップ** — 画面中央のドロップゾーンにドラッグ＆ドロップ、またはクリックして選択（FR-01）。複数ファイルの差分は FR-90 で対応予定。
2. **概要を確認** — ソーティ名 / マップ / 日付 / 開始時刻（Local/Zulu併記）/ 天候 / タスク文（青・赤・中立）。
3. **フライトを選ぶ** — 青/赤タブでフライト一覧 → 機体構成・搭載・無線・経路（ナビログ）を確認。`viewMode` で作成者/パイロットを切替（FR-70）。
4. **地図で俯瞰** — レイヤ切替（フライト経路 / ゾーン / 描画 / 脅威 / 支援機 / 敵 / Bullseye / NavPoints / 飛行場）で必要な情報だけを表示（FR-62）。
5. **記入欄** — SMEAC の各節と、フライトごとのパイロット・TOT・Joker/Bingo 燃料を記入。同じファイル名・内容の `.miz` を再び開くとブラウザに保存した内容を復元します。サイドカー JSON でも保存・読み込みできます（FR-38、FR-71、FR-72）。
6. **出力** — 「出力」タブで Markdown、正規化 JSON、経路・ゾーンの GeoJSON / KML、印刷 / PDF（Ctrl+P、A4縦）、ブリーフィング要約 PNG を出力できます。GeoJSON / KML はパイロットビューの非表示項目と座標未解決の項目を除外します。円形ゾーンは64辺の多角形で近似します。`.miz` への PNG 埋め込みは未対応です（FR-09、FR-80、FR-81、FR-83、FR-84）。

> **ヒント:** 設定（座標形式・単位・言語）はヘッダー右のセレクトで切替。`localStorage` に保存され再訪時に復元されます。

---

## 画面構成

```
Header
├── FastBriefing ロゴ
├── 作成者ビュー / パイロットビュー 切替
└── 言語切替（ja / en）

Main
├── DropZone（未読込時）
│   └── .miz ドロップ / ファイル選択 / エラー表示
└── MissionView（読込後）
    ├── [概要]     OverviewTab — メタ情報 / 天候 / 風 / タスク文 / 警告
    ├── [フライト] FlightsTab — フライト一覧 + 詳細（構成/搭載/無線/経路）
    ├── [地図]     MapTab — Leaflet + レイヤ切替 + Bullseye/NavPoints/脅威リング
    ├── [通信]     CommsTab — フライト別 / 支援機 / 共通周波数 / 重複警告
    ├── [支援機]   SupportTab — Tanker/AWACS/Carrier/JTAC
    ├── [脅威]     ThreatsTab — SAM/AAA リング / 敵航空機
    ├── [記入欄]   NotesTab — SMEAC / フライト別メモ / サイドカー JSON
    └── [出力]     ExportTab — Markdown / 正規化 JSON / GeoJSON / KML / 印刷 / PNG
```

---

## 技術スタック

| 領域 | 選定 | 理由 |
|---|---|---|
| 言語・ビルド | TypeScript 5 + Vite 5 | ブラウザ完結、Win/Linux 同一手順 |
| UI | React 18 | 地図・表ライブラリの選択肢が豊富 |
| ZIP | `fflate` 0.8 | 小・高速・Worker対応（JSZip は 2022年停止） |
| Lua 解析 | `luaparse` 0.3 AST | コードを実行せずテーブルだけを JSON 化 |
| 投影 | `proj4` + pydcs パラメータ | pydcs と同一式で ME 表示と一致を狙う |
| 地図 | `Leaflet` 1.9 + `react-leaflet` 4 | 軽量、タイル差替容易 |
| 天文 | `suncalc` 1.9 | 日の出/月齢（FR-18 予定） |
| 磁気偏差 | `geomagnetism` 予定 | WMM2020/2025 で磁方位を計算（FR-16 予定） |
| i18n | `i18next` + `react-i18next` | 日英切替（FR-99） |

詳細は `docs/requirements.md:7.2` を参照。

---

## プロジェクト構成

```
FastBriefing/
├── public/                 # 静的アセット（favicon.svg）
├── src/
│   ├── App.tsx             # DropZone + 正規化 + 状態管理
│   ├── main.tsx            # ReactDOM + SettingsProvider
│   ├── index.css           # 全体スタイル / 印刷CSS
│   ├── vite-env.d.ts
│   ├── components/         # 7タブ + MissionView
│   │   ├── OverviewTab.tsx
│   │   ├── FlightsTab.tsx
│   │   ├── MapTab.tsx
│   │   ├── CommsTab.tsx
│   │   ├── SupportTab.tsx
│   │   ├── ThreatsTab.tsx
│   │   ├── ExportTab.tsx
│   │   └── MissionView.tsx
│   ├── core/
│   │   ├── MissionParser.ts      # Worker ラッパ
│   │   └── MissionNormalizer.ts  # 生Lua → MissionData 正規化
│   ├── workers/
│   │   └── missionParser.ts      # fflate + luaparse（Worker内）
│   ├── utils/
│   │   └── coordinates.ts        # 投影 / 書式 / 距離・方位
│   ├── hooks/
│   │   └── useSettings.tsx       # DisplaySettings + localStorage
│   ├── types/
│   │   └── mission.ts            # MissionData / Weather / Coalition …
│   └── i18n/               # （空）FR-99 で整備予定
├── docs/
│   ├── requirements.md     # 要件定義書 v0.1
│   └── research-notes.md   # 一次ソース調査 17件
├── REVIEW.md               # 包括レビュー報告（24件のIssue一覧）
├── .github/
│   ├── issues/             # 24件のIssueドラフト（gh issue create --body-file で登録済み）
│   └── ISSUE_TEMPLATE/
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── package.json
└── .gitignore
```

---

## 開発ガイド

### 前提

- Node 22 LTS
- Chrome / Edge / Firefox 最新

### セットアップ

```bash
npm ci
npm run dev      # 開発サーバ
```

### 品質チェック

```bash
npm run build    # tsc --noEmit + vite build（型エラーで失敗）
npm run lint     # eslint（設定ファイル整備中 → Issue #15）
npm test         # vitest run（テスト0本 → Issue #16 で拡充予定）
```

> **Note:** 現行 `npm run lint` は設定ファイル欠落で失敗します（[#15](https://github.com/MasterMk2/FastBriefing/issues/15)）。`npm test` はテストファイル未作成で 0本成功扱いです（[#16](https://github.com/MasterMk2/FastBriefing/issues/16)）。Phase 0 で修正予定。

### コーディング規約

- TypeScript `strict: true`, `noUnusedLocals/Parameters: true`
- コンポーネントは `DisplaySettings` を props で受け取り、単位・座標形式を `utils/coordinates.ts` 経由で整形
- 新規の参照データ（投影、兵装、脅威半径等）は `src/data/*.json` に分離し、pydcs 由来スクリプトで更新可能にする（NFR-06）

---

## スクリプト一覧

| コマンド | 内容 |
|---|---|
| `npm run dev` | Vite 開発サーバ（HMR） |
| `npm run build` | `tsc && vite build` → `dist/` |
| `npm run preview` | `dist/` のプレビュー |
| `npm test` | `vitest run` |
| `npm run lint` | `eslint . --ext ts,tsx --max-warnings 0` |

---

## ロードマップ

`docs/requirements.md:9` より抜粋。詳細は [Issues](https://github.com/MasterMk2/FastBriefing/issues) のマイルストーンを参照。

| Phase | 期間目安 | 内容 | 完了条件 |
|---|---|---|---|
| **0: 技術検証** | 1週 | `.miz` → JSON、Caucasus/Marianas 座標照合、性能実測 | 手元19本がJSON化でき座標がMEと一致（[#1](https://github.com/MasterMk2/FastBriefing/issues/1) [#2](https://github.com/MasterMk2/FastBriefing/issues/2) [#3](https://github.com/MasterMk2/FastBriefing/issues/3) ほか） |
| **1: MVP** | 3〜4週 | 読込/概要/天候/フライト/ナビログ/通信/支援機/地図/印刷/Markdown/ビュー切替/i18n | G1・G2・G5 達成 |
| **2: 資料化強化** | 3〜4週 | ニーボードPNG/`.miz`埋込/脅威リング/差分/リント/プレゼンモード/手入力保存 | G3・G4 達成で v1.0 |
| **3: 共同作業** | 未定 | 共有リンク/スロット申告/タイムライン/燃料はしご/DTC/Tauri | 要望で優先度決定 |

包括レビュー（24件）の優先度マップは [`REVIEW.md`](REVIEW.md#優先度付きロードマップ提案) を参照。

---

## 既知の制限

現行 v0.1.0 で把握している主な制限（全て Issue 化済み）：

- **P0 ブロッカー:** `.miz` 読込が Promise バグで失敗（[#1](https://github.com/MasterMk2/FastBriefing/issues/1)）、座標変換の forward/inverse 逆（[#2](https://github.com/MasterMk2/FastBriefing/issues/2)）、地図の theatre ハードコード（[#3](https://github.com/MasterMk2/FastBriefing/issues/3)）
- **P1 主要:** navPoints が `[0,0]`（[#5](https://github.com/MasterMk2/FastBriefing/issues/5)）、脅威リング常に0（[#8](https://github.com/MasterMk2/FastBriefing/issues/8)）、MGRS スタブ（[#7](https://github.com/MasterMk2/FastBriefing/issues/7)）、Zulu 計算誤り（[#12](https://github.com/MasterMk2/FastBriefing/issues/12)）ほか
- **P2 品質:** lint 設定欠落（[#15](https://github.com/MasterMk2/FastBriefing/issues/15)）、i18n 空・テスト0本（[#16](https://github.com/MasterMk2/FastBriefing/issues/16)）、バンドル 470KB 未分割（[#19](https://github.com/MasterMk2/FastBriefing/issues/19)）

---

## プライバシー

- 既定で `.miz` の内容を外部に送信しません。解析は全てブラウザ内（Worker）で完結します（NFR-03, G5）。
- 外部通信は地図タイル（OpenStreetMap 等）の取得のみ。オフライン時は同梱の簡易 GeoJSON で経路のみ表示するフォールバックを Phase 2 で予定（FR-65）。
- 出力物（PDF/PNG/Markdown）にローカルパスやユーザー名を含めません（FR-86, NFR-10）。

---

## 貢献

Issue / PR を歓迎します。

1. [Issues](https://github.com/MasterMk2/FastBriefing/issues) で既存の 24件を確認し、重複がなければ新規作成
2. `git checkout -b feat/xxx` でブランチを切る
3. `npm run build` が通ることを確認（`npm run lint` / `npm test` は Phase 0 で整備中）
4. PR では `file_path:line_number` 形式で該当箇所を明記

---

## ライセンス / 謝辞

- **コード:** MIT（予定, NFR-07, 未決 Q1 で確定）— `LICENSE` を Phase 0 で追加予定
- **参照データ:** pydcs（LGPL-3.0）由来の投影パラメータ・兵装・脅威半径等は生成スクリプトで JSON 化し、帰属を `NOTICE` に記載予定。ED の Lua / 画像は同梱しません
- **謝辞:** [pydcs](https://github.com/pydcs/dcs) / [Hoggit Wiki](https://wiki.hoggitworld.com) / [ED Forums](https://forum.dcs.world) / [OpenStreetMap](https://www.openstreetmap.org) / [suncalc](https://github.com/mourner/suncalc) / [proj4js](https://github.com/proj4js/proj4js) / [fflate](https://github.com/101arrowz/fflate) / [luaparse](https://github.com/fstirlitz/luaparse)

---

## リンク

- 要件定義: [`docs/requirements.md`](docs/requirements.md)
- 調査メモ: [`docs/research-notes.md`](docs/research-notes.md)
- レビュー報告: [`REVIEW.md`](REVIEW.md)
- Issues: https://github.com/MasterMk2/FastBriefing/issues
- DCS World: https://www.digitalcombatsimulator.com
