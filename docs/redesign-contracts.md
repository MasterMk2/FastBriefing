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
  `settings`、`setCoordinateFormat`、`setUnitSystem`、`setAltitudeUnit`、`setSpeedUnit`、`setDistanceUnit`、`setPressureUnit`、`setTemperatureUnit`、`setViewMode`、`setSide(side | null)`、`setLanguage`、`setOutputLanguage`、`setTheme`、`setFontScale`、`setWindDisplay`、`setTimeDisplay`、`setMapBackground`、`setKneeboardWidth`、`setBriefingSections`、`setBriefingPresets`、`resetDisplaySettings()`（既定に戻す。出力の節の順序とプリセットは残す）。
- 同じイベント内で複数の setter を呼んでも値は消えない（最新値を ref で持つ）。

### 2.3 その他の型（凍結）

- `src/types/screen.ts`: `ScreenId = 'overview' | 'flights' | 'map' | 'comms' | 'support' | 'threats' | 'notes' | 'export' | 'briefing' | 'revision' | 'initial'`、`NAV_SCREENS`、`CREATOR_ONLY_SCREENS`。
- `src/types/lint.ts`: `LintFinding { id, code, severity, side: 'blue'|'red'|'neutral', screen: ScreenId, anchor?, flightKey?, params }`（P5 が規則を実装）。
- `src/export/exportPlan.ts`: `ExportScope`、`ExportPlan`（型のみ。P3 が実装）。
- `src/utils/flightKey.ts`: `flightKey(side, groupId): string`（= `${side}:${groupId}`）。`side` は `FlightKeySide = 'blue' | 'red' | 'neutral'`。注記の key（`neutral:<groupId>` を含む）と同じ形。`parseFlightKey(key)` は `{ side, groupId }` を返し、空や不正な文字列は `null`（P0 統合で追加、Lead 決定 3）。
- `src/types/screen.ts`: `MapPanelProps` に任意の `focusFlightKey?: string | null` を足した（Lead 決定 4）。null または未指定は全機を表示する。

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
| `loadNoticeEntries` / `defaultsListEntries` / `handoutIssueEntries(issues, viewMode)` | `src/core/issues.ts` | issue の一覧の唯一の判定（Lead 決定）。概要画面（読み込みの注意・既定値を使った項目）と出力（印刷・PNG・Markdown の配布前の警告・既定値を使った項目）が同じ関数を使う。誰向けかは `ISSUE_AUDIENCE`: `notice`（地図・時刻・磁方位・解析）と `defaulted`（QNH・気温・雲・飛行場名・座標の補完）はパイロットにも出す。`creatorOnly`（`weapon.unknownClsid`・`unit.unknownType`・`threat.*`）は作成者だけ。重複は code と params が同じものを 1 行にし、陣営の無い issue は同じ陣営の写しを吸収して印なし、青と赤の写しは陣営ごとに印付きで残す。作成者の出力は両方の一覧をまとめて警告に出す。QNH と気温の値は既定値で補ったとき「（既定値）」の印を付ける（概要と出力）。 |
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
  setScreen: (screen: ScreenId) => void;      // 画面を移す。focusAnchor を消す。移る前の画面を previousScreen にする（同じ画面への移動では変えない）
  previousScreen: ScreenId | null;             // 直前の画面。口頭ブリーフィングの終了で戻る先（P4）
  jumpTo: (screen: ScreenId, options?: { flightKey?: string; anchor?: string }) => void;
  focusAnchor: string | null;                  // 受け側の画面が読み、該当の行へスクロール・選択・フォーカスしたあと clearFocusAnchor() を呼ぶ
  clearFocusAnchor: () => void;
  flightKey: string | null;                    // 選んだフライト（flightKey() の値）。null は「選ばない」
  setFlightKey: (key: string | null) => void;
  routeFocus: { flightKey: string; routeIndex: number } | null;  // 経路表で選んだ点。地図はその点を強調する（視点の再 fit はしない。画面外なら panTo だけ）
  setRouteFocus: (focus: RouteFocus | null) => void;
  mapUi: MapUi;                                // { layers, tool, color, soloFlightKey }
  setMapUi: Dispatch<SetStateAction<MapUi>>;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}
