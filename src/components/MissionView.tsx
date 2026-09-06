import { useState } from 'react';
import type { MissionData, DisplaySettings } from '../types/mission';
import OverviewTab from './OverviewTab';
import FlightsTab from './FlightsTab';
import MapTab from './MapTab';
import CommsTab from './CommsTab';
import SupportTab from './SupportTab';
import ThreatsTab from './ThreatsTab';
import ExportTab from './ExportTab';

interface MissionViewProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function MissionView({ mission, settings }: MissionViewProps) {
  const [activeTab, setActiveTab] = useState(0);
  
  const tabs = [
    { id: 'overview', label: '概要', component: <OverviewTab mission={mission} settings={settings} /> },
    { id: 'flights', label: 'フライト', component: <FlightsTab mission={mission} settings={settings} /> },
    { id: 'map', label: '地図', component: <MapTab mission={mission} settings={settings} /> },
    { id: 'comms', label: '通信', component: <CommsTab mission={mission} settings={settings} /> },
    { id: 'support', label: '支援機', component: <SupportTab mission={mission} settings={settings} /> },
    { id: 'threats', label: '脅威', component: <ThreatsTab mission={mission} settings={settings} /> },
    { id: 'export', label: '出力', component: <ExportTab mission={mission} settings={settings} /> },
  ];
  
  return (
    <div className="mission-view">
      <nav className="tab-nav" role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === index}
            className={`tab-button ${activeTab === index ? 'active' : ''}`}
            onClick={() => setActiveTab(index)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      
      <div className="tab-content" role="tabpanel">
        {tabs[activeTab].component}
      </div>
    </div>
  );
}