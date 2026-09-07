import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { MissionData, DisplaySettings } from '../types/mission';
import { formatAltitude, formatPressure, formatTemperature, formatSpeed, formatDistance } from '../utils/units';
import { getMoonInfo, getSunTimes, type SunTimes } from '../utils/astro';
import { buildMetar } from '../utils/metar';
import { addSeconds, formatDateYMD, formatTimeHHMM, formatUtcOffset, missionLocalDate, missionZuluDate } from '../utils/time';
import { applyViewMode } from '../utils/viewMode';

interface OverviewTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function OverviewTab({ mission, settings }: OverviewTabProps) {
  const { t } = useTranslation();
  const viewMission = useMemo(() => applyViewMode(mission, settings.viewMode), [mission, settings.viewMode]);
  const { meta, weather, coalitions } = viewMission;
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
        <h2>{t('overview.title')}</h2>
        <dl className="info-grid">
          <div className="info-grid-item">
            <dt>{t('overview.sortie')}</dt>
            <dd>{formatOptionalText(meta.sortie, t('common.notAvailable'))}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.map')}</dt>
            <dd>{formatOptionalText(meta.theatre, t('common.notAvailable'))}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.date')}</dt>
            <dd>{formatDateYMD(localDate)}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.startLocal')}</dt>
            <dd>{formatDateYMD(localDate)} {formatTimeHHMM(localDate)} ({formatUtcOffset(meta.utcOffset)})</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.startZulu')}</dt>
            <dd>{formatDateYMD(zuluDate)} {formatTimeHHMM(zuluDate)}Z</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.meVersion')}</dt>
            <dd>{formatOptionalText(meta.meVersion, t('common.notAvailable'))}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.blueFlights')}</dt>
            <dd>{blueFlights}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.redFlights')}</dt>
            <dd>{redFlights}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.totalFlights')}</dt>
            <dd>{totalFlights}</dd>
          </div>
        </dl>
      </section>
      
      <section className="section">
        <h2>{t('overview.weather')}</h2>
        <dl className="info-grid">
          <div className="info-grid-item">
            <dt>{t('overview.temperature')}</dt>
            <dd>{formatTemperature(weather.temperature, settings.temperatureUnit)}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.qnh')}</dt>
            <dd>{formatPressure(weather.qnh, settings.pressureUnit)}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.visibility')}</dt>
            <dd>{formatDistance(weather.visibility, settings.distanceUnit)}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.clouds')}</dt>
            <dd>{formatOptionalText(weather.clouds.label, t('common.notAvailable'))} ({t('overview.cloudBase', { value: formatAltitude(weather.clouds.base, settings.altitudeUnit) })})</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.metar')}</dt>
            <dd><code>{formatOptionalText(metar, t('common.notAvailable'))}</code></dd>
          </div>
          {weather.fog.enabled && (
            <div className="info-grid-item">
              <dt>{t('overview.fog')}</dt>
              <dd>{t('overview.fogDetails', { thickness: formatAltitude(weather.fog.thickness, settings.altitudeUnit), visibility: formatDistance(weather.fog.visibility, settings.distanceUnit) })}</dd>
            </div>
          )}
          {weather.dust.enabled && (
            <div className="info-grid-item">
              <dt>{t('overview.dust')}</dt>
              <dd>{t('overview.dustDensity', { value: weather.dust.density })}</dd>
            </div>
          )}
          <div className="info-grid-item">
            <dt>{t('overview.groundTurbulence')}</dt>
            <dd>{formatGroundTurbulence(weather.turbulence.ground, t)}</dd>
          </div>
        </dl>
        
