# UI 刷新 P0 の凍結インターフェース（契約）

対象: FastBriefing 刷新の土台（P0）。後続パッケージ P1〜P8 は、この文書と `design/SPEC.md`（作業フォルダの設計書）だけを読んで作業する。パスはすべてリポジトリ直下からの相対パス。

凡例: **凍結** = 後続が変えない。**拡張可** = 後続が項目を足せるが、既存の名前と型は変えない。

---

## 1. 作業ルール（全パッケージ共通）

- 自分のパッケージのファイルだけを編集する。型・共有関数・シェルの枠（`src/shell/*` の P0 所有分）を変えたい場合は P0 に依頼する。
- 画面ファイルは **default export、props なし**（lazy 読み込み）。データは `useMission()`、`useWorkspace()`、`useUnits()`、`useSettings()` から読む。mission の parse と normalize を画面から直接呼ばない。
- i18n は **名前空間を必ず明記する**: `t('shell:nav.overview')`。`useTranslation('shell')` を使うファイルでも、キーは `shell:` を付ける（静的検査が名前空間付きのキーを見る）。
- 色は `src/styles/tokens.css` のトークンだけを使う。パッケージ CSS に 16 進数を直接書かない。
- 状態（陣営・表示・単位・テーマ・文字の大きさ・言語・選んだフライト）は画面を移っても残る。地図のレイヤーと注釈モードは `useWorkspace().mapUi`（ミッションを閉じると消える）。
- 旧タブのファイルは統合時に Lead が削除する（SPEC 8）。P0 は旧タブを消さない。

---

## 2. 状態と型

### 2.1 `src/types/mission.ts`（凍結。拡張可の項目は明記）

- `MissionData.issues: MissionIssue[]`（`warnings` は廃止）。
- `MissionIssue { code: IssueCode; severity: IssueSeverity; params?: Record<string, string | number>; side?: IssueSide }`。`IssueSide = 'blue' | 'red' | 'neutral'`（`side` は P0 で足した任意項目）。`side` はその issue の元データを持つ陣営。陣営に属さない issue（地図、天候、時刻、磁方位、解析）は `side` を持たない。
- `IssueCode`（拡張可。SPEC §6.1 の 9 件に加えて P0 で 3 件追加、計 12 件）:
  `threat.rangeUnrecorded`（info）、`unit.unknownType`（info）、`weapon.unknownClsid`（info、追加）、`weather.cloudPresetUnknown`（info、追加）、`weather.qnhDefaulted`（warning）、`weather.temperatureDefaulted`（warning）、`airbase.nameMissing`（info）、`map.unsupported`（warning）、`magvar.unsupported`（warning、SPEC §6.1 の項目。SPEC に severity の記載が無いため P0 が warning に決めた）、`time.utcOffsetUnknown`（warning、追加）、`parse.unknownNode`（warning）、`coord.unresolved`（info）。
  severity は `src/core/issues.ts` の `ISSUE_SEVERITY` で code から決まる。同じ code でも `side` が違えば別の issue として残る（重複除去の鍵に含む）。
  **発生源（`addIssue` の呼び出し）があるのは P0 で 8 件**（`threat.rangeUnrecorded`、`unit.unknownType`、`weapon.unknownClsid`、`weather.cloudPresetUnknown`、`map.unsupported`、`magvar.unsupported`、`time.utcOffsetUnknown`、`parse.unknownNode`）。`weather.qnhDefaulted`、`weather.temperatureDefaulted`、`airbase.nameMissing`、`coord.unresolved` は **P0 では未発生**。QNH と気温の既定化を issue にするかは利用者が決める（§10）。
- 表示文言は `issues` 名前空間（キー = code、例 `issues:map.unsupported`）。`src/core/issueText.ts` の `issueText(issue)` と `issueTexts(issues, codes)` を使う。
- `SupportAsset.hidden: boolean`（DCS のグループの hidden）。
- `TACAN.latlon?` / `ICLS.latlon?`: 未解決は `undefined`（`[0, 0]` は入れない）。`latlonResolved: false` を併記。
- `Airbase.owner` は大文字（`"RED"`、`"BLUE"`、`"NEUTRAL"`）。
- `ParsedMissionFile` は `src/types/mission.ts` が正。`briefingImages` と `parseIssues?: MissionIssue[]` を含む。
- `Side = 'blue' | 'red'`、`ThemeId = 'ffs' | 'standard' | 'night'`、`CoordinateFormatSetting = CoordinateFormat | 'aircraft'`。

