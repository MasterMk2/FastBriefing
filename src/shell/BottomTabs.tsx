// Owner: P0 (土台). Bottom tabs under 1280px (SPEC 1.1). Five items: overview, flights, map, comms and
// "その他" (a sheet with support, threats (creator only), notes, export, revision, settings and close).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScreenId } from '../types/screen';
import { useMission } from './MissionContext';
import { useWorkspace } from './workspace';

const PRIMARY: readonly ScreenId[] = ['overview', 'flights', 'map', 'comms'];
const MORE: readonly ScreenId[] = ['support', 'threats', 'notes', 'export', 'revision'];

export function BottomTabs({ onOpenSettings, onOpenFiles, onCloseMission }: {
  onOpenSettings: () => void;
  onOpenFiles: () => void;
  onCloseMission: () => void;
}) {
  const { t } = useTranslation('shell');
  const { viewMode } = useMission();
  const { screen, setScreen } = useWorkspace();
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreItems = MORE.filter(id => id !== 'threats' || viewMode === 'creator');
  const moreActive = moreItems.includes(screen);

  const go = (id: ScreenId) => {
    setSheetOpen(false);
    setScreen(id);
  };

  return (
    <>
      <nav className="bottom-tabs" aria-label={t('shell:nav.more')}>
        {PRIMARY.map(id => (
          <button
            key={id}
            type="button"
            className={`bottom-tab${screen === id ? ' is-current' : ''}`}
            aria-current={screen === id ? 'page' : undefined}
            onClick={() => go(id)}
          >
            {t(`nav.${id}`)}
          </button>
        ))}
        <button
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
        <div className="bottom-sheet" role="dialog" aria-label={t('shell:bottom.sheetTitle')}>
          <ul className="bottom-sheet-list">
            {moreItems.map(id => (
              <li key={id}>
                <button type="button" className="bottom-sheet-item" onClick={() => go(id)}>{t(`nav.${id}`)}</button>
              </li>
            ))}
            <li>
              <button type="button" className="bottom-sheet-item" onClick={() => { setSheetOpen(false); onOpenSettings(); }}>{t('shell:header.settings')}</button>
            </li>
            <li>
              <button type="button" className="bottom-sheet-item" onClick={() => { setSheetOpen(false); onOpenFiles(); }}>{t('shell:file.open')}</button>
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
