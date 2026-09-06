# [P2] ビルド設定: ESLint 設定欠落で npm run lint が常に失敗 / tsconfig と vite の二重管理

**Labels:** `bug`, `P2-medium`, `dx`
**Milestone:** Phase 1

## 概要
`package.json:11` の `lint` スクリプトが `eslint . --ext ts,tsx --max-warnings 0` を実行するが、リポジトリに `.eslintrc.*` / `eslint.config.*` が存在せず、常に `ESLint couldn't find a configuration file` で失敗する。CI があれば全PRが落ちる。また `tsconfig.json` と `vite.config.ts` の alias 設定が二重管理で、片方だけ変更すると解決に失敗する。

## 該当箇所
```json
// package.json:11
"lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
```
- 実行結果: `ESLint: 8.57.1 couldn't find a configuration file`（`npm run lint` で再現済み）
- `devDependencies` には `@typescript-eslint/*` / `eslint-plugin-react-hooks` 等が入っているが設定ファイルが無いため未使用

```ts
// vite.config.ts:7-11
resolve: { alias: { '@': path.resolve(__dirname, './src') } }
// tsconfig.json:18-21
"paths": { "@/*": ["src/*"] }
// 両方に alias があるが、vite 側は __dirname 解決、ts 側は相対。どちらかがズレるとエディタ補完とビルドで挙動が異なる
```

## 修正案
1. `eslint.config.js`（Flat Config, ESLint 8 互換）を作成:
   ```js
   import js from '@eslint/js';
   import tseslint from 'typescript-eslint';
   import reactHooks from 'eslint-plugin-react-hooks';
   import reactRefresh from 'eslint-plugin-react-refresh';
   export default tseslint.config(
     { ignores: ['dist', 'node_modules'] },
     { extends: [js.configs.recommended, ...tseslint.configs.recommended] },
     { plugins: { 'react-hooks': reactHooks }, rules: reactHooks.configs.recommended.rules },
   );
   ```
   既存コードの `noUnusedLocals/noUnusedParameters` は `tsconfig` と ESLint の両方で有効なため、どちらを正とするか決める（現行は `tsconfig` が `noUnusedLocals: true` だが、未使用の `_warnings` 等を `_` prefix で回避している）

2. `package.json` の `lint` を `eslint . --max-warnings 0` に更新（`--ext` は Flat Config で不要）

3. `vite.config.ts` の alias を `tsconfig.json` から自動読込するか、`vite-tsconfig-paths` プラグインを導入して二重管理を解消

4. `tsconfig.node.json` の `composite: true` は `vite.config.ts` だけを include しているが、`references` を使っているため `tsc -b` が必要。`npm run build` は `tsc && vite build` で `tsc` が全ファイルを型チェックするため、実質 `composite` の恩恵がない。`tsconfig.node.json` を削除して単一 tsconfig に統合するか、意図をコメントで明記

## 検証
- `npm run lint` が 0 終了することを CI で検証
- `npm run build` が `tsc` エラーなく通ることを確認（現行は通るが、将来の型エラーを見逃さないよう `tsc --noEmit` を pre-commit に追加）

## 影響
- **NFR-04 G4** CI で両OSビルドを回す前提が、lint が常に失敗するため CI を導入できない
- 新規コントリビュータが `npm run lint` で躓く

## 参考
- `docs/requirements.md:7.1` では TypeScript + Vite を推奨しているが、lint 設定の言及はない