```
- `DEFAULT_MAP_UI`: `{ layers: { flights, support, threats, zones, drawings: true }, tool: 'move', color: '#1f5fbf', soloFlightKey: null }`。
- 既定の選択（T7、Lead 決定 3）: 未選択のときは、自機（`wingmanSlot`。`missionKey` がこのミッションと一致し、フライトが view に実在するもの）→ なければ表示中の自陣営の先頭（`view.coalitions[side].flights[0]`）→ なければ `null`。フライト画面を開いた時点で何かが選ばれている。
- 選び直し: 選んだフライトが view に無くなったとき（陣営・表示モードの変更）は、同じ規則で選び直す。`setFlightKey(null)`（フライト画面の「選択なし」）は陣営が変わっても残る。
- `soloFlightKey` と `routeFocus` は、そのフライトが view に無くなったら `null` に戻す（D1）。
- `jumpTo` で `flightKey` を省くと選択は変えない。`anchor` を省くと `focusAnchor` は `null`。
- 挙動: 2 つ目のファイルを読むと `revision` 画面へ移る。パイロットに切り替えると `threats` は `overview` へ移る。
- `printMapState` と `reportPrintMapState` は削除した（Lead 決定 3）。`src/utils/printReadiness.ts` とそのテストも削除した。

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
| `src/shell/AppShell.tsx` | ヘッダ（陣営・表示の切替、ファイル ▾、ブリーフィング開始、表示設定）。左レールと下部タブの配置。口頭ブリーフィング（`briefing`）の間は、ヘッダ・レール・main・下部タブに `inert` を付け、ブリーフィングは外側の全画面層（`.shell-briefing-layer`、位置指定はインラインのスタイル）に描く。`onCompare`（任意の props、未指定は何もしない）を ファイル ▾ と「その他」の「改版を比べる」に通す。ミッション未読込の初回画面でも表示設定（言語・テーマ）を開ける。 |
| `src/export/PrintHost.tsx` | 印刷文書の常時マウント（`print-briefing`、画面では隠す）。P0 が `AppShell` から移した（挙動は変えない）。以後は Export 系統が変更する。 |
| `src/shell/WorkspaceNav.tsx` | 左レールの 8 項目（脅威はパイロットで出さない）。 |
| `src/shell/FlightRail.tsx` | 左レールのフライト一覧の枠（検索、件数、行は `FlightRow`、相手陣営は折りたたみ）。P1 は行の中身を変えてよいが、検索・件数・行の操作（フライトを選ぶ → 「フライト」画面へ）は残す。 |
| `src/shell/BottomTabs.tsx` | 1280px 未満の下部タブ（概要・フライト・地図・通信・その他）。「その他」は支援機、脅威（作成者のみ）、記入、出力、表示設定、開く、改版を比べる、閉じる。改版の画面には項目が無く、改版の操作から入る。 |
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
- 印刷: 印刷文書（`src/export/PrintHost.tsx`）は画面によらず常時マウントし、画面では隠す（`print-briefing`）。地図の描画を始める時点は Export 系統が決める（Lead 決定 7）。`@media print` で枠を隠す（`src/styles/shell.css`）。

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
| （関数） | `src/analysis/lint.ts` | P5 | なし | 概要の配布前チェックは `lintMissionForSide(view, side, viewMode)` を使う（名前付き export。`view` は `useMission().view`、`side` は `useMission().side`、`viewMode` は `useMission().viewMode`）。パイロット表示では脅威の項目（screen が threats のもの）を出さない（Lead 決定 2）。`lintMission(mission)` は残す。error → warning → info の順 |
| （部品） | `src/map/MapPanel.tsx` | P2 | `MapTab.tsx` | `MapPanel(props: MapPanelProps)`（名前付き export）。P1（1600px 以上の右ペイン）と P4（readOnly）が使う |

### 6.1 凍結する props

```ts
// src/screens/InitialScreen.tsx（P6）
interface InitialScreenProps { loading: boolean; isDragging: boolean; onPickFiles: () => void; error?: string | null; onRetry?: () => void; }
//   統合で追加: error は最初の読み込みの失敗（翻訳済み）。落とす場所の下に role="alert" で出し、再試行ボタン（`initial:retry`）は onRetry（既定は onPickFiles）を呼ぶ。
//   App はミッションが無いときだけ渡す（`AppShellProps.initialError`、`onRetryInitial`）。ミッションがあるときの失敗は `.app-error` の帯に出し、二重に出さない。