### 2.2 `DisplaySettings`（schema v5、凍結）

| キー | 型 | 既定 |
|---|---|---|
| `language` | `'ja' \| 'en'` | `'ja'` |
| `outputLanguage` | `'ja' \| 'en'` | `'ja'`（資料の言語。UI 言語と別, D7） |
| `theme` | `ThemeId` | `'ffs'`（v2〜v4 の `'default'` は `'standard'` へ移行） |
| `fontScale` | `'standard' \| 'large'` | `'standard'` |
| `viewMode` | `'creator' \| 'pilot'` | `'pilot'` |
| `side` | `Side \| null` | `null`（null は「自動」。Client を含むフライトが多い側。同数は blue, D2） |
| `coordinateFormat` | `CoordinateFormatSetting` | `'DDM'` |
| `unitSystem` | `'metric' \| 'imperial'` | `'metric'` |
| `altitudeUnit` / `speedUnit` / `distanceUnit` / `pressureUnit` / `temperatureUnit` | 既存 | `m` / `kt` / `nm` / `hPa` / `C` |
| `windDisplay` | `'from' \| 'to' \| 'both'` | `'both'`（D5） |
| `timeDisplay` | `'local' \| 'zulu' \| 'both'` | `'both'`（D6） |
| `mapBackground` | `boolean` | `true` |
| `kneeboardWidth` | `1536 \| 2048 \| 3072` | `1536` |
| `briefingSections` | `BriefingSection[]` | 既存（P3 が `briefingSections.ts` を更新） |
| `briefingPresets` | `BriefingPreset[]` | `[]` |

- 移行: `src/hooks/useSettings.tsx` の `migrateSettings`。v1 はテーマを `ffs` に、v2〜v4 は `'default'` を `'standard'` に、v3 は記入欄の位置を移す。壊れた値はフィールド単位で既定に戻る。
- 保存キー `fastbriefing-settings`、`settingsVersion: 5`（`src/i18n/index.ts` の `SETTINGS_VERSION`）。
- `useSettings()` の返り値（凍結。`set*` は `boolean`＝保存できたか）:
  `settings`、`setCoordinateFormat`、`setUnitSystem`、`setAltitudeUnit`、`setSpeedUnit`、`setDistanceUnit`、`setPressureUnit`、`setTemperatureUnit`、`setViewMode`、`setSide(side | null)`、`setLanguage`、`setOutputLanguage`、`setTheme`、`setFontScale`、`setWindDisplay`、`setTimeDisplay`、`setMapBackground`、`setKneeboardWidth`、`setBriefingSections`、`setBriefingPresets`、`resetDisplaySettings()`（既定に戻す。断面の順序とプリセットは残す）。
- 同じイベント内で複数の setter を呼んでも値は消えない（最新値を ref で持つ）。

### 2.3 その他の型（凍結）

- `src/types/screen.ts`: `ScreenId = 'overview' | 'flights' | 'map' | 'comms' | 'support' | 'threats' | 'notes' | 'export' | 'briefing' | 'revision' | 'initial'`、`NAV_SCREENS`、`CREATOR_ONLY_SCREENS`。
- `src/types/lint.ts`: `LintFinding { id, code, severity, side: 'blue'|'red'|'neutral', screen: ScreenId, anchor?, flightKey?, params }`（P5 が規則を実装）。
- `src/export/exportPlan.ts`: `ExportScope`、`ExportPlan`（型のみ。P3 が実装）。
- `src/utils/flightKey.ts`: `flightKey(side, groupId): string`（= `${side}:${groupId}`。注記の key と同じ）。

---

## 3. 共有の関数（凍結）

