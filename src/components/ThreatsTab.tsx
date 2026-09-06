import type { AIGroup, MissionData, DisplaySettings } from '../types/mission';
import { dcsToLatLon, formatCoordinate } from '../utils/coordinates';
import { formatDistance } from '../utils/units';

interface ThreatsTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function ThreatsTab({ mission, settings }: ThreatsTabProps) {
  const allEnemies = mission.coalitions.red.aiGroups;
  const threats = allEnemies.filter(hasResolvedThreatRange);
  const unrecordedThreats = allEnemies.filter(isUnrecordedThreat);
  const otherEnemies = allEnemies.filter(g => !hasResolvedThreatRange(g) && !isUnrecordedThreat(g));
  const threatWarnings = [...new Set(mission.warnings.filter(warning => warning.includes('脅威半径')))];
  
  return (
    <div className="tab-panel threats">
      <section className="section">
        <h3>SAM / AAA 脅威リング</h3>
        {threats.length === 0 ? (
          <p>脅威リングを持つユニットがありません</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>機種</th>
                <th>数</th>
                <th>脅威半径</th>
                <th>位置</th>
                <th>Hidden</th>
                <th>Late Activation</th>
              </tr>
            </thead>
            <tbody>
              {threats.map((t, i) => (
                <tr key={groupKey(t, i)}>
                  <td>{t.type}</td>
                  <td>{t.count}</td>
                  <td>{formatDistance(t.threatRange!, settings.distanceUnit)}</td>
                  <td>{formatThreatPosition(t, mission.meta.theatre, settings.coordinateFormat)}</td>
                  <td>{t.hidden ? 'Yes' : 'No'}</td>
                  <td>{t.lateActivation ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {unrecordedThreats.length > 0 && (
          <div className="threats-unrecorded">
            <h4>脅威半径未収録（地図に描画できません）</h4>
            <p>参照データに脅威半径がないため、半径 0 m のままです。位置と機種だけを表示します。</p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>機種</th>
                  <th>数</th>
                  <th>脅威半径</th>
                  <th>位置</th>
                  <th>Hidden</th>
                  <th>Late Activation</th>
                </tr>
              </thead>
              <tbody>
                {unrecordedThreats.map((t, i) => (
                  <tr key={groupKey(t, i)}>
                    <td>{t.type}</td>
                    <td>{t.count}</td>
                    <td>未収録</td>
                    <td>{formatThreatPosition(t, mission.meta.theatre, settings.coordinateFormat)}</td>
                    <td>{t.hidden ? 'Yes' : 'No'}</td>
                    <td>{t.lateActivation ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {threatWarnings.length > 0 && (
          <aside className="warning" aria-label="脅威半径の参照データ警告">
            <strong>参照データ警告</strong>
            <ul>
              {threatWarnings.map(warning => <li key={warning}>{warning}</li>)}
            </ul>
          </aside>
        )}
      </section>
      
      <section className="section">
        <h3>敵航空機グループ</h3>
        {otherEnemies.length === 0 ? (
          <p>敵航空機グループがありません</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>カテゴリ</th>
                <th>機種</th>
                <th>数</th>
                <th>位置</th>
                <th>出現時刻</th>
                <th>Hidden</th>
              </tr>
            </thead>
            <tbody>
              {otherEnemies.map((g, i) => (
                <tr key={groupKey(g, i)}>
                  <td>{g.category}</td>
                  <td>{g.type}</td>
                  <td>{g.count}</td>
                  <td>{formatThreatPosition(g, mission.meta.theatre, settings.coordinateFormat)}</td>
                  <td>{formatTime(g.startTime)}</td>
                  <td>{g.hidden ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      
      <section className="section">
        <h3>敵艦艇</h3>
        <p>実装予定</p>
      </section>
    </div>
  );
}

function hasResolvedThreatRange(group: AIGroup): boolean {
  return Number.isFinite(group.threatRange)
    && (group.threatRange ?? 0) > 0
    && group.threatRangeSource !== 'unknown';
}

function isUnrecordedThreat(group: AIGroup): boolean {
  if (group.threatRangeSource === 'unknown') return true;
  if (group.threatRangeSource === 'reference' || group.threatRangeSource === 'detection') return false;

  const category = group.category.trim().toLowerCase();
  const isThreatCandidate = category === 'vehicle' || category === 'ship';
  if (!isThreatCandidate || hasResolvedThreatRange(group)) return false;

  return !Number.isFinite(group.threatRange)
    || (group.threatRange ?? 0) <= 0;
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

function formatTime(seconds: number): string {
  if (seconds === 0) return 'Mission Start';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `T+${h}h ${m}m`;
}
