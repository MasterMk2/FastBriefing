import type { MissionData, DisplaySettings } from '../types/mission';
import { formatAltitude, formatPressure, formatTemperature, formatSpeed, formatDistance } from '../utils/coordinates';

interface OverviewTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function OverviewTab({ mission, settings }: OverviewTabProps) {
  const { meta, weather, coalitions } = mission;
  const blueFlights = coalitions.blue.flights.length;
  const redFlights = coalitions.red.flights.length;
  const totalFlights = blueFlights + redFlights;
  
  const startDate = new Date(
    meta.date.Year,
    meta.date.Month - 1,
    meta.date.Day,
    Math.floor(meta.startTime / 3600),
    Math.floor((meta.startTime % 3600) / 60)
  );
  
  return (
    <div className="tab-panel overview">
      <section className="section">
        <h2>ミッション概要</h2>
        <dl className="info-grid">
          <dt>ソーティ名</dt>
          <dd>{meta.sortie}</dd>
          
          <dt>マップ</dt>
          <dd>{meta.theatre}</dd>
          
          <dt>日付</dt>
          <dd>{meta.date.Year}-{String(meta.date.Month).padStart(2, '0')}-{String(meta.date.Day).padStart(2, '0')}</dd>
          
          <dt>開始時刻 (Local)</dt>
          <dd>{startDate.toLocaleString()}</dd>
          
          <dt>開始時刻 (Zulu)</dt>
          <dd>{new Date(startDate.getTime() - meta.utcOffset * 3600000).toISOString().slice(11, 16)}Z</dd>
          
          <dt>MEバージョン</dt>
          <dd>{meta.meVersion}</dd>
          
          <dt>青側フライト</dt>
          <dd>{blueFlights}</dd>
          
          <dt>赤側フライト</dt>
          <dd>{redFlights}</dd>
          
          <dt>総フライト数</dt>
          <dd>{totalFlights}</dd>
        </dl>
      </section>
      
      <section className="section">
        <h2>天候</h2>
        <dl className="info-grid">
          <dt>気温</dt>
          <dd>{formatTemperature(weather.temperature, settings.temperatureUnit)}</dd>
          
          <dt>QNH</dt>
          <dd>{formatPressure(weather.qnh.mmHg, settings.pressureUnit)}</dd>
          
          <dt>視程</dt>
          <dd>{formatDistance(weather.visibility, settings.distanceUnit)}</dd>
          
          <dt>雲</dt>
          <dd>{weather.clouds.label} (底: {formatAltitude(weather.clouds.base, settings.altitudeUnit)})</dd>
          
          {weather.fog.enabled && (
            <>
              <dt>霧</dt>
              <dd>厚さ: {formatAltitude(weather.fog.thickness, settings.altitudeUnit)}, 視程: {formatDistance(weather.fog.visibility, settings.distanceUnit)}</dd>
            </>
          )}
          
          {weather.dust.enabled && (
            <>
              <dt>砂塵</dt>
              <dd>濃度: {weather.dust.density}</dd>
            </>
          )}
          
          <dt>地上乱気流</dt>
          <dd>{weather.turbulence.ground}</dd>
        </dl>
        
        <h3>風</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>高度</th>
              <th>風向 (FROM)</th>
              <th>風向 (TO)</th>
              <th>風速</th>
            </tr>
          </thead>
          <tbody>
            {weather.wind.map(w => (
              <tr key={w.level}>
                <td>{w.level === 'ground' ? '地上' : w.level === '2000' ? '2000m' : '8000m'}</td>
                <td>{w.from}°</td>
                <td>{w.to}°</td>
                <td>{formatSpeed(w.speed, settings.speedUnit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      
      {(meta.descriptionBlueTask || meta.descriptionRedTask || meta.descriptionNeutralTask) && (
        <section className="section">
          <h2>タスク文</h2>
          {meta.descriptionBlueTask && (
            <div className="task-text blue">
              <h3>青側</h3>
              <pre>{meta.descriptionBlueTask}</pre>
            </div>
          )}
          {meta.descriptionRedTask && (
            <div className="task-text red">
              <h3>赤側</h3>
              <pre>{meta.descriptionRedTask}</pre>
            </div>
          )}
          {meta.descriptionNeutralTask && (
            <div className="task-text neutral">
              <h3>中立</h3>
              <pre>{meta.descriptionNeutralTask}</pre>
            </div>
          )}
        </section>
      )}
      
      {mission.warnings.length > 0 && (
        <section className="section warnings">
          <h2>⚠️ 警告</h2>
          <ul>
            {mission.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}