| 関数 | ファイル | 規則 |
|---|---|---|
| `applyViewMode(mission, viewMode, side?)` | `src/utils/viewMode.ts` | creator は原本をそのまま返す。pilot は表示勢力以外の陣営の flights・support・aiGroups・navPoints を空にし、敵の bullseye を `latlonResolved: false` に置き換え、敵の飛行場を除く（D1）。敵陣営の任務文（`meta.descriptionBlueTask` / `descriptionRedTask` のうち敵側）を空にする。中立の任務文は残す（D1）。hidden と lateActivation の AI を除く（G11）。`side` 省略時は `defaultSide`。zones と drawings は正規化で陣営間の共有データ（同じ配列、地図は blue の配列を読む）。パイロットでは DCS の F10 マップで表示勢力のプレイヤーに見えるものだけを残す（Lead 決定）: トリガーゾーンはエディタ専用なので全部除く。図形は表示勢力のレイヤー・`Neutral`・`Common` で、かつ `visible` のものだけ残す。`Author`、相手陣営、名前が不明なレイヤーは除く。issues は `side` を持たないもの（全体）と表示勢力のものだけを残す（D1）。 |
| `compareMissionRevisions(before, after, viewMode, side?)` | `src/utils/missionRevision.ts` | P0 が `side` を足した。パイロットでは表示勢力（`side`）のフライトだけを照合・比較する（D1）。相手陣営と中立のフライトは照合の前に除くので、その追加・削除・変更は出ない。`side` が無いパイロットは、フライトを 1 件も比べない（安全側）。hidden は従来どおり除く（G11）。改版画面は `useMission().side` を `RevisionComparison` の `side` prop に渡す。 |
| `defaultSide(mission)` / `resolveSide(mission, side?)` | 同上 | D2。 |
| `getMagneticVariation(theatre, lat, lon, date)` | `src/utils/magvar.ts` | `number \| null`。表が無い地図（Afghanistan、Iraq、独自地図）は `null`。`routeLegs` は null のとき磁方位を `undefined`（真のみ）にする。 |
| `resolveCoordinateFormat(setting, aircraftType?)` | `src/utils/coordinates.ts` | `'aircraft'` は機種の既定、不明は DDM。`formatCoordinate` は `CoordinateFormatSetting` を受け、`'aircraft'` は DDM に落ちる。**機種を知っている呼び出し（P1 の経路表、P3 の出力）は `resolveCoordinateFormat` で機種を渡すこと。** |
| `addIssue(issues, code, params?, side?)` | `src/core/issues.ts` | code、params、side の組で重複を除く。 |
| `issueText(issue)` / `issueTexts(issues, codes)` | `src/core/issueText.ts` | 表示文言（`issues` 名前空間）。 |
| `parseMissionArchive` | `src/workers/missionParser.ts` | `ZIP_LIMITS.MAX_ENTRIES = 4096`（エントリ数のみ緩和）。合計サイズ、個別サイズ、圧縮比の上限は据え置き。 |

### 3.1 `MissionData` の派生値（凍結）

- `useMission().view` は `applyViewMode(mission, settings.viewMode, settings.side)`。新しい画面は `view` を読む。
- 旧タブのファイル（`src/components/*Tab.tsx`、`PrintView.tsx`）は `mission`（原本）を受け取り、自分で `applyViewMode` する。これは従来どおり。

---

## 4. 状態のフック（凍結）

### 4.1 `useMission()`（`src/shell/MissionContext.tsx`）

```ts
interface MissionContextValue {
  mission: MissionData;      // 正規化済みの原本（作成者の全データ）
  view: MissionData;         // applyViewMode 済み（新しい画面はこれを読む）
  settings: DisplaySettings;
  side: Side;                // 表示勢力（settings.side か既定）
  viewMode: 'creator' | 'pilot';
  notes: UserNotes;
  setNotes: (notes: UserNotes) => void;
  whiteboard: ReturnType<typeof useWhiteboard>; // data, persistenceStatus, canUndo, setNotes, addStroke, undoStroke, clearDrawing, replaceData
  sourceFile: File | null;
  storageFailed: boolean;    // 記入の保存が失敗している（F11 の表示に使う）
  revisions: [LoadedRevision, LoadedRevision] | null;
  closeRevisions: () => void;
}
```
ミッションが無いとき（初回画面）は使えない。`MissionProvider` は `mission` があるときだけマウントされる。

### 4.2 `useWorkspace()`（`src/shell/workspace.ts`）