// src/shell/FileMenu.tsx（P6）
interface FileMenuProps { hasMission: boolean; onOpen: () => void; onCompare: () => void; onClose: () => void; }
//   P0 の変更: onCompare は App.tsx の比較用 input（`#compare-file-input`）を開く。通常のファイル選択（onOpen）は呼ばない。旧版を選ぶ流れは P6 が担当する。

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
- 旧タブ（`src/components/*Tab.tsx`、`PrintView`、`BriefingPlanner`、`MissionMapCanvas`）は統合で削除した。残る旧部品は `RevisionComparison`、`RevisionMap`、`WaypointAnnotationEditor`（経路表が使う）、`WhiteboardDrawing`（印刷文書と白板が使う）。

---

## 7. i18n（凍結）

### 7.1 名前空間ファイル

`src/i18n/locales/{ja,en}/<namespace>.json`。`src/i18n/index.ts` が `import.meta.glob` で読み込み、名前空間ごとに登録する。

名前空間（`NAMESPACES`）: `shell`、`flight`、`map`、`export`、`briefing`、`comms`、`support`、`threats`、`notes`、`revision`、`wingman`、`settings`、`issues`、`lint`、`overview`、`initial`、`common`。

- `legacy` は統合で削除した。まだ使うキーは移した: `app.*` → `shell:app.*`（ファイルの選択と読み込みの失敗、読み込み中、画面の読み込み中）、`waypoints.*` → `flight:waypoints.*`、`revision.*` → `revision:*`。defaultNS は中身の無い `common` にし、名前空間の無いキー（例 `app.retry`）は解決せずキーのまま出る。`src/i18n/i18n.test.ts` が、名前空間の無い `t()` のキーを静的検査で欠落として数える。
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

その他: `shell:rail.*`（左レール）、`shell:units.time.*` / `shell:units.wind.*`（時刻・風の表示）、`shell:stub.*`、`shell:screens.*`（空状態の文言）、`shell:notice.*`、`shell:unresolved.*`、`shell:bottom.sheetTitle`、`shell:app.name`。`shell:settings.*` は P0 統合で削除した（設定ドロワーは `settings` 名前空間を使う）。

### 7.3 `issues` の規則

- キーは `code` をそのまま使う（例 `issues:threat.rangeUnrecorded`、`issues:map.unsupported`）。
- 新しい code を足すときは、`IssueCode`、`ISSUE_SEVERITY`、`issues.json`（ja と en）を一緒に変える。

---

## 8. CSS（凍結）

