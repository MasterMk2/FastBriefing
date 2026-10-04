# 開発基盤 0.1: Node.js / npm

目的は、環境確認・依存復元・検査の知見を別の Web プロジェクトでも再利用すること。
共通契約の採用版は **0.1**。React / Vite / TypeScript やアプリ仕様はこの変更で置き換えない。

## 正典と対応範囲

- 開発の基準 Node は `.nvmrc` の 22.23.3。互換確認は 24.19.0 でも行う
- 許容範囲は `package.json` の `engines`、npm は 11.9.0。`.npmrc` の engine-strict で誤った環境の install を止める
- 宣言は `package.json`、解決済み依存は `package-lock.json`。npm を維持し、別の package manager / lockfile を追加しない
- CI は Windows / Ubuntu × Node 22 / 24。同じ npm 版、同じ `npm run check` を使う
- Node 20 は公式サポート終了のため検証行列から外す。ブラウザの対象は既存要件のまま

## いつも使う入口

`.nvmrc` の Node と npm 11.9.0 を用意し、Windows / Linux で次を実行する。

```text
npm run doctor
npm ci
npm run check
```

`doctor` は Node・OS・CPU・期待する版・npm 版だけを表示する。
環境変数全体、秘密情報、個人の絶対パスやミッション名は表示しない。
`npm ci` は lockfile を書き換えず、不整合なら失敗する。`npm run check` は lint → test → build。
テストが見つからない場合を成功にする `--passWithNoTests` は使わない。

起動は `npm run dev`、生成済み静的サイトの確認は `npm run preview`。
起動・検査コマンドに公開や本番設定変更を混ぜない。

## 追加検証、設定と外部 I/O

- 通常テストは合成 fixture を用いる。`SMOKE_MIZ_DIR` 未指定の実 `.miz` 検査は理由付き skip で、実資料検証済みとは数えない
- 実資料を使うときは検査対象と権限を別途確認する。資料をリポジトリやCI artifactへ混ぜない
- 地図表示等のネットワーク利用と、ミッションファイルを外部送信しない製品要件を区別する
- テストはアプリ本番のログイン情報や秘密情報を必要としない。秘密を診断ログや screenshot に含めない
- lint / test / build の成功はブラウザ操作・画面・実 `.miz` 全体の検証を代用しない

## 更新と戻し方

1. 変更前の commit と Node / npm 版、合否・skip 理由を記録する
2. 依存を追加・更新するときだけ `npm install` を使い、package.json と lockfile を同じ PR に入れる
3. Node / npm の更新は `.nvmrc`・engines・packageManager・CI・この手順をまとめて照合する
4. clean clone / 空の node_modules から `npm ci` → `npm run check`。Windows / Linux と対象 Node の結果を確認する
5. 採用した共通契約の版と例外を記録する。失敗時は旧 commit / pin / lockfile 一式へ戻し、専用作業ディレクトリで `npm ci` し直す

既存のCIは検査用で、公開工程は追加しない。将来公開工程を設けるときも、commit と
生成物の版、公開先、取消し方法を別に確認する。
