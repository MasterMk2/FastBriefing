# [P2] MapTab: (window as any).L.DivIcon の型安全違反 / タブのアクセシビリティ欠落

**Labels:** `bug`, `P2-medium`, `map`, `a11y`
**Milestone:** Phase 1

## 概要
`MapTab.tsx` で Leaflet のアイコン生成に `(window as any).L.DivIcon` を使っているが、`leaflet` は既に `npm` で導入され型定義もあるため、直接 `import L from 'leaflet'` すべき。また `MissionView.tsx` のタブは `role="tablist"` / `role="tab"` を持つが、`aria-controls` / `id` / キーボード操作（矢印キー、Home/End）がなく、WCAG 2.1 を満たさない。

## 該当箇所
```ts
// src/components/MapTab.tsx:1-5,279-319
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, LayerGroup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
// L の import が無い
function createWaypointIcon(number: number) {
  return new (window as any).L.DivIcon({ // ← any, window 依存, SSR 不可
    className: 'waypoint-marker',
    html: `<div ...>${number}</div>`,
  });
}
// 同様に createAirbaseIcon, createEnemyIcon, createSupportIcon で 4 箇所

// src/components/MissionView.tsx:31-43
<nav className="tab-nav" role="tablist">
  <button role="tab" aria-selected={activeTab === index} onClick={() => setActiveTab(index)}>
    {tab.label}
  </button>
</nav>
<div className="tab-content" role="tabpanel">
  {tabs[activeTab].component} // aria-labelledby / id なし
</div>
// キーボード操作なし、フォーカス管理なし
```

`src/vite-env.d.ts:20-22` で `interface Window { L: any }` と宣言しているが、これは上記 `window.L` を正当化するためのワークアラウンドで、本来は不要。

## 修正案
### Leaflet
```ts
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png'; // Vite でのアセット解決
// leaflet のデフォルトアイコン URL 問題の対処も合わせて
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

function createWaypointIcon(number: number) {
  return new L.DivIcon({ className: 'waypoint-marker', html: `...` });
}
```

また `mapRef: useRef<L.Map | null>` は `React.RefObject<L.Map>` へのキャスト（`MapTab.tsx:73`）が不要になるよう、`MapContainer` の `whenCreated` または `useMap` フックを使う。

### a11y (MissionView)
```tsx
<nav role="tablist" aria-label="Mission sections">
  {tabs.map((tab, i) => (
    <button
      id={`tab-${tab.id}`}
      role="tab"
      aria-selected={activeTab === i}
      aria-controls={`panel-${tab.id}`}
      tabIndex={activeTab === i ? 0 : -1}
      onKeyDown={(e) => handleArrowKeys(e, i)}
    >
```
`handleArrowKeys` で `ArrowRight/Left, Home, End` を処理し、`useEffect` で `activeTab` 変更時にフォーカスを移動。

## 影響
- `window.L` は `leaflet` がグローバルに露出したときのみ動くため、Vite の HMR や SSR（将来の Tauri）で `L is undefined` エラーになる
- タブがキーボードで操作できず、スクリーンリーダーで「タブ 1/7」等の位置情報が伝わらない（`NFR-09` アクセシビリティ SHOULD に抵触）

## 検証
- `npm run build` 後の `dist` で `window.L` への参照が残っていないことを grep
- `axe-core` または `vitest-axe` で `MissionView` の a11y 違反が 0 になることをテスト
- Tab キーと矢印キーでタブ切替が可能なことを手動/自動テスト

## 参考
- https://react-leaflet.js.org/docs/start-setup/ （`L` の import 推奨）
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