| ファイル | 担当 | 中身 |
|---|---|---|
| `src/styles/index.css` | P0（import のみ） | `main.tsx` が読む唯一の入口。tokens → common → shell → 各パッケージの順。旧 `src/index.css` は統合で削除した。 |
| `src/styles/common.css` | Lead（統合） | 旧 `src/index.css` から移した土台と共通部品（`body`、`.btn` 系、`.visually-hidden`、`.hint`、`.data-table`、`.error`・`.app-error`、読み込みの重ね、ドロップの重ね、`.screen-loading`）。トークンだけを使う。 |
| `src/styles/tokens.css` | P0 | トークン。`:root` と `[data-theme="ffs"]`（既定、暗色）、`[data-theme="standard"]`（明色、青 1 色）、`[data-theme="night"]`（赤一色）。旧変数（`--color-*`）の別名は統合で削除した。`html[data-font-scale="large"]` で 112%。白板の紙と方眼（`--whiteboard-paper`、`--whiteboard-grid`）はテーマに依らない共通の `:root` に置く。 |
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
- 陣営の色 `--side-blue`、`--side-red`、`--side-neutral`（各 `-text`）と、注釈のインク `--ink-1` から `--ink-4` は全テーマに定義する（Lead 決定 5）。夜間赤のインクは明度の差で区別する。`src/shell/__tests__/tokens.test.ts` が検査する。

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
- `src/utils/flightKey.test.ts`。旧 `src/utils/kneeboard.test.ts`（パイロットの D1）は旧出力とともに削除し、D1 は `src/export/exportModel.test.ts`（pilot view）、地図背景は `src/export/kneeboardPlan.test.ts` が検査する。
- `src/workers/missionParser.test.ts`: 101 エントリの ZIP を受け入れる。合計サイズの上限は据え置き。
- `src/themeContrast.test.ts`: トークンの全テーマの組み合わせ（4.5:1）。
- `src/shell/__tests__/parts.test.tsx`: `Notice`、`SideMark`、`Segmented`、`Unresolved`、`Field`、`EmptyState` の描画。
- `src/App.test.tsx`: 旧タブのモックを画面単位に変更。読み込み・改版の回帰は維持。
- `src/utils/missionRevision.test.ts`: 改版比較のパイロットは表示勢力のフライトだけを比べる（D1）。
- 旧 `src/components/PrintView.test.tsx`（警告節の D1）は削除した。同じ検査は `src/export/exportScope.test.ts`（警告）と `src/export/printDocument.test.tsx`（白板）にある。
- 統合で追加: `src/export/outputMigration.test.ts`（旧出力の振る舞いの移植: 地図のピン、節の選択と順、白板の位置、経路点の目的とメモ、hidden の除外、地図の分割）、`src/export/printDocument.test.tsx`（ピンの一覧、白板の最大量）、`src/utils/kneeboardRenderer.test.ts`（白板の長文の分割で図を落とさない）、`src/components/RevisionMap.test.tsx`（`mapBackground`）、`src/map/MapPanel.test.tsx`（この機だけ／全機に戻すの fitBounds）、`src/screens/InitialScreen.test.tsx` と `src/App.test.tsx`（初回画面の失敗と再試行）、`src/shell/__tests__/tokens.test.ts`（白板のトークン）。
- P0 統合で追加: `src/shell/__tests__/workspace.test.tsx`（既定の選択、自機、選び直し、null の保持、neutral、`jumpTo`、`previousScreen`、`soloFlightKey`、anchor の書式）、`src/shell/__tests__/tokens.test.ts`（陣営とインクのトークン）、`src/utils/flightKey.test.ts`（neutral、`parseFlightKey`）。`src/shell/__tests__/AppShell.test.tsx` は口頭ブリーフィングの層と inert、改版を比べる（ファイル ▾ と「その他」）を検査する。`src/shell/__tests__/FileMenu.test.tsx` は onCompare が呼ばれ onOpen は呼ばれないことを検査する。

---

## 10. 既知の制限と未確認（報告に必ず書く）

