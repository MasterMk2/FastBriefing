// Owner: P0 (土台). Screen router: maps ScreenId to a lazily loaded screen file (SPEC 6.3).
// Each screen file is a default export with no props. Packages replace the body of their own file only.
import { lazy, Suspense } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScreenId } from '../types/screen';
import { useWorkspace } from './workspace';

type ScreenComponent = LazyExoticComponent<ComponentType>;

const SCREENS: Record<Exclude<ScreenId, 'initial'>, ScreenComponent> = {
  overview: lazy(() => import('../screens/OverviewScreen')),
  flights: lazy(() => import('../screens/FlightScreen')),
  map: lazy(() => import('../screens/MapScreen')),
  comms: lazy(() => import('../screens/CommsScreen')),
  support: lazy(() => import('../screens/SupportScreen')),
  threats: lazy(() => import('../screens/ThreatsScreen')),
  notes: lazy(() => import('../screens/NotesScreen')),
  export: lazy(() => import('../screens/ExportScreen')),
  briefing: lazy(() => import('../screens/BriefingMode')),
  revision: lazy(() => import('../screens/RevisionScreen')),
};

/** Renders the current screen. Only the current screen's code is loaded. */
export function ScreenHost() {
  const { t } = useTranslation('shell');
  const { screen } = useWorkspace();
  if (screen === 'initial') return null;
  const Screen = SCREENS[screen];
  return (
    <Suspense fallback={<div className="screen-loading" role="status" aria-live="polite">{t('shell:app.screenLoading')}</div>}>
      <Screen />
    </Suspense>
  );
}
