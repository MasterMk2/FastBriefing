import type { MissionData, DisplaySettings } from '../types/mission';
import { formatAltitude, formatSpeed } from '../utils/coordinates';

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
            <dd>{s.position[0].toFixed(2)}, {s.position[1].toFixed(2)}</dd>
          </dl>
        </section>
      ))}
    </div>
  );
}