# [P2] i18n 基盤が空 / テストが 0 本 - FR-99 と NFR-08 / G1 を満たせない

**Labels:** `enhancement`, `P2-medium`, `i18n`, `testing`
**Milestone:** Phase 1

## 概要
`package.json` に `i18next` / `react-i18next` が入っているが、`src/i18n/` は空ディレクトリで初期化コードが存在しない。UI の言語切替（`useSettings.language`）は `select` の値を変えるだけで、実際の翻訳は全く機能していない。また `vitest` は設定されているがテストファイルが 0 本で、`npm test` は常に 0 テストで成功してしまう。

## 該当箇所
```tsx
// src/hooks/useSettings.tsx:13-14
language: 'ja' | 'en',
outputLanguage: 'ja' | 'en',
// App.tsx:67-70
<select value={settings.language} onChange={(e) => setLanguage(e.target.value as 'ja'|'en')}>
  <option value="ja">日本語</option>
</select>
// だけで、i18next.t() はどこからも呼ばれていない

// src/main.tsx:1-13
import { SettingsProvider } from './hooks/useSettings';
// I18nextProvider が無い

// 検索結果: src 配下で "useTranslation" / "t(" のヒット 0 件
// src/i18n/ は空
```

```json
// package.json:10
"test": "vitest run"
// 実行結果: No test files found, exiting with code 0（誤って成功扱い）
```

## 要件
- **FR-99 SHOULD**: UI は日/英切替、出力言語は別に選択可能（例: UI 日本語、資料 英語）
- **NFR-08 MUST**: 単体（Luaパーサ、投影、単位変換、コールサイン解読）、フィクスチャ（実 .miz）、E2E（読み込み→出力）
- **G1**: 19 本の実ミッションがエラーなく表示されることを自動テストで保証

## 修正案
### i18n
1. `src/i18n/index.ts` を作成:
   ```ts
   import i18n from 'i18next';
   import { initReactI18next } from 'react-i18next';
   import ja from './locales/ja.json';
   import en from './locales/en.json';
   i18n.use(initReactI18next).init({ resources: { ja: {translation: ja}, en: {translation: en}}, lng: 'ja', fallbackLng: 'en' });
   ```
2. `src/main.tsx` で `<I18nextProvider>` または `import './i18n'` を追加
3. 各コンポーネントのハードコード日本語（例: `OverviewTab.tsx:26 "ソーティ名"`）を `t('overview.sortie')` に置換。`outputLanguage` は ExportTab の Markdown 生成時に `t` の `lng` オプションで切替

### テスト
1. `vitest.config` を `vite.config.ts` に追加:
   ```ts
   /// <reference types="vitest" />
   export default defineConfig({ test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], environment: 'jsdom' } })
   ```
2. 最低限のテストを 5 本作成:
   - `src/utils/coordinates.test.ts` - 投影の既知点 3 点
   - `src/core/MissionNormalizer.test.ts` - bullseye/flights/payload の fixture テスト
   - `src/workers/missionParser.test.ts` - Lua パースの TableValue/配列テスト
   - `src/hooks/useSettings.test.tsx` - localStorage 破損時のフォールバック
   - `src/components/OverviewTab.test.tsx` - 日付/Zulu 表示のスナップショット
3. `package.json` の `test` を `vitest run --coverage` にし、カバレッジ閾値を設定（例: 60%）

## 影響
- 現状 `language` 切替は見かけだけで、要件の FR-99 を満たしたことにならない。ユーザーが英語を選択しても日本語のまま
- テスト 0 本では G1/G2 の成功基準を CI で検証できず、P0 バグ（#001, #002）が検出されないままリリースされる

## 検証
- `npm test` で 5 本以上のテストが実行され、カバレッジが閾値を超えることを CI で検証
- ブラウザで言語切替が即時反映される E2E テスト（Playwright または vitest jsdom）

## 参考
- `docs/requirements.md:11未決事項 Q4` で UI は日/英、資料は選択式と仮決めされているが、実装が追従していない
