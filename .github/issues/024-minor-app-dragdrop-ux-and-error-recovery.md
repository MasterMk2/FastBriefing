# [P2] App: ドラッグ&ドロップの UX 不備 / エラー後のリカバリ手段なし / 設定変更時の再正規化なし

**Labels:** `enhancement`, `P2-medium`, `ui`, `ux`
**Milestone:** Phase 1

## 概要
`src/App.tsx` のファイル入力周りに複数の UX 不備がある:
1. ドロップ時に全画面で `onDragOver/onDrop` をリッスンしていないため、ドロップゾーン外に落とすとブラウザが `.miz` を直接開いて画面が遷移する
2. エラー表示後に再選択しても `error` がクリアされないケース（`handleFileSelect` で `file` が null のとき）
3. `settings` 変更（例: 座標形式を DDM->MGRS に切替）しても `missionData` の `normalizeMission` が再実行されず、表示が切り替わらない（`viewMode` 等は `normalizeMission` の引数だが、結果は `useState` にキャッシュされたまま）
4. ローディング中に再度ドロップすると `MissionParser` の Worker が二重生成される（`cancel()` が呼ばれない）

## 該当箇所
```tsx
// src/App.tsx:14-39
const handleFileDrop = useCallback(async (file: File) => {
  if (!file.name.endsWith('.miz')) { setError('Please select a .miz file'); return; }
  setLoading(true);
  setError(null);
  try {
    const parser = new MissionParser();
    const parsed = await parser.parse(file);
    const normalized = normalizeMission(parsed, { coordinateFormat: settings.coordinateFormat, ... });
    setMissionData(normalized);
  } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  finally { setLoading(false); }
}, [settings]); // settings 全体が deps → settings の一部変更でも handleFileDrop が再生成されるが、missionData は再正規化されない

// src/App.tsx:41-51
const handleDragOver = useCallback((e: React.DragEvent) => {
  e.preventDefault(); // drop-zone 内のみ。window レベルで preventDefault しないと、ブラウザがファイルを開く
}, []);

// エラー後のリセット手段がない - missionData が null でないと drop-zone が表示されないため、エラー後に再試行するにはリロードが必要
{!missionData ? (<div className="drop-zone">...</div>) : (<MissionView ... />)}
// missionData がセットされた後にエラーが出ても、drop-zone に戻る手段が無い（「別のファイルを開く」ボタンなし）
```

## 修正案
1. `window` レベルで `dragover/drop` を `useEffect` で登録し、`e.preventDefault()` でブラウザ遷移を防止。ドロップゾーン外でも視覚的フィードバック（`dragging` state）を出す

2. エラー後のリカバリ:
   ```tsx
   {error && <button onClick={() => setError(null)}>再試行</button>}
   {missionData && <button onClick={() => setMissionData(null)}>別の .miz を開く</button>}
   ```

3. 設定変更時の再正規化:
   ```ts
   const [parsedRaw, setParsedRaw] = useState<ParsedMissionFile | null>(null);
   useEffect(() => {
     if (parsedRaw) setMissionData(normalizeMission(parsedRaw, settings));
   }, [parsedRaw, settings]);
   ```
   または `normalizeMission` を純粋な表示時変換にし、`MissionData` は生データを保持する

4. `MissionParser` の `cancel()` を `useRef` で保持し、`handleFileDrop` 開始時に前回の Worker を terminate:
   ```ts
   const parserRef = useRef<MissionParser | null>(null);
   parserRef.current?.cancel();
   parserRef.current = new MissionParser();
   ```

5. ファイル検証: 拡張子だけでなく `file.type` / `file.size`（Issue #004）と ZIP マジックナンバ（`PK\x03\x04`）も確認

## 影響
- ドロップミスでブラウザが `.miz` を開き、アプリ状態が失われる（データ損失は無いが UX が悪い）
- 設定切替が反映されないため、ユーザーは「MGRS に切り替えたのに表示が変わらない」と誤解する

## 検証
- ドロップゾーン外にファイルをドラッグしたときにブラウザ遷移しないことを手動テスト
- 設定切替後に `FlightsTab` の座標表示が即時変わることを `vitest` で確認
- エラー表示後に「別のファイルを開く」で復帰できる E2E テスト