```ts
interface WorkspaceValue {
  screen: ScreenId;
  setScreen: (screen: ScreenId) => void;   // 出力に入るとき印刷地図を「準備中」に戻す
  flightKey: string | null;                 // flightKey() の値
  setFlightKey: (key: string | null) => void;
  mapUi: MapUi;                             // { layers: Record<string, boolean>; tool: 'move'|'pin'|'line'; color: string }
  setMapUi: Dispatch<SetStateAction<MapUi>>;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  printMapState: 'loading' | 'ready' | 'error';
  reportPrintMapState: (state) => void;
}
```
- `DEFAULT_MAP_UI`: `{ layers: { flights, support, threats, zones, drawings: true }, tool: 'move', color: '#1f5fbf' }`。
- 挙動: 2 つ目のファイルを読むと `revision` 画面へ移る。作成者ビューからパイロットに切り替えると `threats` は `overview` へ移る。

### 4.3 `useUnits()`（`src/shell/units.ts`）

```ts
interface Units {
  alt(meters): string;  speed(metersPerSecond): string;  distance(meters): string;
  pressure(qnh: PressureValues): string;  temp(celsius): string;
  coord(latlon: [number, number], aircraftType?: string | null): string;
  time(elapsedSeconds): string;   // timeDisplay に従う（現地・Z・両方）
  wind(directionTo): string;      // windDisplay に従う（吹いてくる・吹いていく・両方）
}
```
表示のみ。値の換算は正規化層が担う（既存の方針）。

---

## 5. シェルの枠（P0 所有。後続は変更しない）

| ファイル | 役割 |
|---|---|
| `src/App.tsx` | 読み込み（既存のまま）。`AppShell` に状態を渡す。ファイル入力（`#file-input`）、読み込みの帯とオーバーレイ、ドロップ。 |
| `src/shell/AppShell.tsx` | ヘッダ（陣営・表示の切替、ファイル ▾、ブリーフィング開始、表示設定）。左レールと下部タブの配置。印刷文書と印刷ガード（出力画面でのみ文書をマウント）。ミッション未読込の初回画面でも表示設定（言語・テーマ）を開ける。 |
| `src/shell/WorkspaceNav.tsx` | 左レールの 8 項目（脅威はパイロットで出さない）。 |
| `src/shell/FlightRail.tsx` | 左レールのフライト一覧の枠（検索、件数、行は `FlightRow`、相手陣営は折りたたみ）。P1 は行の中身を変えてよいが、検索・件数・行の操作（フライトを選ぶ → 「フライト」画面へ）は残す。 |
| `src/shell/BottomTabs.tsx` | 1280px 未満の下部タブ（概要・フライト・地図・通信・その他）。 |
| `src/shell/screens.tsx` | `ScreenId` → 遅延読み込みの画面。`ScreenHost`。 |
| `src/shell/MissionContext.tsx` / `workspace.ts` / `units.ts` | 上の 4.1〜4.3 のフック。 |
| `src/shell/SideMark.tsx` | `<SideMark side="blue" \| "red" \| "neutral" showLabel? />`（四角・ひし形・丸、文字を必ず付ける）。 |
| `src/shell/Unresolved.tsx` | `<Unresolved xy? />`（`[0, 0]` は描かない。DCS の座標を併記）。 |
| `src/shell/Notice.tsx` | `<Notice tone="info" \| "warning" \| "error" \| "success" title?>children</Notice>`（記号 i、▲、×、✓ と文字）。 |
| `src/shell/EmptyState.tsx` | `<EmptyState title body? action? />`。 |
| `src/shell/Segmented.tsx` | `<Segmented label options value onChange className? />`（`aria-pressed`）。 |
| `src/shell/Field.tsx` | `<Field label hint? disabledReason?>{(id) => control}</Field>`（ラベルは上、無効の理由は下）。 |

### 5.1 画面の表示規則（凍結）

- 作成者ビュー以外では、脅威の項目も脅威画面も出さない（D1）。
- 印刷: 出力画面（`screen === 'export'`）でのみ `PrintView` をマウントする。ガードは `AppShell` の `PrintHost`。`@media print` で枠を隠す（`src/styles/shell.css`）。

---

## 6. 画面とスタブの一覧（凍結: ファイル、default export、props、担当）

「スタブ」は、旧タブに props を渡すだけの描画。担当パッケージが中身を置き換える（ファイル先頭に契約コメントあり）。

