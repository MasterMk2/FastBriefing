# [P2] ExportTab: Markdown の Zulu/Local 表示が逆 / 印刷CSSがタブを隠すだけ / PNG 出力未実装

**Labels:** `bug`, `P2-medium`, `export`
**Milestone:** Phase 2

## 概要
`ExportTab.tsx` の Markdown 生成で Local/Zulu が逆転しており、さらに印刷用 CSS が `.tab-nav` を隠すだけで、アクティブタブ以外の内容が出力されない。ニーボード PNG（FR-81 MUST）も未実装で、Phase 2 完了条件 G3 を満たせない。

## 該当箇所
```ts
// src/components/ExportTab.tsx:20-21
md += `**開始時刻 (Local)**: ${new Date(meta.date.Year, meta.date.Month - 1, meta.date.Day, Math.floor(meta.startTime / 3600) - meta.utcOffset, ...).toISOString().slice(11,16)}Z\n`;
// Local を作るのに utcOffset を引いて Z にしている → 逆
// 正しくは Local: new Date(Date.UTC(...) + startTime*1000), Zulu: Local - utcOffset

// src/components/ExportTab.tsx:80-87
const copyMarkdown = () => {
  navigator.clipboard.writeText(markdown);
  alert('Markdownをクリップボードにコピーしました'); // alert は UX が悪く、Clipboard API の失敗ハンドリングなし
};
const printBriefing = () => { window.print(); };

// src/index.css:24-34
@media print {
  .tab-nav, .header, .map-controls, .export-actions { display: none !important; }
  .tab-panel { display: block !important; }
}
// MissionView は activeTab のみを render しているため、印刷時に非アクティブタブの内容は DOM に存在しない。→ 印刷しても1タブ分しか出ない
```

```tsx
// src/components/MissionView.tsx:45-47
<div className="tab-content" role="tabpanel">
  {tabs[activeTab].component} // 1つだけ render
</div>
```

## 要件
- **FR-80 MUST**: 印刷用レイアウトで A4 縦、ブラウザ印刷から PDF
- **FR-81 MUST**: ニーボード PNG 3:4 1536x2048 機種別/共通フォルダ
- **FR-83 SHOULD**: Discord Markdown 出力
- **G3**: 1 フライト分の資料一式を 3 操作以内で PDF/PNG に出せる

## 修正案
1. Zulu/Local 計算を Issue #012 と同様に `Date.UTC` 基準に統一。`ExportTab` と `OverviewTab` で共通の `formatMissionDate(meta, 'local'|'zulu')` ユーティリティを作る

2. 印刷対応: `MissionView` を印刷時は全タブを DOM に残すか、印刷専用コンポーネント `PrintView` を用意:
   ```tsx
   // 印刷時は全タブを非表示で render し、CSS で print 時のみ表示
   <div className="print-only">
     {tabs.map(tab => <section key={tab.id}>{tab.component}</section>)}
   </div>
   @media screen { .print-only { display: none; } }
   @media print { .tab-content { display: none; } .print-only { display: block; } }
   ```

3. `copyMarkdown` は `async/await` と `try/catch` で `navigator.clipboard` の失敗（非 HTTPS 環境）をハンドリングし、`alert` ではなくトースト表示に

4. PNG 出力: `html-to-image` または `Canvas` 直描きで `ExportTab` に「PNG 生成」ボタンを追加。`fflate` で `.miz` への埋め込み（FR-82）は別 Issue に分割

## 検証
- Local 08:00 / Zulu 04:00 (Caucasus) の Markdown 行が正しいことをスナップショットテスト
- ブラウザ印刷プレビューで 7 タブ全てが出力されることを手動確認
- `navigator.clipboard` が無い環境（http）でエラーにならないことをテスト

## 参考
- `docs/requirements.md:5.9 FR-80` A4 縦が基本だが、現行 CSS は A4 指定なし
