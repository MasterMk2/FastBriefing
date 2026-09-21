import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, KeyboardEvent, LazyExoticComponent } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplaySettings, MissionData, UserNotes } from '../types/mission';
import type { BriefingSection } from '../utils/briefingSections';
import { getMissionWhiteboardId, useWhiteboard } from '../hooks/useWhiteboard';
import { useSettings } from '../hooks/useSettings';
import {
  getNativePrintBlockReason,
  installPrintReadinessGuard,
  shouldResetPrintMapOnExportActivation,
} from '../utils/printReadiness';
import BriefingPlanner from './BriefingPlanner';
import PrintView from './PrintView';
import type { MissionMapRenderState } from './MissionMapCanvas';

const OverviewTab = lazy(() => import('./OverviewTab'));
const FlightsTab = lazy(() => import('./FlightsTab'));
const MapTab = lazy(() => import('./MapTab'));
const CommsTab = lazy(() => import('./CommsTab'));
const SupportTab = lazy(() => import('./SupportTab'));
const ThreatsTab = lazy(() => import('./ThreatsTab'));
const NotesTab = lazy(() => import('./NotesTab'));
const WhiteboardTab = lazy(() => import('./WhiteboardTab'));
const ExportTab = lazy(() => import('./ExportTab'));

interface MissionViewProps {
  mission: MissionData;
  settings: DisplaySettings;
  sourceFile: File | null;
  onNotesChange: (notes: UserNotes) => void;
  storageFailed: boolean;
}

interface StandardTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

type StandardSection = Exclude<BriefingSection, 'notes' | 'whiteboard'>;
type MissionTabId = BriefingSection | 'export';

const standardTabs: ReadonlyArray<{
  id: StandardSection;
  component: LazyExoticComponent<ComponentType<StandardTabProps>>;
}> = [
  { id: 'overview', component: OverviewTab },
  { id: 'flights', component: FlightsTab },
  { id: 'map', component: MapTab },
  { id: 'comms', component: CommsTab },
  { id: 'support', component: SupportTab },
  { id: 'threats', component: ThreatsTab },
];

export default function MissionView(props: MissionViewProps) {
  const missionId = getMissionWhiteboardId(props.mission);
  return <MissionWorkspace key={missionId} {...props} />;
}