| 画面（ScreenId） | ファイル | 担当 | 旧タブ（統合時に削除） | 備考 |
|---|---|---|---|---|
| overview | `src/screens/OverviewScreen.tsx` | P4 | `OverviewTab.tsx` | `{mission, settings}` |
| flights | `src/screens/FlightScreen.tsx` | P1 | `FlightsTab.tsx` | `{mission, settings, onNotesChange}` |
| map | `src/screens/MapScreen.tsx` | P2 | `MapTab.tsx` | `{mission, settings, onNotesChange}` |
| comms | `src/screens/CommsScreen.tsx` | P5 | `CommsTab.tsx` | `{mission, settings}` |
| support | `src/screens/SupportScreen.tsx` | P5 | `SupportTab.tsx` | `{mission, settings}` |
| threats | `src/screens/ThreatsScreen.tsx` | P5 | `ThreatsTab.tsx` | パイロットでは空状態 |
| notes | `src/screens/NotesScreen.tsx` | P6 | `NotesTab.tsx`、`WhiteboardTab.tsx` | 白板は `useMission().whiteboard` |
| export | `src/screens/ExportScreen.tsx` | P3 | `ExportTab.tsx`、`PrintView.tsx`、`BriefingPlanner.tsx` | 節の選択は `useSettings()`。印刷地図は `useWorkspace().printMapState` |
| briefing | `src/screens/BriefingMode.tsx` | P4 | なし（準備中） | 全画面の口頭ブリーフィング（F8） |
| revision | `src/screens/RevisionScreen.tsx` | P6 | `RevisionComparison.tsx`（維持） | `revisions` が無いとき空状態。P0 が `RevisionComparison` に `side` prop を足した（表示勢力。パイロットの D1 のため。P6 は渡し続けること） |
| initial | `src/screens/InitialScreen.tsx` | P6 | なし | props 下記 |
| （ヘッダ） | `src/shell/FileMenu.tsx` | P6 | なし | props 下記 |
| （ドロワー） | `src/shell/SettingsDrawer.tsx` | P8 | なし | props 下記（現状は言語・テーマ・文字の大きさ・既定に戻す） |
| （行） | `src/screens/flight/FlightRow.tsx` | P1 | なし | props 下記 |
| （カード） | `src/screens/flight/LineupCard.tsx` | P7 | なし | props 下記 |
| （カード） | `src/screens/flight/WingmanCard.tsx` | P7 | なし | props 下記 |
| （関数） | `src/analysis/lint.ts` | P5 | なし | `lintMission(mission: MissionData): LintFinding[]`（名前付き export）。呼び出し側は `useMission().view` を渡す。error → warning → info の順 |
| （部品） | `src/map/MapPanel.tsx` | P2 | `MapTab.tsx` | `MapPanel(props: MapPanelProps)`（名前付き export）。P1（1600px 以上の右ペイン）と P4（readOnly）が使う |

### 6.1 凍結する props

```ts
// src/screens/InitialScreen.tsx（P6）
interface InitialScreenProps { loading: boolean; isDragging: boolean; onPickFiles: () => void; }

// src/shell/FileMenu.tsx（P6）
interface FileMenuProps { hasMission: boolean; onOpen: () => void; onCompare: () => void; onClose: () => void; }
//   P0 の暫定: onCompare は onOpen と同じ（ファイル選択を開く）。P6 が「旧版を選ぶ」フローにする。

// src/shell/SettingsDrawer.tsx（P8）
interface SettingsDrawerProps { open: boolean; onClose: () => void; }
//   右ドロワー 360px、狭い幅は下部シート。Esc と閉じるボタンで onClose。フォーカスは AppShell が
//   #shell-settings-trigger に戻す（P8 はこの id を変えない）。

// src/screens/flight/FlightRow.tsx（P1）
interface FlightRowProps { flight: Flight; side: Side; selected: boolean; onSelect: () => void; }

// src/screens/flight/LineupCard.tsx（P7）
interface LineupCardProps { flight: Flight; unit: Unit; }

// src/screens/flight/WingmanCard.tsx（P7）
interface WingmanCardProps { flight: Flight; }

// src/types/screen.ts（P0 が型を置く）
interface MapPanelProps { readOnly?: boolean; height?: string; }   // P2 の src/map/MapPanel.tsx は、この props を受ける
```

### 6.2 画面の共通規則