- **FIWOS M2 FINAL.miz**: エントリ数の上限（101 > 100）に加え、`l10n/DEFAULT/Flightplan.jpg`（5,386,369 バイト）が個別画像の上限（5 MiB）を超えていた。Lead が `MAX_IMAGE_SIZE` を 10 MiB（`MAX_ENTRY_SIZE` と同じ）に上げた。合計サイズと圧縮比の上限は据え置き。
- **FIWOS の hidden 検査（G11、実データ）**: 元の FIWOS には `hidden = true` の group が 498 件ある。`Flightplan.jpg` だけを同じ名前の 160 バイトの代替画像に差し替えた複製（リポジトリ外の一時フォルダ）で `realMiz.test.ts` を走らせた。隠し要素は 505 件、creator の件数 1473、pilot の件数 701。両陣営について、pilot に隠し要素が 0 件、表示勢力の非隠し要素の件数が一致、反対陣営のフライトが 0 件、を確かめて通った。代替画像で検査したため、元の画像を含む読み込みは未確認。複製はリポジトリに入れていない。
- **drawings の hidden（実データ）**: 同梱の .miz（27 件）の `drawings` 節には `hidden` のキーが無い（group 側にだけある）。このため `viewMode.ts` の図形の hidden 除去は実データで何もしない。型 `Drawing` に hidden が無いのも同じ理由。将来の DCS 形式で付く場合に備えて残す。
- **zones と drawings の D1（Lead 決定、利用者が覆せる）**: §3 のとおり F10 マップの見え方に合わせた。パイロットの地図・出力にトリガーゾーンは出ない。
- **改版比較の D1（P0 で修正）**: パイロットでは相手陣営と中立のフライトを比べない（§3 の `compareMissionRevisions`）。単体テストで確認した。改版画面の描画と操作は未確認。
- **発生しない issue**: `airbase.nameMissing`、`coord.unresolved` は P0 では発生させていない（§2.1）。`weather.qnhDefaulted` と `weather.temperatureDefaulted` は、mission に値が無く既定値（760 mmHg、0 ℃）で補ったときに出す（Lead が追加）。
- **smoke の既存の失敗**: CaucasusConquest.miz（theatre が空、UTC 表に無い）は基準から変わらない。実データのテストは `SMOKE_MIZ_DIR` が無いとスキップされる（`npm run check` では走らない）。
- 旧 `MissionMapCanvas` は統合で削除した。jsdom の `getContext` 未実装の警告は、canvas を使うテスト（出力と SettingsDrawer）で出ることがある。テストは通る（jsdom の制限）。
- smoke の既存の失敗 1 件（CaucasusConquest.miz: theatre が空で UTC 表に無い）は、基準（origin/master）から変わらず残っている。
- `parse.unknownNode` の issue は、パーサの sink で収集する仕組みのみ。実ファイルで発生させる試験は未実施。
- 描画・操作の確認（タブレット・スマホ幅、印刷の Ctrl+P、キーボード操作）は未実施。Lead が行う。
- `formatCoordinate` は機種を知らないため、`'aircraft'` は DDM になる。P1 と P3 で機種を渡すこと（§3）。
- 敵の bullseye は `latlonResolved: false` の `[0, 0]` で渡される。P4 は必ず `latlonResolved` を確かめ、`[0, 0]` を描かないこと。
- `FileMenu` の「改版を比べる」は App.tsx の比較用 input を開く（旧版を選ぶ）。P0 統合で `getElementById` の検索をやめ、`onCompare` を直接呼ぶ。P6 は旧版を選ぶ流れを担当する。
- SettingsDrawer は P0 の暫定（言語・テーマ・文字の大きさ・既定に戻す）。P8 が F1 の全項目を置く。
- 名前の衝突を避けるため、旧ファイル（`MissionView.tsx`）は削除済み。`src/components/*Tab.tsx` などの旧タブと旧出力（`briefingMarkdown`、`briefingPng`、`planKneeboardPages`）も統合で削除した。
- 旧 `src/index.css` は統合で削除した（`.header-controls` などの旧ヘッダ規則と `.print-map-blocked*` を含む）。`src/themeContrast.test.ts` は tokens.css だけを読み、トークンの組み合わせ（4.5:1）を検査する。
- TACAN と ICLS は `[0, 0]` を入れない（`latlon` は未解決で `undefined`）。NavPoint、Airbase、Runway、支援機、AI 群などは、P0 の時点でまだ `[0, 0]` の既定を入れている。描画は必ず `latlonResolved` で判定し、未解決は `Unresolved` で出す（旧タブの `|| [0, 0]` は旧タブとともに消えた）。
- ME 図形のレイヤーは DCS の固定 5 種（Red、Blue、Neutral、Common、Author）を前提に絞る。Red・Blue レイヤーに図形がある実データでの確認は未実施（同梱 .miz では Red レイヤーは 0 件）。
- 出力の磁方位（`magvar.unsupported`）の severity（warning）は、SPEC に記載が無いため P0 が決めた値。
- `BriefingSectionId` は旧定義（8 項目、`whiteboard` を含む）のまま。P3 が SPEC §6.2 の 9 項目へ更新する。

