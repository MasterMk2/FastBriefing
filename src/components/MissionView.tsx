import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
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
  { id: 'overview', label: '概要', component: OverviewTab },
  { id: 'flights', label: 'フライト', component: FlightsTab },
  { id: 'map', label: '地図', component: MapTab },
  { id: 'comms', label: '通信', component: CommsTab },
  { id: 'support', label: '支援機', component: SupportTab },
  { id: 'threats', label: '脅威', component: ThreatsTab },
  { id: 'export', label: '出力', component: ExportTab },
] as const;

export default function MissionView({ mission, settings }: MissionViewProps) {
  const [activeTab, setActiveTab] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

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
      <nav className="tab-nav" role="tablist" aria-label="ミッションセクション">
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
              {tab.label}
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
              <Suspense fallback={<div className="tab-loading" role="status" aria-live="polite">タブを読み込み中...</div>}>
                <Tab mission={mission} settings={settings} />
              </Suspense>
            )}
          </div>
        );
      })}
    </div>
  );
}
