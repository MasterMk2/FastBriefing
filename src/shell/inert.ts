// Owner: P0 (土台). Makes everything outside one layer inert while the layer covers the page (the oral briefing
// and the print preview). Every sibling of the layer and of each of its ancestors up to <body> is marked, so
// controls that are not part of the shell chrome (the hidden file inputs, the error band, the bottom sheet, the
// settings drawer) are not reached with Tab either (A11Y-1, A11Y-3).

/**
 * Marks every element outside `layer` inert, except those `keep` accepts (and their subtrees). Elements that were
 * already inert are left as they are. Returns the function that removes exactly the marks this call added.
 */
export function inertOutside(layer: Element, keep: (element: Element) => boolean = () => false): () => void {
  const marked: Element[] = [];
  let current: Element | null = layer;
  while (current && current !== document.body && current.parentElement) {
    for (const sibling of Array.from(current.parentElement.children)) {
      if (sibling === current || sibling.hasAttribute('inert') || keep(sibling)) continue;
      if (sibling.tagName === 'SCRIPT' || sibling.tagName === 'STYLE') continue;
      sibling.setAttribute('inert', '');
      marked.push(sibling);
    }
    current = current.parentElement;
  }
  return () => {
    for (const element of marked) element.removeAttribute('inert');
  };
}
