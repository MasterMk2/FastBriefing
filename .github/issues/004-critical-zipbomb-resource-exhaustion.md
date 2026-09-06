# [P0] Worker: ZIP展開時のリソース制限なし - Zip Bomb / 巨大ファイルでブラウザがハングする

**Labels:** `bug`, `security`, `P0-critical`, `parser`
**Milestone:** Phase 0 fix

## 概要
`src/workers/missionParser.ts:117` で `unzipSync(new Uint8Array(file))` を無制限に実行している。悪意ある `.miz`（ZIP Bomb）や、誤って大容量ファイル（例: 数百MBの動画を `.miz` と偽装）をドロップすると、メインスレッドは Worker でブロックされるが進捗表示がなく、メモリを使い切ってタブがクラッシュする。

## 該当箇所
- `src/workers/missionParser.ts:114-154` `self.onmessage` 全体 - サイズチェックなし、タイムアウトなし、エントリ数制限なし
- `src/core/MissionParser.ts:6-28` - Worker 生成時に `file.arrayBuffer()`（巨大）をそのまま渡すため、Structured Clone でさらにメモリを二重確保する
- `src/App.tsx:14-39` `handleFileDrop` - `.miz` 拡張子以外のチェックのみで、サイズチェックなし

## 要件とのギャップ
- `NFR-04` 性能: 「最大 600KB の mission を待たされずに開ける」ことが目標だが、逆に巨大ファイルの拒否が定義されていない
- `NFR-03` プライバシー: ローカル完結は満たすが、DoS 耐性は未規定

## 修正案
1. `App.tsx:handleFileDrop` で事前チェック:
   ```ts
   const MAX_MIZ_SIZE = 50 * 1024 * 1024; // 50MB 例
   if (file.size > MAX_MIZ_SIZE) { setError('ファイルが大きすぎます...'); return; }
   ```
2. Worker 内で `unzipSync` 前に `file.byteLength` チェック、展開後 `Object.keys(zip).length > 200` や各エントリ `> 10MB` で中断し `warnings` に積む
3. `strFromU8` を全エントリで無条件に呼んでいる（`zip[name]` すべて）が、`mission`/`theatre`/`dictionary`/`mapResource` 以外は `Uint8Array` のままにし、文字列化は必要なものだけにする（現行は画像バイナリも文字列化して無駄にメモリを食う）
4. 進捗表示（`FR-07`）とタイムアウト（例: 10秒で `reject`）を追加

## 検証
- `vitest` で 100MB のダミー ZIP を生成し、Worker が `error` を返すことを確認
- 手元実ファイル 19 本の展開後サイズを計測し、閾値を `docs/requirements.md` に追記

## 参考
- `fflate` の `unzipSync` は同期APIのため、巨大ファイルでは UI が止まる。`unzip`（非同期）への置換も検討
- OWASP: Unrestricted File Upload / Zip Bomb
