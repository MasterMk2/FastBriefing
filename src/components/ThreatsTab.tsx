import type { MissionData, DisplaySettings } from '../types/mission';
import { formatDistance } from '../utils/units';

interface ThreatsTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function ThreatsTab({ mission, settings }: ThreatsTabProps) {
  const threats = mission.coalitions.red.aiGroups.filter(g => g.threatRange && g.threatRange > 0);
  const otherEnemies = mission.coalitions.red.aiGroups.filter(g => !g.threatRange || g.threatRange === 0);
  
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
                <tr key={i}>
                  <td>{t.type}</td>
                  <td>{t.count}</td>
                  <td>{formatDistance(t.threatRange!, settings.distanceUnit)}</td>
                  <td>{t.position[0].toFixed(2)}, {t.position[1].toFixed(2)}</td>
                  <td>{t.hidden ? 'Yes' : 'No'}</td>
                  <td>{t.lateActivation ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <tr key={i}>
                  <td>{g.category}</td>
                  <td>{g.type}</td>
                  <td>{g.count}</td>
                  <td>{g.position[0].toFixed(2)}, {g.position[1].toFixed(2)}</td>
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

function formatTime(seconds: number): string {
  if (seconds === 0) return 'Mission Start';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `T+${h}h ${m}m`;
}