- すべての画面は `default export` で props を取らない（lazy）。`ThreatsScreen` は内部でパイロットを判定する。
- 旧タブのコンポーネントは `mission`（原本）と `settings` を受ける。`applyViewMode(mission, settings.viewMode, settings.side)` を内部で使う。

---

## 7. i18n（凍結）

### 7.1 名前空間ファイル

`src/i18n/locales/{ja,en}/<namespace>.json`。`src/i18n/index.ts` が `import.meta.glob` で読み込み、名前空間ごとに登録する。

名前空間（`NAMESPACES`）: `legacy`、`shell`、`flight`、`map`、`export`、`briefing`、`comms`、`support`、`threats`、`notes`、`revision`、`wingman`、`settings`、`issues`、`lint`、`overview`、`initial`、`common`。

- `legacy`（defaultNS）: 旧タブの既存キーをすべて保持する（例 `overview.sortie`、`app.dropFile`）。統合時に削除する。
- `shell`: P0 の枠の文言。`issues`: 警告の文言（code 名のキー）。`initial`: 初回画面の文言（`dropZone`、`dropFile`、`dropHint`、`point1`〜`point3`、`compareHint`）。
- 他の名前空間は `{}`（P1〜P8 が中身を足す）。
- ja と en は名前空間ごとにキー集合が一致しなければならない（`src/i18n/i18n.test.ts`）。

### 7.2 `shell` のキー（SPEC §1.4 からの対応）

| SPEC のキー | 実際のキー | 備考 |
|---|---|---|
| `shell.file` / `shell.file.open` / `.compare` / `.close` | `shell:file.label` / `file.open` / `file.compare` / `file.close` | SPEC の `shell.file` は文字列とオブジェクトが衝突するため `file.label` に改めた |
| `shell.side`、`shell.side.blue` / `red` | `shell:header.side`、`shell:side.blue` / `side.red` / `side.neutral` | |
| `shell.view`、`shell.view.creator` / `pilot` / `hint` | `shell:header.view`、`shell:view.creator` / `view.pilot`、`shell:header.viewHint` | |
| `shell.briefing.start` | `shell:header.start` | |
| `shell.settings` | `shell:header.settings` | |
| `shell.more` | `shell:nav.more` | |
| `nav.<id>` | `shell:nav.<id>` | `overview`、`flights`、`map`、`comms`、`support`、`threats`、`notes`、`export`、`briefing`、`revision`、`initial` |

その他: `shell:rail.*`（左レール）、`shell:settings.*`（ドロワー）、`shell:units.time.*` / `shell:units.wind.*`（時刻・風の表示）、`shell:stub.*`、`shell:screens.*`（空状態の文言）、`shell:notice.*`、`shell:unresolved.*`、`shell:bottom.sheetTitle`、`shell:app.name`。

### 7.3 `issues` の規則

- キーは `code` をそのまま使う（例 `issues:threat.rangeUnrecorded`、`issues:map.unsupported`）。
- 新しい code を足すときは、`IssueCode`、`ISSUE_SEVERITY`、`issues.json`（ja と en）を一緒に変える。

---

## 8. CSS（凍結）

| ファイル | 担当 | 中身 |
|---|---|---|
| `src/index.css` | 統合時に削除（SPEC 8） | 旧タブの見た目。`:root` は明色、`[data-theme="ffs"]` は暗色。 |
| `src/styles/index.css` | P0（import のみ） | `main.tsx` が `src/index.css` の後に読む。 |
| `src/styles/tokens.css` | P0 | トークン。`:root` と `[data-theme="ffs"]`（既定、暗色）、`[data-theme="standard"]`（明色、青 1 色）、`[data-theme="night"]`（赤一色）。旧変数（`--color-*`）はトークンの別名として上書きする。`html[data-font-scale="large"]` で 112%。 |
| `src/styles/shell.css` | P0 | 枠（ヘッダ、左レール 1280px 以上、下部タブ、ドロワー、印刷の枠の非表示）と共通部品。 |
| `src/styles/overview.css` | P4 | |
| `src/styles/flight.css` | P1 | |
| `src/styles/lineup.css` | P7 | |
| `src/styles/map.css` | P2 | |
| `src/styles/export.css` | P3 | |
| `src/styles/print.css` | P3 | 印刷文書のスタイル。 |
| `src/styles/briefing.css` | P4 | |
| `src/styles/comms.css` | P5 | |
| `src/styles/notes.css` | P6 | |
| `src/styles/settings.css` | P8 | |
| `src/styles/initial.css` | P6 | |