        <h3>{t('overview.wind')}</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('overview.altitude')}</th>
              <th>{t('overview.windFrom')}</th>
              <th>{t('overview.windTo')}</th>
              <th>{t('overview.windSpeed')}</th>
            </tr>
          </thead>
          <tbody>
            {weather.wind.map(w => (
              <tr key={w.level}>
                <td>{t(`overview.windLevels.${w.level}`)}</td>
                <td>{formatWindDirection(w.from, t('common.notAvailable'))}</td>
                <td>{formatWindDirection(w.to, t('common.notAvailable'))}</td>
                <td>{formatSpeed(w.speed, settings.speedUnit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section astro">
        <h2>{t('overview.astronomy')}</h2>
        <dl className="info-grid">
          <div className="info-grid-item">
            <dt>{t('overview.bullseye')}</dt>
            <dd>{hasValidReferencePoint ? `${referencePoint[0].toFixed(4)}°, ${referencePoint[1].toFixed(4)}°` : t('common.notAvailable')}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.sunrise')}</dt>
            <dd>{formatAstroTime(sunTimes?.sunrise, meta.utcOffset, t)}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.sunset')}</dt>
            <dd>{formatAstroTime(sunTimes?.sunset, meta.utcOffset, t)}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.civilTwilight')}</dt>
            <dd>{formatAstroRange(sunTimes, 'dawn', 'dusk', meta.utcOffset, t)}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.nauticalTwilight')}</dt>
            <dd>{formatAstroRange(sunTimes, 'nauticalDawn', 'nauticalDusk', meta.utcOffset, t)}</dd>
          </div>
          <div className="info-grid-item">
            <dt>{t('overview.moonAge')}</dt>
            <dd>{moonInfo ? t('overview.moonAgeDays', { days: moonInfo.ageDays.toFixed(1) }) : t('common.notAvailable')}</dd>
          </div>
        </dl>
      </section>
      
      {(meta.descriptionBlueTask || meta.descriptionRedTask || meta.descriptionNeutralTask) && (
        <section className="section">
          <h2>{t('overview.taskText')}</h2>
          {meta.descriptionBlueTask && (
            <div className="task-text blue">
              <h3>{t('flights.selectBlue')}</h3>
              <pre>{meta.descriptionBlueTask}</pre>
            </div>
          )}
          {meta.descriptionRedTask && (
            <div className="task-text red">
              <h3>{t('flights.selectRed')}</h3>
              <pre>{meta.descriptionRedTask}</pre>
            </div>
          )}
          {meta.descriptionNeutralTask && (
            <div className="task-text neutral">
              <h3>{t('overview.neutral')}</h3>
              <pre>{meta.descriptionNeutralTask}</pre>
            </div>
          )}
        </section>
      )}
      
      {mission.warnings.length > 0 && (
        <section className="section warnings">
          <h2>{t('overview.warning')}</h2>
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

function formatOptionalText(value: string | number | null | undefined, fallback: string): string | number {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function formatGroundTurbulence(value: number, t: TFunction): string {
  if (!Number.isFinite(value)) return t('common.notAvailable');
  if (value === 0) return t('common.none');
  return t('overview.groundTurbulenceValue', { value: value.toFixed(1) });
}

function formatWindDirection(value: number, fallback: string): string {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  const normalized = ((rounded % 360) + 360) % 360;
  return `${normalized}°`;
}

function formatAstroTime(date: Date | null | undefined, utcOffset: number, t: TFunction): string {
  if (!date) return t('common.notAvailable');

  const localDate = addSeconds(date, utcOffset * 3600);
  return `${t('common.local')} ${formatDateYMD(localDate)} ${formatTimeHHMM(localDate)} / ${t('common.zulu')} ${formatDateYMD(date)} ${formatTimeHHMM(date)}Z`;
}

function formatAstroRange(
  times: SunTimes | null,
  startKey: 'dawn' | 'nauticalDawn',
  endKey: 'dusk' | 'nauticalDusk',
  utcOffset: number,
  t: TFunction,
): string {
  if (!times) return t('common.notAvailable');
  return `${formatAstroTime(times[startKey], utcOffset, t)}${t('common.rangeSeparator')}${formatAstroTime(times[endKey], utcOffset, t)}`;
}
