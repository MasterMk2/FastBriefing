import type { MissionData, DisplaySettings } from '../types/mission';
import { formatAltitude, formatPressure, formatTemperature, formatSpeed, formatDistance } from '../utils/units';
import { getMoonInfo, getSunTimes, type SunTimes } from '../utils/astro';
import { buildMetar } from '../utils/metar';
import { addSeconds, formatDateYMD, formatTimeHHMM, formatUtcOffset, missionLocalDate, missionZuluDate } from '../utils/time';

interface OverviewTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function OverviewTab({ mission, settings }: OverviewTabProps) {
  const { meta, weather, coalitions } = mission;
  const blueFlights = coalitions.blue.flights.length;
  const redFlights = coalitions.red.flights.length;
  const totalFlights = blueFlights + redFlights;

  const localDate = missionLocalDate(meta);
  const zuluDate = missionZuluDate(meta);
  const referencePoint = coalitions.blue.bullseye.latlon;
  const hasValidReferencePoint = isValidReferencePoint(referencePoint);
  const sunTimes = hasValidReferencePoint
    ? getSunTimes(zuluDate, referencePoint[0], referencePoint[1])
    : null;
  const moonInfo = hasValidReferencePoint
    ? getMoonInfo(zuluDate, referencePoint[0], referencePoint[1])
    : null;
  const metar = buildMetar(weather, { time: zuluDate });
  
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
          <dd>{formatDateYMD(localDate)}</dd>
          
          <dt>開始時刻 (Local)</dt>
          <dd>{formatDateYMD(localDate)} {formatTimeHHMM(localDate)} ({formatUtcOffset(meta.utcOffset)})</dd>
          
          <dt>開始時刻 (Zulu)</dt>
          <dd>{formatDateYMD(zuluDate)} {formatTimeHHMM(zuluDate)}Z</dd>
          
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
          <dd>{formatPressure(weather.qnh, settings.pressureUnit)}</dd>
          
          <dt>視程</dt>
          <dd>{formatDistance(weather.visibility, settings.distanceUnit)}</dd>
          
          <dt>雲</dt>
          <dd>{weather.clouds.label} (底: {formatAltitude(weather.clouds.base, settings.altitudeUnit)})</dd>

          <dt>METAR</dt>
          <dd><code>{metar}</code></dd>
          
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

      <section className="section astro">
        <h2>天文情報</h2>
        <dl className="info-grid">
          <dt>基準点 (Blue Bullseye)</dt>
          <dd>{hasValidReferencePoint ? `${referencePoint[0].toFixed(4)}°, ${referencePoint[1].toFixed(4)}°` : '—'}</dd>

          <dt>日の出</dt>
          <dd>{formatAstroTime(sunTimes?.sunrise, meta.utcOffset)}</dd>

          <dt>日の入り</dt>
          <dd>{formatAstroTime(sunTimes?.sunset, meta.utcOffset)}</dd>

          <dt>市民薄明</dt>
          <dd>{formatAstroRange(sunTimes, 'dawn', 'dusk', meta.utcOffset)}</dd>

          <dt>航空薄明</dt>
          <dd>{formatAstroRange(sunTimes, 'nauticalDawn', 'nauticalDusk', meta.utcOffset)}</dd>

          <dt>月齢</dt>
          <dd>{moonInfo ? `${moonInfo.ageDays.toFixed(1)} 日` : '—'}</dd>
        </dl>
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

function isValidReferencePoint(latlon: [number, number]): boolean {
  const [lat, lon] = latlon;
  return Number.isFinite(lat)
    && Number.isFinite(lon)
    && lat >= -90
    && lat <= 90
    && lon >= -180
    && lon <= 180
    && (lat !== 0 || lon !== 0);
}

function formatAstroTime(date: Date | null | undefined, utcOffset: number): string {
  if (!date) return '—';

  const localDate = addSeconds(date, utcOffset * 3600);
  return `Local ${formatDateYMD(localDate)} ${formatTimeHHMM(localDate)} / Zulu ${formatDateYMD(date)} ${formatTimeHHMM(date)}Z`;
}

function formatAstroRange(
  times: SunTimes | null,
  startKey: 'dawn' | 'nauticalDawn',
  endKey: 'dusk' | 'nauticalDusk',
  utcOffset: number,
): string {
  if (!times) return '—';
  return `${formatAstroTime(times[startKey], utcOffset)} ～ ${formatAstroTime(times[endKey], utcOffset)}`;
}