- トークン名（凍結）: `--surface-0`、`--surface-1`、`--surface-2`、`--text`、`--text-muted`、`--border`、`--accent`、`--accent-text`、`--primary-bg`、`--primary-text`、状態は `--info-*`、`--success-*`、`--warning-*`、`--danger-*`（各 `-text`、`-bg`、`-border`）。`--radius`、`--fs-body`、`--fs-table`、`--fs-note`、`--target-desktop`（28px）、`--target-touch`（44px）、`--focus-ring`。
- テーマの値は SPEC §4.2 のとおり。例外: 夜間赤の `--text-muted` は `#c0453c` だと黒地で 4.16:1 のため `#d4574b`（5.26:1）に上げた。`src/themeContrast.test.ts` が全テーマの組み合わせを検査する。

---

## 9. テスト（P0 で追加・更新）

- `src/utils/viewMode.test.ts`: D1（相手陣営を出さない、飛行場、bullseye）、G11（hidden）、D2（既定の陣営）。
- `src/hooks/useSettings.test.ts`: v1〜v5 の移行、新フィールドの既定、不正値のフィールド単位の既定化、round-trip。
- `src/i18n/i18n.test.ts`: 名前空間の一致（ディスク上の locale ファイルと `NAMESPACES`、ja と en のキー集合）、`ns:` 付きキーの静的検査、言語の読み取り（版 1〜5）。
- `src/shell/__tests__/AppShell.test.tsx`: 表示切替（脅威の項目はパイロットで出ない、切り替えると出入りする）、左レールの全 8 画面（`NAV_SCREENS`、出力を含む）と「ブリーフィング開始」からの描画。改版の画面は、2 つの版が読み込まれていないと届かないため対象外。
- `src/utils/viewMode.test.ts`、`src/core/issues.test.ts`、`src/core/MissionNormalizer.test.ts`: issue の `side`、red パイロットでの地図の共有データ、`magvar.unsupported`。
- `src/core/issues.test.ts`: severity、重複除去、正規化の issue。
- `src/utils/magvar.test.ts`: 表が無い地図は `null`。
- `src/utils/coordinates.test.ts`: `resolveCoordinateFormat`。
- `src/utils/flightKey.test.ts`、`src/utils/kneeboard.test.ts`（パイロットの D1）。
- `src/workers/missionParser.test.ts`: 101 エントリの ZIP を受け入れる。合計サイズの上限は据え置き。
- `src/themeContrast.test.ts`: トークンの全テーマの組み合わせ（4.5:1）。
- `src/shell/__tests__/parts.test.tsx`: `Notice`、`SideMark`、`Segmented`、`Unresolved`、`Field`、`EmptyState` の描画。
- `src/App.test.tsx`: 旧タブのモックを画面単位に変更。読み込み・改版の回帰は維持。
- `src/utils/missionRevision.test.ts`: 改版比較のパイロットは表示勢力のフライトだけを比べる（D1）。
- `src/components/PrintView.test.tsx`: 印刷文書の警告節は、パイロットで相手陣営の issue を出さない（D1）。

---

## 10. 既知の制限と未確認（報告に必ず書く）

