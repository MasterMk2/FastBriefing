# [P0] MissionParser: file.arrayBuffer() のPromiseをそのままpostMessageしているため解析が必ず失敗する

**Labels:** `bug`, `P0-critical`, `parser`
**Assignee:** -
**Milestone:** Phase 0 fix

## 概要
`src/core/MissionParser.ts:26` で `file.arrayBuffer()` の返り値（`Promise<ArrayBuffer>`）をそのまま Worker に渡している。Worker 側は `Uint8Array` を期待しているため、`unzipSync` で常に例外が発生し、`.miz` を一切読み込めない。

## 該当箇所
- `src/core/MissionParser.ts:26` 
  ```ts
  this.worker.postMessage({ file: file.arrayBuffer() }); // ← Promiseを渡している
  ```
- `src/workers/missionParser.ts:114-117`
  ```ts
  self.onmessage = async (e: MessageEvent<{ file: ArrayBuffer }>) => {
    const { file } = e.data;
    const zip = unzipSync(new Uint8Array(file)) // fileがPromiseだとUint8Array化で失敗
  ```

## 再現手順
1. `npm run dev` で起動
2. 任意の `.miz` をドロップ
3. Console に `unzipSync` エラー / `DataCloneError` が出て `loading` が止まる

## 期待動作
`await file.arrayBuffer()` してから postMessage する。Transferable として送るなら `postMessage({file: buffer}, [buffer])` を検討。

```ts
async parse(file: File): Promise<ParsedMissionFile> {
  const buffer = await file.arrayBuffer();
  // ...
  this.worker.postMessage({ file: buffer }, [buffer]);
}
```

合わせて Worker 側の型を `MessageEvent<{file: ArrayBuffer}>` で受け、エラーハンドリングで `worker.onerror` と `onmessage error` の二重 terminate を整理する（現在は両方で terminate しているが Promise reject が二重発火する可能性）。

## 影響
- **FR-01, FR-02, FR-03, FR-07, G1 すべてをブロック** - MVP の入口が塞がっている
- 現状ビルドは通るがランタイムで100%失敗するため、E2E テストがあれば即検出されるはず

## 検証方法
- `vitest` で `File` モックを使った `MissionParser` の往復テストを追加し、`arrayBuffer` が解決されてから Worker に届くことをアサートする

## 参考
- `docs/requirements.md:7.1` アーキテクチャ図では Worker で `fflate` 展開を想定しているが、現行実装はその前段で落ちる
