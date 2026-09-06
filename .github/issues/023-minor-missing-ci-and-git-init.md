# [P2] CI/CD と git 初期化が未設定 - NFR-04 G4 の両OSビルド検証ができない

**Labels:** `chore`, `P2-medium`, `ci`
**Milestone:** Phase 1

## 概要
`git` リポジトリが未初期化で、GitHub Actions 等の CI が存在しない。`docs/requirements.md:1.3 G4` では「Windows と Linux の両方で同じ手順で起動できること」を CI で検証すると定義されているが、現状は手動の `npm run build` のみ。`package.json` の `lint` が常に失敗する状態では CI を導入しても全PRが落ちるため、Issue #015 と合わせて修正が必要。

## 該当箇所
```
Is directory a git repo: no
> gh --version 2.88.1 / git 2.52.0 は利用可能だが、remote が無いため gh issue create 不可
> package.json:6-11 scripts は dev/build/preview/test/lint のみで、ci 用の型チェックやフォーマットが無い
```

## 要件
- **G4**: Windows と Linux の両方で同じ手順で起動できる - CI で両OSのビルドとテストを回す
- **NFR-01 MUST**: Chrome/Edge/Firefox で動く、Node.js 22 LTS、Windows 11 と Ubuntu 22.04 で同じコマンド
- **NFR-04**: 性能目標（600KB を 2秒以内）を Phase 0 で実測して決める

## 修正案
1. `git init` し、`.github/workflows/ci.yml` を作成:
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     build:
       strategy:
         matrix: { os: [ubuntu-latest, windows-latest], node: [22] }
       runs-on: ${{ matrix.os }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: 'npm' }
         - run: npm ci
         - run: npm run lint
         - run: npm run build
         - run: npm test -- --coverage
         - uses: actions/upload-artifact@v4
           with: { name: dist-${{ matrix.os }}, path: dist }
   ```

2. `package.json` に `typecheck: "tsc --noEmit"` を追加し、CI で実行

3. `NFR-04` の性能計測: `vitest` の `bench` または `console.time` で 600KB `mission` の parse/normalize 時間を計測し、CI で閾値（例: 2秒）を超えたら警告

4. `docs/requirements.md:11未決事項 Q5` のフィクスチャ同梱可否を決め、`tests/fixtures/` に許可済みの小さい `.miz`（例: `BLU107Test.miz`）を配置

## 検証
- `git push` で Actions が緑になることを確認
- Windows と Linux で `npm ci && npm run build && npm test` が同じ結果になることを手動確認（初回）

## 影響
- 現状は `npm run build` が手元 Windows で通っても、Linux で `path.resolve(__dirname, ...)` が別挙動になる可能性を検出できない
- コントリビュータの PR で P0 バグ（#001 等）のリグレッションを自動検出できない

## 参考
- `docs/requirements.md:6 NFR-08` テスト: 単体/フィクスチャ/E2E の3層を CI で回す想定
- Issue #015 (lint) と #016 (tests) が先に解決されないと CI は常に赤