- **FIWOS M2 FINAL.miz**: エントリ数の上限（101 > 100）に加え、`l10n/DEFAULT/Flightplan.jpg`（5,386,369 バイト）が個別画像の上限（5 MiB）を超えていた。Lead が `MAX_IMAGE_SIZE` を 10 MiB（`MAX_ENTRY_SIZE` と同じ）に上げた。合計サイズと圧縮比の上限は据え置き。
- **FIWOS の hidden 検査（G11、実データ）**: 元の FIWOS には `hidden = true` の group が 498 件ある。`Flightplan.jpg` だけを同じ名前の 160 バイトの代替画像に差し替えた複製（リポジトリ外の一時フォルダ）で `realMiz.test.ts` を走らせた。隠し要素は 505 件、creator の件数 1473、pilot の件数 701。両陣営について、pilot に隠し要素が 0 件、表示勢力の非隠し要素の件数が一致、反対陣営のフライトが 0 件、を確かめて通った。代替画像で検査したため、元の画像を含む読み込みは未確認。複製はリポジトリに入れていない。
- **drawings の hidden（実データ）**: 同梱の .miz（27 件）の `drawings` 節には `hidden` のキーが無い（group 側にだけある）。このため `viewMode.ts` の図形の hidden 除去は実データで何もしない。型 `Drawing` に hidden が無いのも同じ理由。将来の DCS 形式で付く場合に備えて残す。
- **zones と drawings の D1（Lead 決定、利用者が覆せる）**: §3 のとおり F10 マップの見え方に合わせた。パイロットの地図・出力にトリガーゾーンは出ない。
- **改版比較の D1（P0 で修正）**: パイロットでは相手陣営と中立のフライトを比べない（§3 の `compareMissionRevisions`）。単体テストで確認した。改版画面の描画と操作は未確認。
- **発生しない issue**: `airbase.nameMissing`、`coord.unresolved` は P0 では発生させていない（§2.1）。`weather.qnhDefaulted` と `weather.temperatureDefaulted` は、mission に値が無く既定値（760 mmHg、0 ℃）で補ったときに出す（Lead が追加）。
- **smoke の既存の失敗**: CaucasusConquest.miz（theatre が空、UTC 表に無い）は基準から変わらない。実データのテストは `SMOKE_MIZ_DIR` が無いとスキップされる（`npm run check` では走らない）。
- jsdom で AppShell を描画すると、出力画面の地図（`MissionMapCanvas`）が `HTMLCanvasElement.prototype.getContext` の未実装の警告を出す。テストは通る（jsdom の制限で、ブラウザの問題ではない）。
- smoke の既存の失敗 1 件（CaucasusConquest.miz: theatre が空で UTC 表に無い）は、基準（origin/master）から変わらず残っている。
- `parse.unknownNode` の issue は、パーサの sink で収集する仕組みのみ。実ファイルで発生させる試験は未実施。
- 旧タブの色は旧変数のまま（トークンの別名で追従するが、個別の色は統合時に置き換える）。
- 描画・操作の確認（タブレット・スマホ幅、印刷の Ctrl+P、キーボード操作）は未実施。Lead が行う。
- `formatCoordinate` は機種を知らないため、`'aircraft'` は DDM になる。P1 と P3 で機種を渡すこと（§3）。
- 敵の bullseye は `latlonResolved: false` の `[0, 0]` で渡される。P4 は必ず `latlonResolved` を確かめ、`[0, 0]` を描かないこと。
- `FileMenu` の「改版を比べる」は P0 では「開く」と同じ。P6 が差し替える。
- SettingsDrawer は P0 の暫定（言語・テーマ・文字の大きさ・既定に戻す）。P8 が F1 の全項目を置く。
- 名前の衝突を避けるため、旧ファイル（`MissionView.tsx`）は削除済み。`src/components/*Tab.tsx` などの旧タブは残している（統合時に削除）。
- 旧 `src/index.css` の `.header-controls` 等の旧ヘッダ規則は未使用になった（統合時に削除）。統合時にこの規則を消すと、`src/themeContrast.test.ts` の旧検査 'header selector contrast keeps explicit selector and option colors...'（旧 `.header-controls select option` の検査）も消える。その代わりにトークンの組み合わせ検査（4.5:1）が入っている。
- TACAN と ICLS は `[0, 0]` を入れない（`latlon` は未解決で `undefined`）。NavPoint、Airbase、Runway、支援機、AI 群などは、P0 の時点でまだ `[0, 0]` の既定を入れている。描画は必ず `latlonResolved` で判定し、未解決は `Unresolved` で出す（旧タブの `|| [0, 0]` は統合時に消す）。
- ME 図形のレイヤーは DCS の固定 5 種（Red、Blue、Neutral、Common、Author）を前提に絞る。Red・Blue レイヤーに図形がある実データでの確認は未実施（同梱 .miz では Red レイヤーは 0 件）。
- 出力の磁方位（`magvar.unsupported`）の severity（warning）は、SPEC に記載が無いため P0 が決めた値。
- `BriefingSectionId` は旧定義（8 項目、`whiteboard` を含む）のまま。P3 が SPEC §6.2 の 9 項目へ更新する。
