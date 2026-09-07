import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { AIGroup, MissionData, DisplaySettings } from '../types/mission';
import { dcsToLatLon, formatCoordinate } from '../utils/coordinates';
import { formatDistance } from '../utils/units';
import { applyViewMode } from '../utils/viewMode';

interface ThreatsTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function ThreatsTab({ mission, settings }: ThreatsTabProps) {
  const { t } = useTranslation();
  const viewMission = useMemo(() => applyViewMode(mission, settings.viewMode), [mission, settings.viewMode]);
  const allEnemies = viewMission.coalitions.red.aiGroups;
  const threats = allEnemies.filter(hasResolvedThreatRange);
  const unrecordedThreats = allEnemies.filter(isUnrecordedThreat);
  const otherEnemies = allEnemies.filter(g => !hasResolvedThreatRange(g) && !isUnrecordedThreat(g));
  const threatWarnings = [...new Set(mission.warnings.filter(warning => warning.startsWith('脅威半径が未収録')))].sort();
  const unknownUnitWarnings = [...new Set(mission.warnings.filter(warning => warning.startsWith('参照データに未収録のユニット')))].sort();
  const showCreatorDetails = settings.viewMode === 'creator';
  
  return (
    <div className="tab-panel threats">
      <section className="section">
        <h3>{t('threats.samRing')}</h3>
        {threats.length === 0 ? (
          <p>{t('threats.noThreats')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('threats.type')}</th>
                <th>{t('threats.count')}</th>
                <th>{t('threats.engagementRange')}</th>
                <th>{t('threats.detectionRange')}</th>
                <th>{t('threats.position')}</th>
                {showCreatorDetails && <th>{t('threats.hidden')}</th>}
                {showCreatorDetails && <th>{t('threats.lateActivation')}</th>}
              </tr>
            </thead>
            <tbody>
              {threats.map((threat, i) => (
                <tr key={groupKey(threat, i)}>
                  <td>{threat.type}</td>
                  <td>{threat.count}</td>
                  <td>{formatThreatRange(threat.threatRange, settings, t)}</td>
                  <td>{formatThreatRange(threat.detectionRange, settings, t)}</td>
                  <td>{formatThreatPosition(threat, mission.meta.theatre, settings.coordinateFormat)}</td>
                  {showCreatorDetails && <td>{threat.hidden ? t('common.yes') : t('common.no')}</td>}
                  {showCreatorDetails && <td>{threat.lateActivation ? t('common.yes') : t('common.no')}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {unrecordedThreats.length > 0 && (
          <div className="threats-unrecorded">
            <h4>{t('threats.unrecordedTitle')}</h4>
            <p>{t('threats.unrecordedDescription')}</p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('threats.type')}</th>
                  <th>{t('threats.count')}</th>
                  <th>{t('threats.engagementRange')}</th>
                  <th>{t('threats.detectionRange')}</th>
                  <th>{t('threats.position')}</th>
                  {showCreatorDetails && <th>{t('threats.hidden')}</th>}
                  {showCreatorDetails && <th>{t('threats.lateActivation')}</th>}
                </tr>
              </thead>
              <tbody>
                {unrecordedThreats.map((threat, i) => (
                  <tr key={groupKey(threat, i)}>
                    <td>{threat.type}</td>
                    <td>{threat.count}</td>
                    <td>{t('threats.unrecorded')}</td>
                    <td>{t('threats.unrecorded')}</td>
                    <td>{formatThreatPosition(threat, mission.meta.theatre, settings.coordinateFormat)}</td>
                    {showCreatorDetails && <td>{threat.hidden ? t('common.yes') : t('common.no')}</td>}
                    {showCreatorDetails && <td>{threat.lateActivation ? t('common.yes') : t('common.no')}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {threatWarnings.length > 0 && (
          <aside className="warning" aria-label={t('threats.threatRadiusWarningAria')}>
            <strong>{t('threats.threatRadiusWarning')}</strong>
            <ul>
              {threatWarnings.map(warning => <li key={warning}>{warning}</li>)}
            </ul>
          </aside>
        )}

        {unknownUnitWarnings.length > 0 && (
          <aside className="warning" aria-label={t('threats.unknownUnitWarningAria')}>
            <strong>{t('threats.unknownUnitWarning')}</strong>
            <ul>
              {unknownUnitWarnings.map(warning => <li key={warning}>{warning}</li>)}
            </ul>
          </aside>
        )}
      </section>
      
      {showCreatorDetails && (
        <section className="section">
          <h3>{t('threats.enemyAircraft')}</h3>
          {otherEnemies.length === 0 ? (
            <p>{t('threats.noEnemyAircraft')}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('threats.category')}</th>
                  <th>{t('threats.type')}</th>
                  <th>{t('threats.count')}</th>
                  <th>{t('threats.position')}</th>
                  <th>{t('threats.appearance')}</th>
                  <th>{t('threats.hidden')}</th>
                </tr>
              </thead>
              <tbody>
                {otherEnemies.map((g, i) => (
                  <tr key={groupKey(g, i)}>
                    <td>{g.category}</td>
                    <td>{g.type}</td>
                    <td>{g.count}</td>
                    <td>{formatThreatPosition(g, viewMission.meta.theatre, settings.coordinateFormat)}</td>
                    <td>{formatTime(g.startTime, t)}</td>
                    <td>{g.hidden ? t('common.yes') : t('common.no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      
      <section className="section">
        <h3>{t('threats.enemyShips')}</h3>
        <p>{t('threats.planned')}</p>
      </section>
    </div>
  );
}

function hasResolvedThreatRange(group: AIGroup): boolean {
  const hasEngagementRange = Number.isFinite(group.threatRange)
    && (group.threatRange ?? 0) > 0;
  const hasDetectionRange = Number.isFinite(group.detectionRange)
    && (group.detectionRange ?? 0) > 0;
  return hasEngagementRange || hasDetectionRange;
}

function isUnrecordedThreat(group: AIGroup): boolean {
  if (hasResolvedThreatRange(group)) return false;
  if (group.threatRangeSource === 'unknown') return true;
  if (group.threatRangeSource === 'reference' || group.threatRangeSource === 'detection') return false;

  const category = group.category.trim().toLowerCase();
  const isThreatCandidate = category === 'vehicle' || category === 'ship';
  if (!isThreatCandidate || hasResolvedThreatRange(group)) return false;

  const hasNoEngagementRange = !Number.isFinite(group.threatRange) || (group.threatRange ?? 0) <= 0;
  const hasNoDetectionRange = !Number.isFinite(group.detectionRange) || (group.detectionRange ?? 0) <= 0;
  return hasNoEngagementRange && hasNoDetectionRange;
}

function formatThreatRange(range: number | undefined, settings: DisplaySettings, t: TFunction): string {
  if (Number.isFinite(range) && (range ?? 0) > 0) return formatDistance(range!, settings.distanceUnit);
  return t('threats.none');
}

function groupKey(group: AIGroup, occurrence: number): string {
  return `${group.category}:${group.type}:${group.position.join(',')}:${group.startTime}:${occurrence}`;
}

function formatThreatPosition(
  group: AIGroup,
  theatre: string,
  coordinateFormat: DisplaySettings['coordinateFormat'],
): string {
  const latlon = dcsToLatLon(theatre, group.position[0], group.position[1]) || [0, 0];
  return formatCoordinate(latlon[0], latlon[1], coordinateFormat);
}

function formatTime(seconds: number, t: TFunction): string {
  if (seconds === 0) return t('common.missionStart');
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return t('common.timeOffset', { hours: h, minutes: m });
}
