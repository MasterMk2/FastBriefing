// Owner: P0 (土台). Bottom tabs under 1280px (SPEC 1.1). Five items: overview, flights, map, comms and
// "その他" (a sheet with support, threats (creator only), notes, export, and the operations settings, open,
// compare revisions and close). The revision screen is reached from the compare operation, so it has no item of its own.
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScreenId } from '../types/screen';
import { useMission } from './MissionContext';
import { useWorkspace } from './workspace';

const PRIMARY: readonly ScreenId[] = ['overview', 'flights', 'map', 'comms'];
const MORE: readonly ScreenId[] = ['support', 'threats', 'notes', 'export'];

export function BottomTabs({ onOpenSettings, onOpenFiles, onCompare, onCloseMission, navRef }: {
  onOpenSettings: () => void;
  onOpenFiles: () => void;
  onCompare: () => void;
  onCloseMission: () => void;
  /** Lets the shell mark the tab bar inert while the briefing is open. */
  navRef?: RefObject<HTMLElement>;
}) {
  const { t } = useTranslation('shell');
  const { viewMode } = useMission();
  const { screen, setScreen } = useWorkspace();
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreItems = MORE.filter(id => id !== 'threats' || viewMode === 'creator');
  const moreActive = moreItems.includes(screen) || screen === 'revision';
  const moreRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // The sheet is a small dialog (A11Y-6): it takes the focus when it opens, Escape closes it and returns the focus to
  // "その他", and a press outside it closes it. The oral briefing covers the page, so it closes the sheet too.
  useEffect(() => {
    if (!sheetOpen) return undefined;
    sheetRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setSheetOpen(false);
      moreRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (sheetRef.current?.contains(target) || moreRef.current?.contains(target))) return;
      setSheetOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [sheetOpen]);

  useEffect(() => {
    if (screen === 'briefing') setSheetOpen(false);
  }, [screen]);

  const go = (id: ScreenId) => {
    setSheetOpen(false);
    setScreen(id);
    // The pressed item goes away with the sheet: the focus moves to the screen, not to the document body.
    if (sheetOpen) window.setTimeout(() => document.getElementById('main')?.focus(), 0);
  };

  return (
    <>
      <nav className="bottom-tabs" aria-label={t('shell:rail.navLabel')} ref={navRef}>
        {PRIMARY.map(id => (
          <button
            key={id}
            type="button"
            className={`bottom-tab${screen === id ? ' is-current' : ''}`}
            aria-current={screen === id ? 'page' : undefined}
            onClick={() => go(id)}
          >
            {t(`shell:nav.${id}`)}
          </button>
        ))}
        <button
          ref={moreRef}
          type="button"
          className={`bottom-tab${moreActive ? ' is-current' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(open => !open)}
        >
          {t('shell:nav.more')}
        </button>
      </nav>
      {sheetOpen && (
        <div ref={sheetRef} className="bottom-sheet" role="dialog" aria-label={t('shell:bottom.sheetTitle')}>
          <ul className="bottom-sheet-list">
            {moreItems.map(id => (
              <li key={id}>
                <button type="button" className="bottom-sheet-item" onClick={() => go(id)}>{t(`shell:nav.${id}`)}</button>
              </li>
            ))}
            <li>
              <button type="button" className="bottom-sheet-item" onClick={() => { setSheetOpen(false); onOpenSettings(); }}>{t('shell:header.settings')}</button>
            </li>
            <li>
              <button type="button" className="bottom-sheet-item" onClick={() => { setSheetOpen(false); onOpenFiles(); }}>{t('shell:file.open')}</button>
            </li>
            <li>
              <button type="button" className="bottom-sheet-item" onClick={() => { setSheetOpen(false); onCompare(); }}>{t('shell:file.compare')}</button>
            </li>
            <li>
              <button type="button" className="bottom-sheet-item" onClick={() => { setSheetOpen(false); onCloseMission(); }}>{t('shell:file.close')}</button>
            </li>
          </ul>
        </div>
      )}
    </>
  );
}
