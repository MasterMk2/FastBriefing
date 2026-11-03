// Owner: Export (P3 系統). Whether the print preview is open. The export screen sets html[data-print-preview="on"]
// while it is; the print document and the shell read it through this hook.
import { useSyncExternalStore } from 'react';

function subscribePrintPreview(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-print-preview'] });
  return () => observer.disconnect();
}

function isPrintPreviewOpen(): boolean {
  return document.documentElement.dataset.printPreview === 'on';
}

/** True while the print preview is open. */
export function usePrintPreviewOpen(): boolean {
  return useSyncExternalStore(subscribePrintPreview, isPrintPreviewOpen, () => false);
}
