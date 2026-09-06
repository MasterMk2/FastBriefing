# [P2] リポジトリ衛生: 研究用 HTML 12件がルート直下 / .gitignore / README / LICENSE 欠落

**Labels:** `chore`, `P2-medium`, `dx`
**Milestone:** Phase 0 fix

## 概要
ルート直下に `brief.html, clouds.html, draken.html, dtcloc.html, dtcmay.html, forum_dtc.html, jtac.html, kbgen.html, kbplace.html, kbres.html, mbr.html, mpdtc.html, wombat.html` の 13件の HTML がコミットされている。これらは `docs/research-notes.md` の一次ソース調査で保存した ED フォーラム等のスクレイピング成果物だが、`.gitignore` も `README.md` も無いため、リポジトリの目的が不明で、新規コントリビュータが `index.html` と混同する。さらに `git` リポジトリ自体が未初期化（`Is directory a git repo: no`）で、GitHub issue 連携や CI が一切できない。

## 該当箇所
```
FastBriefing/
├── brief.html (EDフォーラム スクレイピング)
├── clouds.html
├── draken.html (dcs user files)
├── ... 計13件
├── index.html (Vite エントリ) ← 混在して区別がつかない
├── package.json
├── src/
├── docs/
│   ├── requirements.md
│   └── research-notes.md
├── dist/ (ビルド成果物 - gitignore すべき)
├── node_modules/ (gitignore すべき)
└── .git/ なし
```

`docs/research-notes.md:1-186` は要件の根拠として優秀だが、HTML 原文は `docs/research-sources/` に移動し、`.gitignore` で除外するか、LFS 管理にすべき。現行はルートで `git add .` すると全て GitHub に上がり、ED フォーラムの HTML（著作権物）を再配布することになる。

## 要件
- **NFR-10 MUST**: 公開物の衛生 - ローカルパス・ユーザー名・秘密情報を含めない（グローバルルール準拠）
- **NFR-02 MUST**: 配布形態 (a) 静的サイト (b) ローカル起動 (c) 将来 Tauri。どれも `README` の起動手順が必要
- **NFR-07 MUST**: ライセンス - コードは MIT 仮、pydcs 由来データは LGPL-3.0 の扱いを整理。ED の Lua/画像は同梱しない

## 修正案
1. `git init` し、以下を作成:
   ```gitignore
   # .gitignore
   node_modules/
   dist/
   .vite/
   *.local
   docs/research-sources/*.html  # 原文はローカルのみ、CI では docs/research-notes.md のURLから再取得可能に
   ```

2. 研究 HTML を `docs/research-sources/` に移動（または削除し、`docs/research-notes.md` の URL リストだけ残す）。ED フォーラム HTML の再配布は著作権上グレーなため、URL と要約だけを残すのが安全

3. `README.md` を作成:
   ```md
   # FastBriefing
   DCS World .miz からブリーフィング資料を生成する Web ツール
   ## 起動
   npm install && npm run dev
   ## ビルド
   npm run build && npm run preview
   ```

4. `LICENSE` (MIT) と `NOTICE` (pydcs LGPL 由来データの帰属) を追加。`docs/requirements.md:6 NFR-07` の方針を明文化

5. `package.json` の `description` はあるが `repository` / `homepage` / `bugs` フィールドが無いため追加

## 検証
- `git status` で `node_modules` / `dist` / `*.html` が untracked に出ないことを確認
- `git log --all --oneline` で初期コミットに個人情報（`C:\Users\...`）が含まれていないことを `git diff --stat` で確認（グローバルセーフティルール準拠）

## 影響
- 現状 `git` リポジトリが無いため、GitHub issue 作成（`gh issue create`）も `gh pr create` も実行できない。本 Issue 群の作成自体がブロックされている
- `dist/` がコミットされると差分が肥大化し、レビュー不能になる
