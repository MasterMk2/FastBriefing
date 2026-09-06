import type { MissionData, DisplaySettings, SupportAsset } from '../types/mission';
import { dcsToLatLon, formatCoordinate } from '../utils/coordinates';
import { formatAltitude, formatSpeed } from '../utils/units';

interface SupportTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function SupportTab({ mission, settings }: SupportTabProps) {
  const allSupport = [...mission.coalitions.blue.support, ...mission.coalitions.red.support];
  
  if (allSupport.length === 0) {
    return (
      <div className="tab-panel support">
        <p>支援機がありません</p>
      </div>
    );
  }
  
  return (
    <div className="tab-panel support">
      {allSupport.map((s, i) => (
        <section key={i} className="section support-asset">
          <header className="support-header">
            <h3>{s.kind.toUpperCase()}: {s.callsign}</h3>
            <span className="badge">{s.kind}</span>
          </header>
          
          <dl className="info-grid">
            <dt>コールサイン</dt>
            <dd>{s.callsign}</dd>
            
            {s.frequency && (
              <>
                <dt>周波数</dt>
                <dd>{(s.frequency / 1000000).toFixed(3)} MHz</dd>
              </>
            )}
            
            {s.tacan && (
              <>
                <dt>TACAN</dt>
                <dd>{s.tacan.channel} {s.tacan.mode}</dd>
              </>
            )}
            
            {s.icls && (
              <>
                <dt>ICLS</dt>
                <dd>Channel {s.icls.channel}</dd>
              </>
            )}
            
            {s.orbit && (
              <>
                <dt>軌道高度</dt>
                <dd>{formatAltitude(s.orbit.altitude, settings.altitudeUnit)}</dd>
                <dt>軌道速度</dt>
                <dd>{formatSpeed(s.orbit.speed, settings.speedUnit)}</dd>
                <dt>パターン</dt>
                <dd>{s.orbit.pattern}</dd>
              </>
            )}
            
            <dt>位置</dt>
            <dd>{formatSupportPosition(s, mission.meta.theatre, settings.coordinateFormat)}</dd>
          </dl>
        </section>
      ))}
    </div>
  );
}

function formatSupportPosition(
  support: SupportAsset,
  theatre: string,
  coordinateFormat: DisplaySettings['coordinateFormat'],
): string {
  const latlon = dcsToLatLon(theatre, support.position[0], support.position[1]) || [0, 0];
  return formatCoordinate(latlon[0], latlon[1], coordinateFormat);
}
