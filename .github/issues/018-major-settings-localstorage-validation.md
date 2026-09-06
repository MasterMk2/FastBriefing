# [P2] useSettings: localStorage の JSON を無検証でマージ / 破損時の復旧とマイグレーション無し

**Labels:** `bug`, `P2-medium`, `state`
**Milestone:** Phase 1

## 概要
`src/hooks/useSettings.tsx:34-44` で `localStorage.getItem('fastbriefing-settings')` を `JSON.parse` して `DEFAULT_SETTINGS` にスプレッドマージしているが、型検証がなく、破損 JSON や旧バージョンの値（例: 旧 `coordinateFormat: 'UTM'`）がそのまま `settings` に入り、以降の `formatCoordinate` で `default` ケースに落ちて DDM が表示される。さらに `useEffect` で毎回 `localStorage.setItem` しているため、破損値が永続化される。

## 該当箇所
```ts
// src/hooks/useSettings.tsx:34-48
const [settings, setSettings] = useState<DisplaySettings>(() => {
  const saved = localStorage.getItem('fastbriefing-settings');
  if (saved) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      return DEFAULT_SETTINGS; // parse 失敗時のみフォールバック
    }
  }
  return DEFAULT_SETTINGS;
});
useEffect(() => {
  localStorage.setItem('fastbriefing-settings', JSON.stringify(settings));
}, [settings]);
```

問題:
- `JSON.parse` が成功しても `saved` が `{coordinateFormat: 'INVALID', altitudeUnit: 123}` のような不正型なら、そのままマージされる（`DisplaySettings` の union 型チェックはランタイムで行われない）
- `DEFAULT_SETTINGS` のキーが増えたとき（例: `FR-99` の `outputLanguage`）、旧 localStorage にはキーが無いため `undefined` が残るが、マージでは `undefined` が上書きしないため偶然動く。逆にキーが削除/リネームされたときは古いキーが残留する
- `localStorage` が `QuotaExceededError` を投げたときのハンドリングなし
- `setSettings` が `prev => ({...prev, [key]: value})` で毎回新オブジェクトを作るため、`App.tsx:39` の `handleFileDrop` の `settings` 依存が毎回変わり、再生成される（`useCallback` の deps に `settings` 全体を入れているため）

## 修正案
1. `zod` または自前の `isDisplaySettings` ガードでバリデーション:
   ```ts
   const parsed = JSON.parse(saved);
   const validated = DisplaySettingsSchema.safeParse(parsed);
   if (!validated.success) {
     console.warn('Invalid settings, resetting', validated.error);
     localStorage.removeItem('fastbriefing-settings');
     return DEFAULT_SETTINGS;
   }
   return { ...DEFAULT_SETTINGS, ...validated.data };
   ```
2. バージョン管理: `DisplaySettings` に `version: number` を追加し、マイグレーション関数で旧バージョンを変換
3. `useEffect` の `setItem` を `try/catch` でラップし、`QuotaExceededError` 時は `warnings` に通知
4. `App.tsx` の `handleFileDrop` は `settings` 全体ではなく必要な `coordinateFormat/unitSystem/viewMode` だけを deps にするか、`normalizeMission` の第2引数を `useSettings` から直接読む形にリファクタ

## 影響
- ユーザーが `localStorage` を手動編集したり、旧バージョンから更新したときに UI が壊れるが、リセット手段が無い（設定リセットボタンも無い）
- `NFR-05` 堅牢性「DCS バージョン差で落ちない」は満たしても、自身の設定のバージョン差で落ちる

## 検証
- `vitest` で `localStorage` に `'{ invalid json'` / `'{ "coordinateFormat": "INVALID" }'` / 旧バージョン JSON を入れたときの `useSettings` 初期化テスト
- `QuotaExceededError` をモックして `setItem` 失敗時の挙動テスト

## 参考
- `docs/requirements.md:FR-72` では手入力ノートを `missionKey` に紐づけて保存するが、そちらも同様のバリデーションが必要。共通の `safeLocalStorage` ユーティリティを作る