- 既知の制限（P0 統合で追加）: 中立の支援機は出さない（Lead 決定 11）。SAM と未収録ユニットが同じ群のとき、群の参照範囲で判定する扱いは注記のみ（Lead 決定 11）。読み込みの段階名（展開・解析・整理）は今回入れない（Lead 決定 13）。
- 範囲外のテストの期待値（P0 統合時点で新たに失敗）: `src/map/MapPanel.test.tsx` 2 件と `src/map/MapPanel.leaflet.test.tsx` 1 件（既定の選択で地図が最初から 1 機を選ぶ。担当 P2）、`src/screens/flight/FlightScreen.test.tsx` 1 件（相手陣営のキーは自機の既定に選び直される。担当 P1）、`src/screens/OverviewScreen.test.tsx` 1 件（view に無いフライトへの「この箇所へ」。担当 P4）。書き換えは各担当が行う。
- `src/shell/SettingsDrawer.test.tsx`（担当 P8）が `getContext` の Not implemented を出す。AppShell のテストでは出ない（モック済み）。
- 口頭ブリーフィングの全画面層は、印刷（Ctrl+P）に出る可能性がある。`@media print` の確認は未実施。
- 描画・操作の確認は Lead が行う（この統合ではブラウザで確認していない）。

- 既知の制限（旧タブ削除の統合で追加）:
  - 地図のピンは、Markdown と印刷では名前とメモを、PNG のニーボードでは地図上の名前だけを出す（PNG にメモの一覧は無い）。ピンの一覧は最初の地図ページにだけ付く。対応外の地図では、文字のページに「地図のピン」の節として出す。
  - 経路点の目的とメモは、航法表の列ではなく、表の下の一覧（`export:label.notesLabel`）に出す。
  - 印刷文書では白板の長文を分割しない（ページ送りはブラウザに任せる）。PNG は図のページに 7 行、残りを続きのページに出す。
  - 白板の線の色は保存されたデータで、トークンにしない（例外）。紙と方眼は `--whiteboard-paper`、`--whiteboard-grid`（テーマに依らない）。`missionMapRaster` と `kneeboardRenderer` の canvas の紙の色（`#ffffff` など）もテーマに依らない（例外。画像として配る資料のため）。
  - `RevisionMap` の経路の色（改版前 `#b54b12`、改版後 `#167a49`）は 16 進のまま残る（Leaflet の pathOptions には var() を渡せない）。
  - 地図の注釈の線は、キーボードだけでは引けない。ピンは「この地点に置く」でキーボードから置ける。
  - 作成者表示で両陣営の任務文を並べる旧概要の振る舞いは、SPEC §1.3 の変更により移植しない。

- 既知の制限（再点検の残りの修正で追加。実装しない）:
  - 出力の航法表に、区間時間・累積距離・累積時間の列が無い。フライト画面の列の設定（決定 9 の任意列を含む）は出力に持ち込んでいない。
  - 記入画面で中立のフライトを選んでも、フライト画面は中立機の詳細を出さない（W9）。
  - 自陣営の hidden 群の経路点から作った自陣営の飛行場は、パイロット表示でも飛行場の一覧に残る（飛行場の一覧は群の経路点から作り、元の群が hidden かを持たない）。
  - 改版比較のパイロットは、applyViewMode を通した結果どうしではなく、元の値どうしを比べる（表示の既定値で「無い」と「0」の違いが消えないように）。比べる群は applyViewMode と同じ判定（`shownInPilotView`、支援機の分類は `supportKindOf`）で選ぶ。

