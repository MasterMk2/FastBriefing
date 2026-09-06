import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MissionData, DisplaySettings } from '../types/mission';

const OverviewTab = lazy(() => import('./OverviewTab'));
const FlightsTab = lazy(() => import('./FlightsTab'));
const MapTab = lazy(() => import('./MapTab'));
const CommsTab = lazy(() => import('./CommsTab'));
const SupportTab = lazy(() => import('./SupportTab'));
const ThreatsTab = lazy(() => import('./ThreatsTab'));
const ExportTab = lazy(() => import('./ExportTab'));

interface MissionViewProps {
  mission: MissionData;
  settings: DisplaySettings;
}

const tabs = [
  { id: 'overview', component: OverviewTab },
  { id: 'flights', component: FlightsTab },
  { id: 'map', component: MapTab },
  { id: 'comms', component: CommsTab },
  { id: 'support', component: SupportTab },
  { id: 'threats', component: ThreatsTab },
  { id: 'export', component: ExportTab },
] as const;

export default function MissionView({ mission, settings }: MissionViewProps) {
  const [activeTab, setActiveTab] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { t } = useTranslation();

  useEffect(() => {
    tabRefs.current[activeTab]?.focus();
  }, [activeTab]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    setActiveTab(nextIndex);
  };

  return (
    <div className="mission-view">
      <nav className="tab-nav" role="tablist" aria-label={t('tabs.missionSections')}>
        {tabs.map((tab, index) => {
          const tabId = `mission-tab-${tab.id}`;
          const panelId = `mission-panel-${tab.id}`;

          return (
            <button
              key={tab.id}
              ref={(element) => { tabRefs.current[index] = element; }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={activeTab === index}
              aria-controls={panelId}
              tabIndex={activeTab === index ? 0 : -1}
              className={`tab-button ${activeTab === index ? 'active' : ''}`}
              onClick={() => setActiveTab(index)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {t(`tabs.${tab.id}`)}
            </button>
          );
        })}
      </nav>

      {tabs.map((tab, index) => {
        const Tab = tab.component;
        const tabId = `mission-tab-${tab.id}`;
        const panelId = `mission-panel-${tab.id}`;
        const isActive = activeTab === index;

        return (
          <div
            key={tab.id}
            id={panelId}
            className="tab-content"
            role="tabpanel"
            aria-labelledby={tabId}
            tabIndex={0}
            hidden={!isActive}
          >
            {isActive && (
              <Suspense fallback={<div className="tab-loading" role="status" aria-live="polite">{t('tabs.loading')}</div>}>
                <Tab mission={mission} settings={settings} />
              </Suspense>
            )}
          </div>
        );
      })}
    </div>
  );
}
