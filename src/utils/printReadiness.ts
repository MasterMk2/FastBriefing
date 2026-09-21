export const PRINT_MAP_BLOCKED_CLASS = 'print-map-blocked';

interface PrintEventTarget {
  addEventListener(type: 'beforeprint' | 'afterprint', listener: () => void): void;
  removeEventListener(type: 'beforeprint' | 'afterprint', listener: () => void): void;
}

interface PrintClassTarget {
  classList: Pick<DOMTokenList, 'remove' | 'toggle'>;
}

/**
 * Keep native browser printing fail-closed while the printable map is not ready.
 * The class is applied synchronously in beforeprint so Ctrl+P and browser-menu
 * printing cannot bypass the in-app button gate.
 */
export function installPrintReadinessGuard(
  events: PrintEventTarget,
  root: PrintClassTarget,
  isBlocked: () => boolean,
): () => void {
  const beforePrint = () => {
    root.classList.toggle(PRINT_MAP_BLOCKED_CLASS, isBlocked());
  };
  const afterPrint = () => {
    root.classList.remove(PRINT_MAP_BLOCKED_CLASS);
  };

  events.addEventListener('beforeprint', beforePrint);
  events.addEventListener('afterprint', afterPrint);

  return () => {
    events.removeEventListener('beforeprint', beforePrint);
    events.removeEventListener('afterprint', afterPrint);
    root.classList.remove(PRINT_MAP_BLOCKED_CLASS);
  };
}