## 11. Lead の決定 1〜13（この統合で守る）

- 決定 1（周波数の衝突、担当 P5）: 衝突とは「同じ変調で 1 kHz 以内の主周波数（`Flight.frequency`、グループの周波数）を、別々の 2 つ以上のフライトまたは支援機が使う」こと。無線のプリセット（チャンネル）どうしの一致は衝突に数えない。通信画面の衝突一覧と配布前チェック L1 は同じ定義にする。L1 は周波数ごとに 1 件、severity は warning。プリセットの表は通信画面にそのまま出す。
- 決定 2（配布前チェック、担当 P4・P5）: 概要から `lintMissionForSide(view, side, viewMode)` で呼ぶ。パイロット表示では脅威の項目（screen が threats のもの）を出さない。`LINT_RULES_READY` による「未実施」表示は、規則が入ったので取り除く（`src/screens/overviewStatus.ts` と `OverviewScreen.test.tsx` のモックは P4 が直す）。
- 決定 3（workspace の拡張、担当 Core）: §4.2 と §12 のとおり。
- 決定 4（地図の集中表示、担当 P2・P4）: `MapPanelProps.focusFlightKey`（§2.3）。口頭ブリーフィングの地図は選んだフライトに合わせる。null か未指定なら全機。
- 決定 5（陣営とインクの色、担当 Core）: §8 のとおり。
- 決定 6（設定の即時反映、担当 P2・P3・P8）: 時刻（`timeDisplay`）と風（`windDisplay`）は `useUnits()` 経由で、時刻と風を出す全画面と全出力（Markdown、印刷、ニーボード）に効かせる。`mapBackground` は地図パネルと出力の地図ラスタ（`missionMapRaster`）の両方に効かせ、false のときはタイルを取得しない。`SettingsDrawer` の CSS による橋渡しは取り除く。
- 決定 7（印刷文書の地図、担当 P3）: 地図ページの描画とタイルの取得は、出力画面を初めて開いたとき、または `beforeprint`（`matchMedia('print')` を含む）で始める。それまで地図ページは「地図は出力画面を開くか印刷を始めると準備します」を出す。印刷はブロックしない。一度描いたら、陣営・表示モード・言語・選択フライト・地図背景が変わるまで描き直さない。
- 決定 8（記入の保存が壊れているとき、担当 P6）: 記入と白板の取り込み（JSON）を無効にし、理由を出す。「退避して空から始める」は画面上のデータを消さず、退避のあと現在のデータを保存し直す。成功の文言は実際に保存できたときだけ出す。
- 決定 9（注記と経路表、担当 P1）: 注記パネルは表の下に置く（1600px 以上でも）。経路表の狭い列幅の規則は地図ペインが出ているときだけ。区間時間（`leg.time`）は列メニューの任意列とし、既定は非表示。
- 決定 10（注釈の一括消去、担当 P2）: 旧 `MapTab` の「注釈をすべて消す」（確認つき、元に戻す 1 段で戻せる）を戻す。
- 決定 11（中立の支援機と SAM）: 中立の支援機は出さない（既知の制限、§10）。SAM と未収録ユニットが同じ群のとき、群の参照範囲で判定する扱いは注記を残し既知の制限に記録する（§10）。
- 決定 12（既定に戻す）: `resetDisplaySettings` の範囲は契約のとおり。説明文で範囲を示す（担当 P8）。
- 決定 13（読み込みの段階名）: 今回は入れず、既知の制限に記録する（§10）。

## 12. Core（P0 統合）が入れた型・関数（正確な名前と書式）