function MissionWorkspace({ mission, settings, sourceFile, onNotesChange, storageFailed }: MissionViewProps) {
  const { t } = useTranslation();
  const { setBriefingSections, setBriefingPresets } = useSettings();
  const whiteboard = useWhiteboard(mission);
  const visibleTabIds = useMemo<MissionTabId[]>(() => [
    ...settings.briefingSections,
    'export',
  ], [settings.briefingSections]);
  const [activeTab, setActiveTab] = useState<MissionTabId>(() => visibleTabIds[0] ?? 'export');
  const tabRefs = useRef<Partial<Record<MissionTabId, HTMLButtonElement | null>>>({});
  const hasPrintMap = settings.briefingSections.includes('map');
  const printMapKey = `${mission.sourceFingerprint}:${settings.viewMode}:${settings.outputLanguage}`;
  const [printMapRender, setPrintMapRender] = useState<{ key: string; state: MissionMapRenderState }>({
    key: '', state: 'loading',
  });
  const printMapState: MissionMapRenderState = !hasPrintMap
    ? 'ready'
    : printMapRender.key === printMapKey ? printMapRender.state : 'loading';
  const printBlockReason = getNativePrintBlockReason(activeTab === 'export', hasPrintMap, printMapState);
  const printBlocked = printBlockReason !== null;

  const activateTab = useCallback((tabId: MissionTabId) => {
    if (shouldResetPrintMapOnExportActivation(activeTab === 'export', tabId === 'export', hasPrintMap)) {
      setPrintMapRender({ key: printMapKey, state: 'loading' });
    }
    setActiveTab(tabId);
  }, [activeTab, hasPrintMap, printMapKey]);

  const handlePrintMapStateChange = useCallback((state: MissionMapRenderState) => {
    setPrintMapRender({ key: printMapKey, state });
  }, [printMapKey]);

  useLayoutEffect(() => installPrintReadinessGuard(
    window,
    document.documentElement,
    () => printBlocked,
  ), [printBlocked]);

  useEffect(() => {
    if (!visibleTabIds.includes(activeTab)) activateTab(visibleTabIds[0] ?? 'export');
  }, [activeTab, activateTab, visibleTabIds]);

  useEffect(() => {
    tabRefs.current[activeTab]?.focus();
  }, [activeTab]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % visibleTabIds.length;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + visibleTabIds.length) % visibleTabIds.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = visibleTabIds.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    activateTab(visibleTabIds[nextIndex]);
  };

  const renderTab = (tabId: MissionTabId) => {
    if (tabId === 'notes') {
      return (
        <NotesTab
          mission={mission}
          settings={settings}
          onNotesChange={onNotesChange}
          storageFailed={storageFailed}
        />
      );
    }
    if (tabId === 'whiteboard') {
      return (
        <WhiteboardTab
          sourceFingerprint={mission.sourceFingerprint}
          data={whiteboard.data}
          persistenceStatus={whiteboard.persistenceStatus}
          canUndo={whiteboard.canUndo}
          onNotesChange={whiteboard.setNotes}
          onAddStroke={whiteboard.addStroke}
          onUndoStroke={whiteboard.undoStroke}
          onClearDrawing={whiteboard.clearDrawing}
          onReplaceData={whiteboard.replaceData}
        />
      );
    }
    if (tabId === 'export') {
      return (
        <ExportTab
          mission={mission}
          settings={settings}
          sourceFile={sourceFile}
          whiteboard={whiteboard.data}
          printMapState={printMapState}
        />
      );
    }

    const definition = standardTabs.find(tab => tab.id === tabId);
    if (!definition) return null;
    const Tab = definition.component;
    return <Tab mission={mission} settings={settings} />;
  };

  return (
    <div className="mission-view">
      <BriefingPlanner
        selected={settings.briefingSections}
        presets={settings.briefingPresets}
        onChange={setBriefingSections}
        onPresetsChange={setBriefingPresets}
      />

      <nav className="tab-nav" role="tablist" aria-label={t('tabs.missionSections')}>
        {visibleTabIds.map((tabId, index) => {
          const tabDomId = `mission-tab-${tabId}`;
          const panelId = `mission-panel-${tabId}`;
          return (
            <button
              key={tabId}
              ref={(element) => { tabRefs.current[tabId] = element; }}
              id={tabDomId}
              type="button"
              role="tab"
              aria-selected={activeTab === tabId}
              aria-controls={panelId}
              tabIndex={activeTab === tabId ? 0 : -1}
              className={`tab-button ${activeTab === tabId ? 'active' : ''}`}
              onClick={() => activateTab(tabId)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {t(`tabs.${tabId}`)}
            </button>
          );
        })}
      </nav>

      {visibleTabIds.map(tabId => {
        const tabDomId = `mission-tab-${tabId}`;
        const panelId = `mission-panel-${tabId}`;
        const isActive = activeTab === tabId;
        return (
          <div
            key={tabId}
            id={panelId}
            className="tab-content"
            role="tabpanel"
            aria-labelledby={tabDomId}
            tabIndex={0}
            hidden={!isActive}
          >
            {isActive && (
              <Suspense fallback={<div className="tab-loading" role="status" aria-live="polite">{t('tabs.loading')}</div>}>
                {renderTab(tabId)}
              </Suspense>
            )}
          </div>
        );
      })}

      <div className="print-briefing">
        <div className="print-map-blocked-message" role="alert">
          {printBlockReason === 'export-unavailable'
            ? t('export.nativePrintOpenExport')
            : t(printMapState === 'error' ? 'export.printMapFailed' : 'export.printMapLoading')}
        </div>
        {activeTab === 'export' && (
          <PrintView
            mission={mission}
            settings={settings}
            whiteboard={whiteboard.data}
            onMapRenderStateChange={handlePrintMapStateChange}
          />
        )}
      </div>
    </div>
  );
}
