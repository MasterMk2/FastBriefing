# [P2] バンドルサイズ 470KB (gz 148KB) - タブの遅延ロードと地図のコード分割なし

**Labels:** `performance`, `P2-medium`, `build`
**Milestone:** Phase 2

## 概要
`npm run build` で `assets/index-BIWTG8N2.js 469.85 kB (gz 147.64 kB)` と、単一チャンクに全タブ（Overview/Flights/Map/Comms/Support/Threats/Export）が含まれている。`MapTab` は `leaflet` / `react-leaflet` / `proj4` を含み重いが、初期表示は `MissionView` の Overview のみでよいはず。スマホ（S3 ニーボード参照）では初回ロードが遅く、NFR-04 性能目標に反する。

## 該当箇所
```tsx
// src/components/MissionView.tsx:1-10
import OverviewTab from './OverviewTab';
import FlightsTab from './FlightsTab';
import MapTab from './MapTab'; // ← leaflet を静的 import
import CommsTab from './CommsTab';
import SupportTab from './SupportTab';
import ThreatsTab from './ThreatsTab';
import ExportTab from './ExportTab';
// 全て静的 import のため、どれか1つを開くだけでも全コードがロードされる

// vite.config.ts:5-18
export default defineConfig({
  plugins: [react()],
  // build.rollupOptions.output.manualChunks なし
  // chunk分割なし
})
```

`dist/assets/index-*.js 470KB` の内訳（推定）:
- `react` / `react-dom` ~140KB
- `leaflet` ~140KB
- `proj4` ~80KB
- `fflate` / `luaparse` / `suncalc` / `i18next` 等 残り

## 修正案
1. `MissionView.tsx` で `React.lazy` + `Suspense` に:
   ```tsx
   const MapTab = lazy(() => import('./MapTab'));
   const FlightsTab = lazy(() => import('./FlightsTab'));
   // ...
   <Suspense fallback={<div>Loading...</div>}>
     {tabs[activeTab].component}
   </Suspense>
   ```
   `MapTab` は `leaflet.css` も遅延ロードされるため、初期 CSS も軽くなる

2. `vite.config.ts` で `manualChunks`:
   ```ts
   build: {
     rollupOptions: {
       output: {
         manualChunks: {
           vendor: ['react', 'react-dom', 'react-i18next'],
           map: ['leaflet', 'react-leaflet', 'proj4'],
           parser: ['fflate', 'luaparse'],
         }
       }
     }
   }
   ```

3. `missionParser` Worker は既に別チャンク（`assets/missionParser-C731i4J0.js 33KB`）に分離されているが、`fflate` / `luaparse` がメインと Worker で二重にバンドルされていないか `vite` の `worker.format: 'es'` 設定と合わせて確認

## 影響
- **NFR-04 性能**: 手元最大 600KB の `mission` を 2秒以内に開く目標に対し、JS 初回ロードだけで 148KB gz は重い（特にスマホの Discord 内ブラウザ）
- `MapTab` を開かないユーザー（例: フライトカードだけ印刷したい）も地図コードを払わされる

## 検証
- `npx vite-bundle-visualizer` または `rollup-plugin-visualizer` でチャンク構成を可視化し、`npm run build` 後の各チャンク gz サイズを CI で閾値チェック（例: 初期チャンク < 100KB gz）
- Lighthouse の Performance スコアで初回表示を計測

## 参考
- `docs/requirements.md:6 NFR-04` 仮目標 2秒以内は、コード分割なしでは達成困難