- `src/utils/flightKey.ts`: `type FlightKeySide = Side | 'neutral'`、`flightKey(side: FlightKeySide, groupId: number): string`、`parseFlightKey(key): { side: FlightKeySide; groupId: number } | null`。
- `src/shell/workspace.ts`（export）: `DEFAULT_MAP_UI`、`MapUi`（`soloFlightKey: string | null` を含む）、`MapTool`、`RouteFocus { flightKey; routeIndex }`、`JumpOptions { flightKey?; anchor? }`、`WorkspaceValue`、`WorkspaceProvider`、`useWorkspace`。
- anchor の組み立て（`src/shell/workspace.ts`）: `routeAnchor(key, pointIndex)`、`supportAnchor(side, index)`、`threatsAnchor(side, index)`、`EXPORT_FLIGHT_ANCHOR = 'export:flight'`。周波数の衝突は `conflictAnchor(conflict)`（`src/analysis/frequencyConflicts.ts`）を使う。
- anchor の書式（`parseFocusAnchor(anchor): FocusTarget | null` で読む）:
  - `route:<flightKey>:<point index>`（例: `route:blue:12:3`）。flightKey がコロンを含むので、末尾の数字で分ける。
  - `support:<side>:<index>`（index は支援機の配列の位置）。
  - `threats:<side>:<index>`（index は AI グループの配列の位置。L8 の書式）。
  - `comms:conflict:<AM|FM>:<MHz を小数 3 桁>`（例: `comms:conflict:AM:251.000`）。
  - `export:flight`（フライト画面の「この資料を作る」から出力画面へ入ったとき、対象を「選んだフライト」にする）。
- `src/shell/AppShell.tsx`: `AppShellProps.onCompare?: () => void`（未指定は何もしない。App は `openComparePicker` を渡す）。
- `src/shell/FileMenu.tsx`: `COMPARE_INPUT_ID` を削除。`FileMenuProps` は契約のまま。
- `src/shell/BottomTabs.tsx`: props は `{ onOpenSettings, onOpenFiles, onCompare, onCloseMission, navRef? }`。
- `src/export/PrintHost.tsx`: default export の `PrintHost()`（props なし）。
- `src/shell/units.ts`: P0 では変更なし。時刻と風は既存の設定（`timeDisplay`、`windDisplay`）を読む。
- `src/styles/tokens.css`: `--side-blue`、`--side-blue-text`、`--side-red`、`--side-red-text`、`--side-neutral`、`--side-neutral-text`、`--ink-1`〜`--ink-4` を 3 テーマすべてに定義。

## 13. 範囲外への依頼（Lead が担当へ回す）

- P1: `FlightScreen.test.tsx` の「相手陣営のキーが残っていても相手陣営のフライトを出さない」の期待を、新しい選び直しの規則（自機の既定を選ぶ）に合わせて書き換える。フライト画面の「選択なし」は残す。
- P2: `MapPanel.tsx` が `focusFlightKey`、`routeFocus`（強調のみ、視点は動かさない）、`soloFlightKey`（「この機だけ地図に」と「全機を表示に戻す」）を扱う。`MapPanel.test.tsx` と `MapPanel.leaflet.test.tsx` の既定の選択の期待を書き換える。
- P3: `export:flight` の受け側、印刷地図の描画開始（決定 7）、`mapBackground` の出力への反映（決定 6）。
- P4: 概要の「この箇所へ」は `jumpTo` を使う。`OverviewScreen.test.tsx` の fixture（view に無いフライト）と、`LINT_RULES_READY` の取り除き（決定 2）。口頭ブリーフィングの終了は `setScreen(previousScreen ?? 'overview')` で戻る。
- P5: 周波数の衝突の定義（決定 1）、L1 の severity（warning）、lint の anchor 書式（§12 のとおり）。
- P6: 旧版を選ぶ流れ（`onCompare`）、記入の保存が壊れたときの扱い（決定 8）。
- P8: `SettingsDrawer` の `mapBackground` の CSS 橋渡しを取り除く（決定 6）。`SettingsDrawer.test.tsx` の getContext の出力。
- Lead（統合時）: 旧 `src/index.css` の `.print-map-blocked` の規則は `src/index.css` とともに削除した。口頭ブリーフィングの全画面層のインラインスタイルを `src/styles/shell.css` へ移すかは Lead が決める（shell.css はこの作業の書き込み範囲外）。
